// Tests GA4Connector — focus sur la logique pure (normalizeData) et la
// construction de la requête (fetchData) avec global.fetch mocké.
// Le _doRefresh + sync end-to-end nécessitent une vraie connexion Supabase
// et sont laissés à l'intégration.

process.env.LOG_LEVEL = 'fatal'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const GA4Connector = require('../src/connectors/ga4.connector')

const FAKE_GA4_RESPONSE = {
  metricHeaders: [
    { name: 'sessions' },
    { name: 'activeUsers' },
    { name: 'newUsers' },
    { name: 'conversions' },
    { name: 'conversionValue' },
    { name: 'bounceRate' },
    { name: 'averageSessionDuration' },
    { name: 'screenPageViewsPerSession' },
  ],
  rows: [
    {
      dimensionValues: [{ value: '20250515' }],
      metricValues: [
        { value: '1200' },
        { value: '800' },
        { value: '120' },
        { value: '45' },
        { value: '4200.50' },
        { value: '0.42' },
        { value: '95.5' },
        { value: '3.2' },
      ],
    },
    {
      dimensionValues: [{ value: '20250516' }],
      metricValues: [
        { value: '1350' },
        { value: '900' },
        { value: '140' },
        { value: '50' },
        { value: '5100.75' },
        { value: '0.40' },
        { value: '102.3' },
        { value: '3.5' },
      ],
    },
  ],
}

function newConnector(overrides = {}) {
  return new GA4Connector('ws-id', {
    id: 'c-id',
    source: 'ga4',
    account_id: '12345',
    access_token: 'fake-access-token',
    ...overrides,
  })
}

test('normalizeData maps GA4 response to canonical metrics (2 dates × 8 metrics)', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData(FAKE_GA4_RESPONSE)
  assert.equal(metrics.length, 16)
})

test('normalizeData: sessions → sessions_all with correct value', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData(FAKE_GA4_RESPONSE)
  const sessionsRow = metrics.find(
    (m) => m.date === '2025-05-15' && m.metricKey === 'sessions_all',
  )
  assert.ok(sessionsRow)
  assert.equal(sessionsRow.metricValue, 1200)
  assert.equal(sessionsRow.confidenceScore, 100)
})

test('normalizeData: conversionValue → revenue_from_conversions (float preserved)', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData(FAKE_GA4_RESPONSE)
  const revRow = metrics.find(
    (m) => m.date === '2025-05-15' && m.metricKey === 'revenue_from_conversions',
  )
  assert.equal(revRow.metricValue, 4200.5)
})

test('normalizeData converts GA4 YYYYMMDD to ISO YYYY-MM-DD', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData(FAKE_GA4_RESPONSE)
  const dates = new Set(metrics.map((m) => m.date))
  assert.deepEqual(dates, new Set(['2025-05-15', '2025-05-16']))
})

test('normalizeData ignores rows with malformed date', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({
    metricHeaders: [{ name: 'sessions' }],
    rows: [
      { dimensionValues: [{ value: 'bad' }], metricValues: [{ value: '100' }] },
      { dimensionValues: [{ value: '20250515' }], metricValues: [{ value: '200' }] },
    ],
  })
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0].metricValue, 200)
})

test('normalizeData skips metric headers that have no mapping', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({
    metricHeaders: [{ name: 'sessions' }, { name: 'someUnmappedThing' }],
    rows: [
      {
        dimensionValues: [{ value: '20250515' }],
        metricValues: [{ value: '100' }, { value: '999' }],
      },
    ],
  })
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0].metricKey, 'sessions_all')
})

test('normalizeData handles empty rows', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({ metricHeaders: [], rows: [] })
  assert.deepEqual(metrics, [])
})

test('fetchData hits GA4 Data API with correct URL and POST body', async () => {
  const originalFetch = global.fetch
  let capturedUrl, capturedOptions
  global.fetch = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return {
      ok: true,
      json: async () => FAKE_GA4_RESPONSE,
    }
  }
  try {
    const c = newConnector({ account_id: '789', access_token: 'token-abc' })
    const result = await c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' })

    assert.equal(
      capturedUrl,
      'https://analyticsdata.googleapis.com/v1beta/properties/789:runReport',
    )
    assert.equal(capturedOptions.method, 'POST')
    assert.equal(capturedOptions.headers.Authorization, 'Bearer token-abc')

    const parsedBody = JSON.parse(capturedOptions.body)
    assert.equal(parsedBody.dateRanges[0].startDate, '2025-05-01')
    assert.equal(parsedBody.dateRanges[0].endDate, '2025-05-31')
    assert.ok(parsedBody.metrics.some((m) => m.name === 'sessions'))
    assert.ok(parsedBody.dimensions.some((d) => d.name === 'date'))

    assert.equal(result.rows.length, 2)
  } finally {
    global.fetch = originalFetch
  }
})

test('fetchData accepte account_id préfixé "properties/<id>" sans double préfixe', async () => {
  const originalFetch = global.fetch
  let capturedUrl
  global.fetch = async (url) => {
    capturedUrl = url
    return { ok: true, json: async () => FAKE_GA4_RESPONSE }
  }
  try {
    const c = newConnector({ account_id: 'properties/355390842', access_token: 'token-abc' })
    await c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' })
    assert.equal(
      capturedUrl,
      'https://analyticsdata.googleapis.com/v1beta/properties/355390842:runReport',
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('fetchData throws with code INVALID_CREDENTIALS on 401', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
  })
  try {
    const c = newConnector({ access_token: 'expired' })
    await assert.rejects(
      () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
      (err) => err.code === 'INVALID_CREDENTIALS' && err.statusCode === 401,
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('fetchData throws with code API_ERROR on 500', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal error',
  })
  try {
    const c = newConnector()
    await assert.rejects(
      () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
      (err) => err.code === 'API_ERROR' && err.statusCode === 500,
    )
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

test('fetchData throws INVALID_CONNECTOR when account_id is missing', async () => {
  const c = newConnector({ account_id: null })
  await assert.rejects(
    () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
    (err) => err.code === 'INVALID_CONNECTOR',
  )
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
    const c = newConnector({ access_token: 'expired' })
    assert.equal(await c.testConnection(), false)
  } finally {
    global.fetch = originalFetch
  }
})

test('factory returns GA4Connector instance for source=ga4', () => {
  const { getConnector } = require('../src/connectors')
  const c = getConnector('ws-id', {
    id: 'c-id',
    source: 'ga4',
    account_id: '789',
    access_token: 't',
  })
  assert.equal(c.constructor.name, 'GA4Connector')
  assert.equal(c.source, 'ga4')
  assert.equal(c.workspaceId, 'ws-id')
})
