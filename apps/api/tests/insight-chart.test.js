// Tests insightsService.getInsightChart : résolution des points depuis
// canonical_metrics (le LLM n'émet jamais les data).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const SERVICE_PATH = require.resolve('../src/services/insights/insights.service')

function load({ insight = undefined, metricRows = [] } = {}) {
  const insightsChain = {
    select() { return this },
    eq() { return this },
    maybeSingle: async () => ({ data: insight === undefined ? null : insight, error: null }),
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: {
      getServiceRoleClient: () => ({ from: () => insightsChain }),
      getAnonClient: () => ({}),
      getUserScopedClient: () => ({}),
    },
  }
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH, filename: CANONICAL_PATH, loaded: true,
    exports: { query: async () => metricRows },
  }
  delete require.cache[SERVICE_PATH]
  return require(SERVICE_PATH)
}

test('getInsightChart résout les points triés par date', async () => {
  const svc = load({
    insight: {
      id: 'i1',
      workspace_id: 'ws-1',
      chart_spec: { chart_type: 'line', title: 'CPA', metric_key: 'cost_per_acquisition_paid', source: 'meta_ads' },
      period_start: '2026-06-01',
      period_end: '2026-06-10',
    },
    metricRows: [
      { date: '2026-06-03', metric_value: 45, source: 'meta_ads' },
      { date: '2026-06-01', metric_value: 40, source: 'meta_ads' },
      { date: '2026-06-02', metric_value: 42, source: 'meta_ads' },
    ],
  })
  const chart = await svc.getInsightChart('ws-1', 'i1')
  assert.ok(chart)
  assert.equal(chart.chart_type, 'line')
  assert.equal(chart.metric_key, 'cost_per_acquisition_paid')
  assert.deepEqual(chart.points.map((p) => p.date), ['2026-06-01', '2026-06-02', '2026-06-03'])
  assert.equal(chart.points[0].value, 40)
})

test('getInsightChart : pas de chart_spec → null', async () => {
  const svc = load({
    insight: { id: 'i1', workspace_id: 'ws-1', chart_spec: null, period_start: null, period_end: null },
  })
  assert.equal(await svc.getInsightChart('ws-1', 'i1'), null)
})

test('getInsightChart : chart_spec sans metric_key → null', async () => {
  const svc = load({
    insight: { id: 'i1', workspace_id: 'ws-1', chart_spec: { chart_type: 'line' }, period_start: null, period_end: null },
  })
  assert.equal(await svc.getInsightChart('ws-1', 'i1'), null)
})

test('getInsightChart : aucune donnée sur la période → null', async () => {
  const svc = load({
    insight: { id: 'i1', workspace_id: 'ws-1', chart_spec: { chart_type: 'bar', metric_key: 'sessions_all' }, period_start: '2026-06-01', period_end: '2026-06-10' },
    metricRows: [],
  })
  assert.equal(await svc.getInsightChart('ws-1', 'i1'), null)
})

test('getInsightChart : insight introuvable → NotFoundError', async () => {
  const svc = load({ insight: undefined })
  await assert.rejects(() => svc.getInsightChart('ws-1', 'i-missing'))
})

test('getInsightChart : somme les valeurs d\'une même date', async () => {
  const svc = load({
    insight: { id: 'i1', workspace_id: 'ws-1', chart_spec: { chart_type: 'line', metric_key: 'sessions_all' }, period_start: '2026-06-01', period_end: '2026-06-10' },
    metricRows: [
      { date: '2026-06-01', metric_value: 10, source: 'ga4' },
      { date: '2026-06-01', metric_value: 5, source: 'ga4' },
    ],
  })
  const chart = await svc.getInsightChart('ws-1', 'i1')
  assert.equal(chart.points.length, 1)
  assert.equal(chart.points[0].value, 15)
})
