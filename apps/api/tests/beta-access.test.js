// Tests du helper beta lockdown.
//
// Vérifie :
//   - Mode désactivé quand BETA_ALLOWED_EMAILS vide (tous emails OK)
//   - Whitelist case-insensitive + trim whitespace
//   - Refus 403 BETA_LOCKED si email pas autorisé
//   - assertBetaAccess no-op si autorisé, throw UserFacingError sinon

const test = require('node:test')
const assert = require('node:assert/strict')

const BETA_ACCESS_PATH = require.resolve('../src/lib/beta-access')

function reload(envValue) {
  if (envValue === undefined) delete process.env.BETA_ALLOWED_EMAILS
  else process.env.BETA_ALLOWED_EMAILS = envValue
  delete require.cache[BETA_ACCESS_PATH]
  return require(BETA_ACCESS_PATH)
}

test('isLockdownActive=false quand env vide', () => {
  const { isLockdownActive } = reload('')
  assert.equal(isLockdownActive(), false)
})

test('isLockdownActive=false quand env absent', () => {
  const { isLockdownActive } = reload(undefined)
  assert.equal(isLockdownActive(), false)
})

test('isLockdownActive=true dès 1 email configuré', () => {
  const { isLockdownActive } = reload('owner@smartanalyst.io')
  assert.equal(isLockdownActive(), true)
})

test('isAllowedEmail=true (lockdown off) → tout email passe', () => {
  const { isAllowedEmail } = reload('')
  assert.equal(isAllowedEmail('random@example.com'), true)
  assert.equal(isAllowedEmail('any@test.fr'), true)
})

test('isAllowedEmail=true si email exact dans la whitelist', () => {
  const { isAllowedEmail } = reload('owner@smartanalyst.io,team@smartanalyst.io')
  assert.equal(isAllowedEmail('owner@smartanalyst.io'), true)
  assert.equal(isAllowedEmail('team@smartanalyst.io'), true)
})

test('isAllowedEmail=false si email pas dans la whitelist', () => {
  const { isAllowedEmail } = reload('owner@smartanalyst.io')
  assert.equal(isAllowedEmail('random@example.com'), false)
})

test('isAllowedEmail case-insensitive (entrée et whitelist)', () => {
  const { isAllowedEmail } = reload('Owner@SmartAnalyst.io')
  assert.equal(isAllowedEmail('owner@smartanalyst.io'), true)
  assert.equal(isAllowedEmail('OWNER@SMARTANALYST.IO'), true)
  assert.equal(isAllowedEmail('Owner@SmartAnalyst.io'), true)
})

test('isAllowedEmail trim whitespace dans la whitelist', () => {
  const { isAllowedEmail } = reload('  owner@smartanalyst.io  , team@smartanalyst.io ')
  assert.equal(isAllowedEmail('owner@smartanalyst.io'), true)
  assert.equal(isAllowedEmail('team@smartanalyst.io'), true)
})

test('isAllowedEmail=false sur null/undefined/empty', () => {
  const { isAllowedEmail } = reload('owner@smartanalyst.io')
  assert.equal(isAllowedEmail(null), false)
  assert.equal(isAllowedEmail(undefined), false)
  assert.equal(isAllowedEmail(''), false)
})

test('assertBetaAccess no-op si email autorisé', () => {
  const { assertBetaAccess } = reload('owner@smartanalyst.io')
  assert.doesNotThrow(() => assertBetaAccess('owner@smartanalyst.io'))
})

test('assertBetaAccess no-op quand lockdown désactivé (peu importe l\'email)', () => {
  const { assertBetaAccess } = reload('')
  assert.doesNotThrow(() => assertBetaAccess('random@example.com'))
})

test('assertBetaAccess throw UserFacingError 403 BETA_LOCKED', () => {
  const { assertBetaAccess } = reload('owner@smartanalyst.io')
  try {
    assertBetaAccess('random@example.com')
    assert.fail('should have thrown')
  } catch (err) {
    assert.equal(err.statusCode, 403)
    assert.equal(err.code, 'BETA_LOCKED')
    assert.match(err.message, /beta privée/)
    assert.equal(err.name, 'UserFacingError')
  }
})

test('assertBetaAccess message contient le lien vers la waitlist', () => {
  const { assertBetaAccess } = reload('owner@smartanalyst.io')
  try {
    assertBetaAccess('random@example.com')
  } catch (err) {
    assert.match(err.message, /smartanalyst\.io\/beta/)
  }
})
