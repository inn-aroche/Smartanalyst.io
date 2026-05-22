// Tests pour BaseConnector.
// Run: node --test tests/base-connector.test.js

const { test } = require('node:test')
const assert = require('node:assert/strict')

const BaseConnector = require('../src/connectors/base.connector')

test('BaseConnector cannot be instantiated directly', () => {
  assert.throws(() => new BaseConnector('ws-id', { id: 'c-id', source: 'ga4' }), /abstract/)
})

test('BaseConnector requires workspaceId', () => {
  class Stub extends BaseConnector {}
  assert.throws(() => new Stub(null, { id: 'c-id', source: 'ga4' }), /workspaceId/)
})

test('BaseConnector requires connectorRecord with id', () => {
  class Stub extends BaseConnector {}
  assert.throws(() => new Stub('ws-id', {}), /connectorRecord/)
  assert.throws(() => new Stub('ws-id', null), /connectorRecord/)
})

test('subclass that does not implement fetchData throws explicit error', async () => {
  class Stub extends BaseConnector {}
  const s = new Stub('ws-id', { id: 'c-id', source: 'ga4' })
  await assert.rejects(
    () => s.fetchData({ startDate: '2025-01-01', endDate: '2025-01-31' }),
    /Stub\.fetchData\(\) must be implemented/,
  )
})

test('subclass that does not implement normalizeData throws explicit error', async () => {
  class Stub extends BaseConnector {}
  const s = new Stub('ws-id', { id: 'c-id', source: 'ga4' })
  await assert.rejects(() => s.normalizeData({}), /Stub\.normalizeData\(\) must be implemented/)
})

test('subclass that does not implement testConnection throws explicit error', async () => {
  class Stub extends BaseConnector {}
  const s = new Stub('ws-id', { id: 'c-id', source: 'ga4' })
  await assert.rejects(() => s.testConnection(), /Stub\.testConnection\(\) must be implemented/)
})

test('refreshTokenIfNeeded skips if no token_expires_at', async () => {
  class Stub extends BaseConnector {}
  const s = new Stub('ws-id', { id: 'c-id', source: 'ga4' })
  const result = await s.refreshTokenIfNeeded()
  assert.equal(result, false)
})

test('refreshTokenIfNeeded skips if token expires beyond 7 days', async () => {
  class Stub extends BaseConnector {}
  const inTwoMonths = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  const s = new Stub('ws-id', { id: 'c-id', source: 'ga4', token_expires_at: inTwoMonths })
  const result = await s.refreshTokenIfNeeded()
  assert.equal(result, false)
})

test('refreshTokenIfNeeded calls _doRefresh when token expires within 7 days', async () => {
  let refreshed = false
  class Stub extends BaseConnector {
    async _doRefresh() {
      refreshed = true
    }
  }
  const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const s = new Stub('ws-id', { id: 'c-id', source: 'ga4', token_expires_at: inOneDay })
  const result = await s.refreshTokenIfNeeded()
  assert.equal(result, true)
  assert.equal(refreshed, true)
})

test('connector factory throws UserFacingError for unimplemented source', () => {
  const { getConnector } = require('../src/connectors')
  assert.throws(
    () => getConnector('ws-id', { id: 'c-id', source: 'meta_ads' }),
    /CONNECTOR_NOT_IMPLEMENTED|pas encore disponible/,
  )
})

test('connector factory throws on missing source', () => {
  const { getConnector } = require('../src/connectors')
  assert.throws(() => getConnector('ws-id', {}), /INVALID_CONNECTOR|source manquante/)
})
