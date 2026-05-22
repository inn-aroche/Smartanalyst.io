// Tests unitaires StripeConnector.
//
// Stratégie: tests des helpers purs (priceToMonthlyCents, unixToIsoDate,
// groupCountByDate, isoDateToUnix) + tests d'intégration de normalizeData
// avec fetchData mocké (pas d'appel réseau).

process.env.LOG_LEVEL = 'fatal'

const { test, mock } = require('node:test')
const assert = require('node:assert/strict')

const StripeConnector = require('../src/connectors/stripe.connector')
const {
  priceToMonthlyCents,
  unixToIsoDate,
  isoDateToUnix,
  groupCountByDate,
  STRIPE_KEY_PATTERN,
} = require('../src/connectors/stripe.connector')

// ━━━ priceToMonthlyCents ━━━

test('priceToMonthlyCents: monthly price → unchanged', () => {
  const price = { unit_amount: 2900, recurring: { interval: 'month', interval_count: 1 } }
  assert.equal(priceToMonthlyCents(price, 1), 2900)
})

test('priceToMonthlyCents: yearly price → divided by 12', () => {
  const price = { unit_amount: 29000, recurring: { interval: 'year', interval_count: 1 } }
  // 29000 / 12 ≈ 2416.66
  assert.ok(Math.abs(priceToMonthlyCents(price, 1) - 29000 / 12) < 0.001)
})

test('priceToMonthlyCents: quantity multiplier', () => {
  const price = { unit_amount: 1000, recurring: { interval: 'month', interval_count: 1 } }
  assert.equal(priceToMonthlyCents(price, 5), 5000)
})

test('priceToMonthlyCents: interval_count=3 (quarterly) → /3', () => {
  const price = { unit_amount: 9000, recurring: { interval: 'month', interval_count: 3 } }
  assert.equal(priceToMonthlyCents(price, 1), 3000)
})

test('priceToMonthlyCents: weekly → ~4.348 per month', () => {
  const price = { unit_amount: 1000, recurring: { interval: 'week', interval_count: 1 } }
  const result = priceToMonthlyCents(price, 1)
  assert.ok(result > 4300 && result < 4400, `expected ~4348, got ${result}`)
})

test('priceToMonthlyCents: no recurring → 0', () => {
  assert.equal(priceToMonthlyCents({ unit_amount: 1000 }, 1), 0)
  assert.equal(priceToMonthlyCents(null, 1), 0)
})

test('priceToMonthlyCents: unknown interval → 0', () => {
  const price = { unit_amount: 1000, recurring: { interval: 'fortnight', interval_count: 1 } }
  assert.equal(priceToMonthlyCents(price, 1), 0)
})

// ━━━ unixToIsoDate ━━━

test('unixToIsoDate: known timestamps', () => {
  // 1577836800 = 2020-01-01 00:00:00 UTC
  assert.equal(unixToIsoDate(1577836800), '2020-01-01')
  // 1735689599 = 2024-12-31 23:59:59 UTC
  assert.equal(unixToIsoDate(1735689599), '2024-12-31')
})

test('unixToIsoDate: invalid input → null', () => {
  assert.equal(unixToIsoDate(null), null)
  assert.equal(unixToIsoDate('abc'), null)
  assert.equal(unixToIsoDate(undefined), null)
})

// ━━━ isoDateToUnix ━━━

test('isoDateToUnix: start mode returns 00:00:00 UTC', () => {
  assert.equal(isoDateToUnix('2020-01-01', 'start'), 1577836800)
})

test('isoDateToUnix: end mode returns 23:59:59 UTC', () => {
  assert.equal(isoDateToUnix('2024-12-31', 'end'), 1735689599)
})

// ━━━ groupCountByDate ━━━

test('groupCountByDate: groups by date string', () => {
  const items = [
    { created: 1577836800 }, // 2020-01-01
    { created: 1577836900 }, // 2020-01-01 (same day, 100s later)
    { created: 1577923200 }, // 2020-01-02
  ]
  const result = groupCountByDate(items, (i) => unixToIsoDate(i.created))
  assert.equal(result.get('2020-01-01'), 2)
  assert.equal(result.get('2020-01-02'), 1)
})

test('groupCountByDate: items with null date are skipped', () => {
  const items = [{ created: 1577836800 }, { created: null }, { created: 'bad' }]
  const result = groupCountByDate(items, (i) => unixToIsoDate(i.created))
  assert.equal(result.size, 1)
  assert.equal(result.get('2020-01-01'), 1)
})

// ━━━ STRIPE_KEY_PATTERN ━━━

test('STRIPE_KEY_PATTERN: accepts test/live secret keys', () => {
  assert.ok(STRIPE_KEY_PATTERN.test('sk_test_abc123XYZ'))
  assert.ok(STRIPE_KEY_PATTERN.test('sk_live_abc123XYZ'))
})

test('STRIPE_KEY_PATTERN: accepts test/live restricted keys', () => {
  assert.ok(STRIPE_KEY_PATTERN.test('rk_test_abc123XYZ'))
  assert.ok(STRIPE_KEY_PATTERN.test('rk_live_abc123XYZ'))
})

test('STRIPE_KEY_PATTERN: rejects malformed keys', () => {
  assert.ok(!STRIPE_KEY_PATTERN.test('pk_test_abc'))  // publishable key (rejected)
  assert.ok(!STRIPE_KEY_PATTERN.test('not_a_key'))
  assert.ok(!STRIPE_KEY_PATTERN.test('sk_dev_abc'))   // wrong env
  assert.ok(!STRIPE_KEY_PATTERN.test('sk_test_'))     // no payload
  assert.ok(!STRIPE_KEY_PATTERN.test(''))
})

// ━━━ normalizeData integration ━━━

const fakeConnectorRecord = {
  id: 'connector-uuid-stripe',
  source: 'stripe',
  workspace_id: 'ws-1',
  access_token: 'encrypted-sk_test_xxx',
}

function makeConnector() {
  return new StripeConnector('ws-1', fakeConnectorRecord)
}

test('normalizeData: MRR sum from active subs (mixed monthly/yearly/quantity)', async () => {
  const connector = makeConnector()
  const raw = {
    activeSubs: [
      {
        status: 'active',
        customer: 'cus_A',
        items: {
          data: [
            { quantity: 1, price: { unit_amount: 2900, recurring: { interval: 'month', interval_count: 1 } } },
          ],
        },
      },
      {
        status: 'active',
        customer: 'cus_B',
        items: {
          data: [
            { quantity: 5, price: { unit_amount: 1000, recurring: { interval: 'month', interval_count: 1 } } },
          ],
        },
      },
      {
        status: 'active',
        customer: 'cus_C',
        items: {
          data: [
            { quantity: 1, price: { unit_amount: 12000, recurring: { interval: 'year', interval_count: 1 } } },
          ],
        },
      },
    ],
    newCustomers: [],
    charges: [],
    startDate: '2024-12-01',
    endDate: '2024-12-31',
  }

  const { metrics } = await connector.normalizeData(raw)

  // MRR cents = 2900 + 5*1000 + 12000/12 = 2900 + 5000 + 1000 = 8900 cents = 89€
  const mrr = metrics.find((m) => m.metricKey === 'revenue_recurring_monthly')
  assert.ok(mrr)
  assert.equal(mrr.date, '2024-12-31')
  assert.ok(Math.abs(mrr.metricValue - 89) < 0.001, `expected ~89€, got ${mrr.metricValue}`)

  // ARR = MRR * 12
  const arr = metrics.find((m) => m.metricKey === 'revenue_annual_recurring')
  assert.ok(Math.abs(arr.metricValue - 89 * 12) < 0.001)
})

test('normalizeData: active customers = count of distinct customers', async () => {
  const connector = makeConnector()
  const raw = {
    activeSubs: [
      { status: 'active', customer: 'cus_A', items: { data: [] } },
      { status: 'active', customer: 'cus_A', items: { data: [] } }, // dup
      { status: 'active', customer: 'cus_B', items: { data: [] } },
      { status: 'active', customer: 'cus_C', items: { data: [] } },
    ],
    newCustomers: [],
    charges: [],
    startDate: '2024-12-01',
    endDate: '2024-12-31',
  }
  const { metrics } = await connector.normalizeData(raw)
  const active = metrics.find((m) => m.metricKey === 'customers_active')
  assert.equal(active.metricValue, 3)
})

test('normalizeData: new customers per day', async () => {
  const connector = makeConnector()
  const raw = {
    activeSubs: [],
    newCustomers: [
      { created: isoDateToUnix('2024-12-15', 'start') },
      { created: isoDateToUnix('2024-12-15', 'start') + 3600 }, // same day
      { created: isoDateToUnix('2024-12-16', 'start') },
    ],
    charges: [],
    startDate: '2024-12-01',
    endDate: '2024-12-31',
  }
  const { metrics } = await connector.normalizeData(raw)
  const newCust = metrics.filter((m) => m.metricKey === 'customers_new')
  assert.equal(newCust.length, 2)
  assert.equal(newCust.find((m) => m.date === '2024-12-15').metricValue, 2)
  assert.equal(newCust.find((m) => m.date === '2024-12-16').metricValue, 1)
})

test('normalizeData: failed payments per day', async () => {
  const connector = makeConnector()
  const ts = isoDateToUnix('2024-12-10', 'start')
  const raw = {
    activeSubs: [],
    newCustomers: [],
    charges: [
      { status: 'failed', created: ts },
      { status: 'failed', created: ts + 100 },
      { status: 'succeeded', paid: true, created: ts },  // success: ignored
      { status: 'pending', paid: false, created: ts + 1000 }, // !paid → counted
    ],
    startDate: '2024-12-01',
    endDate: '2024-12-31',
  }
  const { metrics } = await connector.normalizeData(raw)
  const failed = metrics.filter((m) => m.metricKey === 'failed_payments_month')
  assert.equal(failed.length, 1)
  assert.equal(failed[0].metricValue, 3) // 2 failed + 1 pending unpaid
})

test('normalizeData: empty input → snapshot zeros for MRR/ARR/active_customers, no per-day rows', async () => {
  const connector = makeConnector()
  const raw = {
    activeSubs: [],
    newCustomers: [],
    charges: [],
    startDate: '2024-12-01',
    endDate: '2024-12-31',
  }
  const { metrics } = await connector.normalizeData(raw)
  // Snapshots: MRR=0, ARR=0, active_customers=0 → 3 rows
  const snapshotKeys = ['revenue_recurring_monthly', 'revenue_annual_recurring', 'customers_active']
  for (const key of snapshotKeys) {
    const row = metrics.find((m) => m.metricKey === key)
    assert.ok(row, `missing snapshot for ${key}`)
    assert.equal(row.metricValue, 0)
  }
  // No per-day rows
  assert.equal(metrics.filter((m) => m.metricKey === 'customers_new').length, 0)
  assert.equal(metrics.filter((m) => m.metricKey === 'failed_payments_month').length, 0)
})

// ━━━ Stripe API error handling ━━━

test('_stripeGet: 401 throws INVALID_CREDENTIALS', async () => {
  const connector = makeConnector()
  // Mock vault.decrypt to return a fake key (avoid touching real vault)
  const vault = require('../src/lib/vault')
  const restoreVault = mock.method(vault, 'decrypt', async () => 'sk_test_fake')

  const restoreFetch = mock.method(global, 'fetch', async () =>
    new Response('Invalid API key', { status: 401 }),
  )

  try {
    await assert.rejects(
      () => connector._stripeGet('/balance'),
      (err) => {
        assert.equal(err.statusCode, 401)
        assert.equal(err.code, 'INVALID_CREDENTIALS')
        return true
      },
    )
  } finally {
    restoreFetch.mock.restore()
    restoreVault.mock.restore()
  }
})

test('_stripeGet: 500 throws API_ERROR', async () => {
  const connector = makeConnector()
  const vault = require('../src/lib/vault')
  const restoreVault = mock.method(vault, 'decrypt', async () => 'sk_test_fake')
  const restoreFetch = mock.method(global, 'fetch', async () =>
    new Response('Stripe down', { status: 503 }),
  )

  try {
    await assert.rejects(
      () => connector._stripeGet('/balance'),
      (err) => {
        assert.equal(err.statusCode, 503)
        assert.equal(err.code, 'API_ERROR')
        return true
      },
    )
  } finally {
    restoreFetch.mock.restore()
    restoreVault.mock.restore()
  }
})

test('testConnection: returns false on auth error (never throws)', async () => {
  const connector = makeConnector()
  const vault = require('../src/lib/vault')
  const restoreVault = mock.method(vault, 'decrypt', async () => 'sk_test_fake')
  const restoreFetch = mock.method(global, 'fetch', async () =>
    new Response('Invalid', { status: 401 }),
  )

  try {
    const result = await connector.testConnection()
    assert.equal(result, false)
  } finally {
    restoreFetch.mock.restore()
    restoreVault.mock.restore()
  }
})

test('testConnection: returns true on success', async () => {
  const connector = makeConnector()
  const vault = require('../src/lib/vault')
  const restoreVault = mock.method(vault, 'decrypt', async () => 'sk_test_fake')
  const restoreFetch = mock.method(global, 'fetch', async () =>
    new Response(JSON.stringify({ available: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  try {
    const result = await connector.testConnection()
    assert.equal(result, true)
  } finally {
    restoreFetch.mock.restore()
    restoreVault.mock.restore()
  }
})

// ━━━ factory ━━━

test('connector factory returns StripeConnector for source=stripe', () => {
  const { getConnector } = require('../src/connectors')
  const instance = getConnector('ws-1', { id: 'c-1', source: 'stripe' })
  assert.equal(instance.constructor.name, 'StripeConnector')
  assert.equal(instance.workspaceId, 'ws-1')
  assert.equal(instance.source, 'stripe')
})
