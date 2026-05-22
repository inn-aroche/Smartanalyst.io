// Tests pour oauth-state service (state JWT du flux OAuth).

process.env.JWT_SECRET = 'a_test_secret_at_least_32_characters_long_for_jwt_signing'
process.env.LOG_LEVEL = 'fatal'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')

const oauthState = require('../src/services/auth/oauth-state.service')

test('sign + verify round-trip preserves payload', () => {
  const state = oauthState.sign({
    userId: 'u-1',
    workspaceId: 'ws-1',
    source: 'ga4',
    accountId: '12345',
    accountName: 'Prop A',
  })
  const decoded = oauthState.verify(state)
  assert.equal(decoded.userId, 'u-1')
  assert.equal(decoded.workspaceId, 'ws-1')
  assert.equal(decoded.source, 'ga4')
  assert.equal(decoded.accountId, '12345')
  assert.equal(decoded.accountName, 'Prop A')
  assert.equal(decoded.type, 'oauth_state')
})

test('verify rejects empty/missing state with OAUTH_STATE_MISSING', () => {
  assert.throws(() => oauthState.verify(null), (err) => err.code === 'OAUTH_STATE_MISSING')
  assert.throws(() => oauthState.verify(''), (err) => err.code === 'OAUTH_STATE_MISSING')
})

test('verify rejects garbage with OAUTH_STATE_INVALID', () => {
  assert.throws(() => oauthState.verify('not.a.jwt'), (err) => err.code === 'OAUTH_STATE_INVALID')
})

test('verify rejects a JWT with wrong type', () => {
  const wrongType = jwt.sign({ type: 'something_else', userId: 'u' }, process.env.JWT_SECRET, {
    expiresIn: '5m',
  })
  assert.throws(() => oauthState.verify(wrongType), (err) => err.code === 'OAUTH_STATE_INVALID')
})

test('verify rejects expired state', () => {
  const expired = jwt.sign(
    { type: 'oauth_state', userId: 'u', workspaceId: 'w', source: 'ga4' },
    process.env.JWT_SECRET,
    { expiresIn: '-1s' },
  )
  assert.throws(
    () => oauthState.verify(expired),
    (err) => err.code === 'OAUTH_STATE_INVALID' && /expir/i.test(err.message),
  )
})

test('accountId/accountName default to null when omitted', () => {
  const state = oauthState.sign({ userId: 'u', workspaceId: 'w', source: 'ga4' })
  const decoded = oauthState.verify(state)
  assert.equal(decoded.accountId, null)
  assert.equal(decoded.accountName, null)
})
