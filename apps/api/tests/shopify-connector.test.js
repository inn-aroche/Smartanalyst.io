// Tests ShopifyConnector — logique pure (normalizeData, helpers de
// pagination) et construction de la requête (fetchData) avec global.fetch
// mocké. Le sync end-to-end nécessite une vraie connexion Supabase et est
// laissé à l'intégration.

process.env.LOG_LEVEL = 'fatal'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const ShopifyConnector = require('../src/connectors/shopify.connector')

function newConnector(overrides = {}) {
  return new ShopifyConnector('ws-id', {
    id: 'c-id',
    source: 'shopify',
    account_id: 'maboutique',
    access_token: 'fake-access-token',
    ...overrides,
  })
}

// ── helpers exportés ──

test('_isoDate: tronque un timestamp ISO à YYYY-MM-DD', () => {
  assert.equal(ShopifyConnector._isoDate('2025-05-15T10:30:00Z'), '2025-05-15')
})

test('_isoDate: retourne null pour une valeur vide', () => {
  assert.equal(ShopifyConnector._isoDate(null), null)
  assert.equal(ShopifyConnector._isoDate(undefined), null)
})

test('_parseLinkNext: extrait l\'URL rel="next" du header Link', () => {
  const link =
    '<https://maboutique.myshopify.com/admin/api/2025-01/orders.json?page_info=abc&limit=250>; rel="next"'
  assert.equal(
    ShopifyConnector._parseLinkNext(link),
    'https://maboutique.myshopify.com/admin/api/2025-01/orders.json?page_info=abc&limit=250',
  )
})

test('_parseLinkNext: gère plusieurs rel (previous + next)', () => {
  const link =
    '<https://x.myshopify.com/admin/api/2025-01/orders.json?page_info=p1>; rel="previous", <https://x.myshopify.com/admin/api/2025-01/orders.json?page_info=n1>; rel="next"'
  assert.equal(
    ShopifyConnector._parseLinkNext(link),
    'https://x.myshopify.com/admin/api/2025-01/orders.json?page_info=n1',
  )
})

test('_parseLinkNext: retourne null si pas de header ou pas de rel=next', () => {
  assert.equal(ShopifyConnector._parseLinkNext(null), null)
  assert.equal(
    ShopifyConnector._parseLinkNext('<https://x.com/a>; rel="previous"'),
    null,
  )
})

// ── normalizeData ──

test('normalizeData aggregates revenue/orders/refunds/newCustomers/aov by day', async () => {
  const c = newConnector()
  const raw = {
    orders: [
      { created_at: '2025-05-15T10:00:00Z', total_price: '50.00', total_refunded: '0' },
      { created_at: '2025-05-15T14:00:00Z', total_price: '30.00', total_refunded: '10.00' },
      { created_at: '2025-05-16T09:00:00Z', total_price: '100.00', total_refunded: '0' },
    ],
    customers: [
      { created_at: '2025-05-15T09:00:00Z' },
      { created_at: '2025-05-15T11:00:00Z' },
    ],
  }
  const { metrics } = await c.normalizeData(raw)

  const byDate15 = metrics.filter((m) => m.date === '2025-05-15')
  const find15 = (key) => byDate15.find((m) => m.metricKey === key)
  assert.equal(find15('revenue_ecommerce').metricValue, 80)
  assert.equal(find15('orders_count').metricValue, 2)
  assert.equal(find15('refunds_amount').metricValue, 10)
  assert.equal(find15('customers_new').metricValue, 2)
  assert.equal(find15('order_value_average').metricValue, 40)

  const byDate16 = metrics.filter((m) => m.date === '2025-05-16')
  const find16 = (key) => byDate16.find((m) => m.metricKey === key)
  assert.equal(find16('revenue_ecommerce').metricValue, 100)
  assert.equal(find16('orders_count').metricValue, 1)
  assert.ok(!byDate16.some((m) => m.metricKey === 'refunds_amount'))
  assert.ok(!byDate16.some((m) => m.metricKey === 'customers_new'))
})

test('normalizeData ignores orders/customers with missing created_at', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({
    orders: [{ total_price: '50' }],
    customers: [{}],
  })
  assert.deepEqual(metrics, [])
})

test('normalizeData handles empty orders and customers', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({ orders: [], customers: [] })
  assert.deepEqual(metrics, [])
})

// ── fetchData ──

test('fetchData suit la pagination Link (orders) et récupère customers en parallèle', async () => {
  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (url, options) => {
    const u = new URL(url)
    calls.push({ pathname: u.pathname, pageInfo: u.searchParams.get('page_info'), headers: options.headers })

    if (u.pathname.endsWith('/orders.json')) {
      if (!u.searchParams.get('page_info')) {
        return {
          ok: true,
          json: async () => ({
            orders: [
              { id: 1, created_at: '2025-05-15T10:00:00Z', total_price: '50.00', total_refunded: '0' },
            ],
          }),
          headers: {
            get: (name) =>
              name === 'link'
                ? '<https://maboutique.myshopify.com/admin/api/2025-01/orders.json?page_info=cursor1&limit=250>; rel="next"'
                : null,
          },
        }
      }
      return {
        ok: true,
        json: async () => ({
          orders: [
            { id: 2, created_at: '2025-05-16T10:00:00Z', total_price: '75.00', total_refunded: '5.00' },
          ],
        }),
        headers: { get: () => null },
      }
    }
    if (u.pathname.endsWith('/customers.json')) {
      return {
        ok: true,
        json: async () => ({ customers: [{ id: 100, created_at: '2025-05-15T09:00:00Z' }] }),
        headers: { get: () => null },
      }
    }
    throw new Error(`unexpected url ${url}`)
  }
  try {
    const c = newConnector()
    const raw = await c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' })

    assert.equal(raw.orders.length, 2)
    assert.equal(raw.customers.length, 1)
    // 2 pages orders + 1 page customers
    assert.equal(calls.length, 3)
    assert.ok(calls.every((c2) => c2.headers['X-Shopify-Access-Token'] === 'fake-access-token'))
    const orderCalls = calls.filter((c2) => c2.pathname.endsWith('/orders.json'))
    assert.equal(orderCalls[0].pageInfo, null)
    assert.equal(orderCalls[1].pageInfo, 'cursor1')
  } finally {
    global.fetch = originalFetch
  }
})

test('fetchData throws INVALID_CREDENTIALS when access_token is missing', async () => {
  const c = newConnector({ access_token: '' })
  await assert.rejects(
    () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
    (err) => err.code === 'INVALID_CREDENTIALS',
  )
})

test('fetchData throws INVALID_CONNECTOR when shop subdomain (account_id) is missing', async () => {
  const c = newConnector({ account_id: null })
  await assert.rejects(
    () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
    (err) => err.code === 'INVALID_CONNECTOR',
  )
})

test('fetchData throws INVALID_CREDENTIALS on 401', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' })
  try {
    const c = newConnector()
    await assert.rejects(
      () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
      (err) => err.code === 'INVALID_CREDENTIALS' && err.statusCode === 401,
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('fetchData throws API_ERROR on 400', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({ ok: false, status: 400, text: async () => 'Bad request' })
  try {
    const c = newConnector()
    await assert.rejects(
      () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
      (err) => err.code === 'API_ERROR' && err.statusCode === 400,
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('testConnection returns true on 200', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ shop: { name: 'Ma Boutique' } }),
    headers: { get: () => null },
  })
  try {
    const c = newConnector()
    assert.equal(await c.testConnection(), true)
  } finally {
    global.fetch = originalFetch
  }
})

test('testConnection returns false on error (does not throw)', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'expired' })
  try {
    const c = newConnector()
    assert.equal(await c.testConnection(), false)
  } finally {
    global.fetch = originalFetch
  }
})

test('factory returns ShopifyConnector instance for source=shopify', () => {
  const { getConnector } = require('../src/connectors')
  const c = getConnector('ws-id', {
    id: 'c-id',
    source: 'shopify',
    account_id: 'maboutique',
    access_token: 't',
  })
  assert.equal(c.constructor.name, 'ShopifyConnector')
  assert.equal(c.source, 'shopify')
})
