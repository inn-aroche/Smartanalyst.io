// Tests MetaAdsConnector — logique pure (normalizeData) et construction de
// la requête (fetchData) avec global.fetch mocké. Le _doRefresh + sync
// end-to-end nécessitent une vraie connexion Supabase et sont laissés à
// l'intégration.

process.env.LOG_LEVEL = 'fatal'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const MetaAdsConnector = require('../src/connectors/meta-ads.connector')

const FAKE_INSIGHTS_RESPONSE = {
  data: [
    {
      date_start: '2025-05-15',
      spend: '120.50',
      impressions: '10000',
      clicks: '250',
      actions: [
        { action_type: 'purchase', value: '3' },
        { action_type: 'link_click', value: '250' },
        { action_type: 'lead', value: '2' },
      ],
    },
    {
      date_start: '2025-05-16',
      spend: '0',
      impressions: '0',
      clicks: '0',
      actions: [],
    },
  ],
}

function newConnector(overrides = {}) {
  return new MetaAdsConnector('ws-id', {
    id: 'c-id',
    source: 'meta_ads',
    account_id: '123456789',
    access_token: 'fake-access-token',
    ...overrides,
  })
}

test('normalizeData maps spend/impressions/clicks + cpc/cpm dérivés + actions filtrées', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData(FAKE_INSIGHTS_RESPONSE)

  const byDate15 = metrics.filter((m) => m.date === '2025-05-15')
  const find = (key) => byDate15.find((m) => m.metricKey === key)

  assert.equal(find('spend_paid_social').metricValue, 120.5)
  assert.equal(find('impressions_paid_social').metricValue, 10000)
  assert.equal(find('clicks_paid_social').metricValue, 250)
  // cpc = spend/clicks, cpm = spend/impressions*1000
  assert.ok(Math.abs(find('cost_per_click_paid').metricValue - 120.5 / 250) < 1e-9)
  assert.ok(Math.abs(find('cost_per_mille_paid').metricValue - (120.5 / 10000) * 1000) < 1e-9)
  // actions = purchase(3) + lead(2), link_click n'est pas dans la liste de conversion
  assert.equal(find('conversions_paid_social').metricValue, 5)
})

test('normalizeData: jour sans spend/clicks/impressions ne pousse aucune metric dérivée ni actions', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData(FAKE_INSIGHTS_RESPONSE)
  const byDate16 = metrics.filter((m) => m.date === '2025-05-16')
  // spend=0 et impressions=0/clicks=0 → toujours spend/impressions/clicks poussés (valeurs 0 valides)
  // mais pas de cpc/cpm (division évitée) ni conversions (actions vide)
  assert.ok(!byDate16.some((m) => m.metricKey === 'cost_per_click_paid'))
  assert.ok(!byDate16.some((m) => m.metricKey === 'cost_per_mille_paid'))
  assert.ok(!byDate16.some((m) => m.metricKey === 'conversions_paid_social'))
})

test('normalizeData ignores rows without date_start', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({
    data: [{ spend: '10', impressions: '1', clicks: '1', actions: [] }],
  })
  assert.deepEqual(metrics, [])
})

test('normalizeData handles missing data array', async () => {
  const c = newConnector()
  const { metrics } = await c.normalizeData({})
  assert.deepEqual(metrics, [])
})

test('fetchData hits Graph API insights endpoint with account_id prefixed act_', async () => {
  const originalFetch = global.fetch
  let capturedUrl
  global.fetch = async (url) => {
    capturedUrl = new URL(url)
    return { ok: true, json: async () => FAKE_INSIGHTS_RESPONSE }
  }
  try {
    const c = newConnector({ account_id: '999888777' })
    await c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' })

    assert.equal(capturedUrl.pathname, '/v21.0/act_999888777/insights')
    assert.equal(capturedUrl.searchParams.get('access_token'), 'fake-access-token')
    assert.equal(capturedUrl.searchParams.get('level'), 'account')
    assert.equal(capturedUrl.searchParams.get('time_increment'), '1')
    assert.deepEqual(JSON.parse(capturedUrl.searchParams.get('time_range')), {
      since: '2025-05-01',
      until: '2025-05-31',
    })
  } finally {
    global.fetch = originalFetch
  }
})

test('fetchData accepte account_id déjà préfixé "act_" sans double préfixe', async () => {
  const originalFetch = global.fetch
  let capturedUrl
  global.fetch = async (url) => {
    capturedUrl = new URL(url)
    return { ok: true, json: async () => FAKE_INSIGHTS_RESPONSE }
  }
  try {
    const c = newConnector({ account_id: 'act_999888777' })
    await c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' })
    assert.equal(capturedUrl.pathname, '/v21.0/act_999888777/insights')
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

test('fetchData throws INVALID_CREDENTIALS on 401', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'Invalid token' })
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

test('fetchData throws INVALID_CREDENTIALS on 400 mentioning token (Meta pattern)', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => '{"error":{"message":"Error validating access token"}}',
  })
  try {
    const c = newConnector()
    await assert.rejects(
      () => c.fetchData({ startDate: '2025-05-01', endDate: '2025-05-31' }),
      (err) => err.code === 'INVALID_CREDENTIALS',
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('fetchData throws API_ERROR on 400 unrelated to token', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => '{"error":{"message":"Unsupported get request"}}',
  })
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
  global.fetch = async () => ({ ok: true, json: async () => ({ id: '123', name: 'Acme' }) })
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

test('factory returns MetaAdsConnector instance for source=meta_ads', () => {
  const { getConnector } = require('../src/connectors')
  const c = getConnector('ws-id', {
    id: 'c-id',
    source: 'meta_ads',
    account_id: '123',
    access_token: 't',
  })
  assert.equal(c.constructor.name, 'MetaAdsConnector')
  assert.equal(c.source, 'meta_ads')
})
