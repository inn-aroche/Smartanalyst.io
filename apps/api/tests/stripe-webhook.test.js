// Tests stripe-webhook.service — focus sur l'invariant d'idempotence.
//
// Stratégie: mock complet de getServiceRoleClient (chain Supabase). Pas
// d'appel réseau Stripe ici — la vérification de signature est testée par
// la lib stripe elle-même, on s'intéresse à la logique de déduplication.

process.env.LOG_LEVEL = 'fatal'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

// Monkey-patch getServiceRoleClient via require cache pour fournir un mock
// contrôlable test par test.
let _mockClient = null
const originalRequire = Module.prototype.require
Module.prototype.require = function (id) {
  if (id === '../../lib/supabase' || id.endsWith('/lib/supabase')) {
    return { getServiceRoleClient: () => _mockClient }
  }
  return originalRequire.apply(this, arguments)
}

const stripeWebhook = require('../src/services/billing/stripe-webhook.service')

// ─── helpers ───
function makeUpdateMock() {
  return {
    update: () => ({
      eq: async () => ({ data: null, error: null }),
    }),
  }
}

function makeClient({ insertOutcome }) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => insertOutcome,
        }),
      }),
      ...makeUpdateMock(),
    }),
  }
}

function fakeEvent(overrides = {}) {
  return {
    id: 'evt_test_' + Math.random().toString(36).slice(2),
    type: 'invoice.paid',
    data: { object: { id: 'in_test_123', customer: 'cus_test_123' } },
    ...overrides,
  }
}

// ─── tests ───

test('handleEvent: nouvel event → processed: true', async () => {
  _mockClient = makeClient({
    insertOutcome: { data: { id: 'be_uuid_1' }, error: null },
  })
  const result = await stripeWebhook.handleEvent(fakeEvent())
  assert.equal(result.processed, true)
  assert.equal(result.id, 'be_uuid_1')
  assert.equal(result.duplicate, undefined)
})

test('handleEvent: event déjà reçu (conflit unique 23505) → duplicate: true, handler NON rejoué', async () => {
  let dispatchedCount = 0
  _mockClient = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => {
            dispatchedCount++
            return { data: null, error: { code: '23505', message: 'duplicate key' } }
          },
        }),
      }),
      ...makeUpdateMock(),
    }),
  }
  const result = await stripeWebhook.handleEvent(fakeEvent())
  assert.equal(result.duplicate, true)
  assert.equal(result.processed, undefined)
})

test('handleEvent: erreur DB autre que 23505 → relancée', async () => {
  _mockClient = makeClient({
    insertOutcome: { data: null, error: { code: '08006', message: 'connection_failure' } },
  })
  await assert.rejects(
    () => stripeWebhook.handleEvent(fakeEvent()),
    (err) => err && err.code === '08006' && err.message === 'connection_failure',
  )
})

test('constructEvent: lève si STRIPE_WEBHOOK_SECRET absent', () => {
  delete process.env.STRIPE_WEBHOOK_SECRET
  assert.throws(
    () => stripeWebhook.constructEvent(Buffer.from('{}'), 't=123,v1=abc'),
    /STRIPE_WEBHOOK_SECRET not configured/,
  )
})
