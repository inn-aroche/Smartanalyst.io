// Tests pour services/connectors/connector-health.service.js (cahier
// §3 Lot 0 : santé des connecteurs / détection des échecs silencieux).
// Run: node --test tests/connector-health.test.js

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  computeHealthState,
  enrichWithHealth,
  STALE_AFTER_MS,
  FAILING_AFTER_MS,
} = require('../src/services/connectors/connector-health.service')

const NOW = Date.parse('2026-06-19T12:00:00Z')

function isoMinus(ms) {
  return new Date(NOW - ms).toISOString()
}

test('healthy : status=active et sync récent', () => {
  const h = computeHealthState(
    { status: 'active', last_synced_at: isoMinus(2 * 3600 * 1000) },
    NOW,
  )
  assert.equal(h.state, 'healthy')
  assert.equal(h.silent_failure, false)
})

test('stale : status=active mais sync dépasse STALE_AFTER_MS → silent_failure', () => {
  const h = computeHealthState(
    { status: 'active', last_synced_at: isoMinus(STALE_AFTER_MS + 60_000) },
    NOW,
  )
  assert.equal(h.state, 'stale')
  assert.equal(h.silent_failure, true)
  assert.equal(h.reason, 'sync_overdue')
})

test('stale : status=active jamais syncé et créé il y a > STALE_AFTER_MS', () => {
  const h = computeHealthState(
    {
      status: 'active',
      last_synced_at: null,
      created_at: isoMinus(STALE_AFTER_MS + 3600_000),
    },
    NOW,
  )
  assert.equal(h.state, 'stale')
  assert.equal(h.reason, 'never_synced')
  assert.equal(h.silent_failure, true)
})

test('unknown : status=active jamais syncé mais créé récemment (grace period)', () => {
  const h = computeHealthState(
    {
      status: 'active',
      last_synced_at: null,
      created_at: isoMinus(60 * 60 * 1000), // 1h
    },
    NOW,
  )
  assert.equal(h.state, 'unknown')
  assert.equal(h.silent_failure, false)
})

test('expired : token OAuth KO récent (< FAILING_AFTER_MS) → pas encore silent', () => {
  const h = computeHealthState(
    {
      status: 'expired',
      status_reason: 'INVALID_GRANT',
      last_synced_at: isoMinus(5 * 3600 * 1000),
      last_error_at: isoMinus(2 * 3600 * 1000),
    },
    NOW,
  )
  assert.equal(h.state, 'expired')
  assert.equal(h.reason, 'INVALID_GRANT')
  assert.equal(h.silent_failure, false)
})

test('expired : sans last_error_at (info manquante) → pas silent, pas de fausse alerte', () => {
  const h = computeHealthState(
    {
      status: 'expired',
      status_reason: 'INVALID_GRANT',
      last_synced_at: isoMinus(5 * 3600 * 1000),
    },
    NOW,
  )
  assert.equal(h.silent_failure, false)
})

test('expired : depuis > FAILING_AFTER_MS → silent_failure (filet de sécurité du cron santé)', () => {
  const h = computeHealthState(
    {
      status: 'expired',
      status_reason: 'INVALID_GRANT',
      last_error_at: isoMinus(FAILING_AFTER_MS + 3600_000),
    },
    NOW,
  )
  assert.equal(h.state, 'expired')
  assert.equal(h.silent_failure, true)
})

test('failing : status=error récent (< FAILING_AFTER_MS) → pas encore silent', () => {
  const h = computeHealthState(
    {
      status: 'error',
      status_reason: 'TIMEOUT',
      last_error_at: isoMinus(2 * 3600 * 1000),
      last_synced_at: isoMinus(10 * 3600 * 1000),
    },
    NOW,
  )
  assert.equal(h.state, 'failing')
  assert.equal(h.silent_failure, false)
})

test('failing : status=error depuis > FAILING_AFTER_MS → silent_failure', () => {
  const h = computeHealthState(
    {
      status: 'error',
      status_reason: 'SCHEMA_MISMATCH',
      last_error_at: isoMinus(FAILING_AFTER_MS + 3600_000),
    },
    NOW,
  )
  assert.equal(h.state, 'failing')
  assert.equal(h.silent_failure, true)
  assert.equal(h.reason, 'SCHEMA_MISMATCH')
})

test('unknown : connector falsy', () => {
  const h = computeHealthState(null, NOW)
  assert.equal(h.state, 'unknown')
  assert.equal(h.silent_failure, false)
})

test('enrichWithHealth : ajoute la clé health_state à chaque item', () => {
  const out = enrichWithHealth(
    [
      { id: 'a', status: 'active', last_synced_at: isoMinus(2 * 3600_000) },
      { id: 'b', status: 'expired', last_synced_at: isoMinus(2 * 3600_000) },
    ],
    NOW,
  )
  assert.equal(out.length, 2)
  assert.equal(out[0].health_state.state, 'healthy')
  assert.equal(out[1].health_state.state, 'expired')
  // Non destructif sur les autres champs
  assert.equal(out[0].id, 'a')
})

test('enrichWithHealth : tolère un input vide / nullish', () => {
  assert.deepEqual(enrichWithHealth(null), [])
  assert.deepEqual(enrichWithHealth(undefined), [])
  assert.deepEqual(enrichWithHealth([]), [])
})
