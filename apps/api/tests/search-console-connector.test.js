// Tests SearchConsoleConnector — logique pure (normalizeData) et
// construction de la requête (fetchData) avec global.fetch mocké. Le
// _doRefresh + sync end-to-end nécessitent une vraie connexion Supabase et
// sont laissés à l'intégration.

process.env.LOG_LEVEL = 'fatal'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const SearchConsoleConnector = require('../src/connectors/search-console.connector')

const FAKE_GSC_RESPONSE = {
  rows: [
    { keys: ['2025-05-15'], clicks: 42, impressions: 1500, ctr: 0.028, position: 8.4 },
    { keys: ['2025-05-16'], clicks: 55, impressions: 1800, ctr: 0.0306, position: 7.9 },
  ],
}

function newConnector(overrides = {}) {
  return new SearchConsoleConnector('ws-id', {
    id: 'c-id',
    source: 'search_console',
    account_id: 'https://example.com/',
    access_token: 'fake-access-token',
    ...overrides,
  })
}

test('normalizeData maps GSC rows to 4 canonical metrics per date', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData(FAKE_GSC_RESPONSE)
  assert.equal(metrics.length, 8)

  const byDate15 = metrics.filter((m) => m.date === '2025-05-15')
  const find = (key) => byDate15.find((m) => m.metricKey === key)
  assert.equal(find('clicks_organic_search').metricValue, 42)
  assert.equal(find('impressions_organic_search').metricValue, 1500)
  assert.equal(find('click_through_rate_organic').metricValue, 0.028)
  assert.equal(find('average_position_organic').metricValue, 8.4)
})

test('normalizeData ignores rows with missing or malformed date key', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({
    rows: [
      { keys: [], clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      { keys: ['bad-date'], clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      { keys: ['2025-05-15'], clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
    ],
  })
  assert.equal(metrics.length, 4)
  assert.ok(metrics.every((m) => m.date === '2025-05-15'))
})

test('normalizeData skips non-numeric field values', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({
    rows: [{ keys: ['2025-05-15'], clicks: 10, impressions: null, ctr: 'n/a', position: 5 }],
  })
  const keys = metrics.map((m) => m.metricKey)
  assert.ok(keys.includes('clicks_organic_search'))
  assert.ok(keys.includes('average_position_organic'))
  assert.ok(!keys.includes('impressions_organic_search'))
  assert.ok(!keys.includes('click_through_rate_organic'))
})

test('normalizeData handles empty rows', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({ rows: [] })
  assert.deepEqual(metrics, [])
})

test('fetchData POSTs to searchAnalytics/query with encoded site URL and correct body', async () => {
  const originalFetch = global.fetch
  let capturedUrl, capturedOptions
  global.fetch = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return { ok: true, json: async () => FAKE_GSC_RESPONSE }
  }
  try {
    const c = newConnector({ account_id: 'https://m2benergy.be/' })
    await c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' })

    assert.equal(
      capturedUrl,
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent('https://m2benergy.be/')}/searchAnalytics/query`,
    )
    assert.equal(capturedOptions.method, 'POST')
    assert.equal(capturedOptions.headers.Authorization, 'Bearer fake-access-token')

    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.startDate, '2025-05-01')
    assert.equal(body.endDate, '2025-05-31')
    assert.deepEqual(body.dimensions, ['date'])
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

test('fetchData throws INVALID_CONNECTOR when siteUrl (account_id) is missing', async () => {
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

// 400 (non-retryable) plutôt que 500 pour ne pas déclencher les retries
// de fetchWithRetry (délais réels, ralentirait inutilement le test).
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
  global.fetch = async () => ({ ok: true, json: async () => ({ rows: [] }) })
  try {
    const c = newConnector()
    assert.equal(await c.testConnection(), true)
  } finally {
    global.fetch = originalFetch
  }
})

test('testConnection returns false on 401 (does not throw)', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'expired' })
  try {
    const c = newConnector()
    assert.equal(await c.testConnection(), false)
  } finally {
    global.fetch = originalFetch
  }
})

test('factory returns SearchConsoleConnector instance for source=search_console', () => {
  const { getConnector } = require('../src/connectors')
  const c = getConnector('ws-id', {
    id: 'c-id',
    source: 'search_console',
    account_id: 'https://example.com/',
    access_token: 't',
  })
  assert.equal(c.constructor.name, 'SearchConsoleConnector')
  assert.equal(c.source, 'search_console')
})
