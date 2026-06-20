// Tests : exécution des tools chat (chat-tools.js).

const test = require('node:test')
const assert = require('node:assert/strict')

const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const INSIGHTS_PATH = require.resolve('../src/services/insights/insights.service')
const HEALTH_PATH = require.resolve('../src/services/health/health-score.service')
const TOOLS_PATH = require.resolve('../src/services/ai/chat-tools')

function load({ metrics = [], insights = [], actions = [], health = null } = {}) {
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH,
    filename: CANONICAL_PATH,
    loaded: true,
    exports: { query: async () => metrics },
  }
  require.cache[INSIGHTS_PATH] = {
    id: INSIGHTS_PATH,
    filename: INSIGHTS_PATH,
    loaded: true,
    exports: {
      listInsights: async () => insights,
      listActions: async () => actions,
    },
  }
  require.cache[HEALTH_PATH] = {
    id: HEALTH_PATH,
    filename: HEALTH_PATH,
    loaded: true,
    exports: {
      getScore: async () =>
        health || {
          score: 72,
          delta: 3,
          breakdown: { revenue: 80 },
          has_data: true,
        },
    },
  }
  delete require.cache[TOOLS_PATH]
  return require(TOOLS_PATH)
}

test('DECLARATIONS : 6 tools déclarés', () => {
  const tools = load()
  assert.equal(tools.DECLARATIONS.length, 6)
  const names = tools.DECLARATIONS.map((d) => d.name).sort()
  assert.deepEqual(names, [
    'create_action_card',
    'create_watch',
    'get_health_score',
    'get_metric_series',
    'list_pending_actions',
    'list_top_insights',
  ])
})

test('execute : no workspaceId → error', async () => {
  const tools = load()
  const r = await tools.execute({ name: 'get_health_score', args: {} }, {})
  assert.equal(r.error, 'no_workspace')
})

test('execute : get_health_score → score + breakdown', async () => {
  const tools = load({ health: { score: 85, delta: -2, breakdown: { x: 1 }, has_data: true } })
  const r = await tools.execute({ name: 'get_health_score', args: {} }, { workspaceId: 'ws-1' })
  assert.equal(r.score, 85)
  assert.equal(r.delta_7d, -2)
  assert.deepEqual(r.breakdown, { x: 1 })
})

test('execute : list_top_insights → cap au limit', async () => {
  const tools = load({
    insights: [
      { id: 'i1', title: 'A', summary: 'a', severity: 'critical', created_at: '2025-01-01' },
      { id: 'i2', title: 'B', summary: 'b', severity: 'warning', created_at: '2025-01-02' },
    ],
  })
  const r = await tools.execute(
    { name: 'list_top_insights', args: { limit: 5 } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.count, 2)
  assert.equal(r.items[0].id, 'i1')
})

test('execute : list_pending_actions → bucket validé', async () => {
  const tools = load({
    actions: [{ id: 'a1', title: 'do x', status: 'todo', priority: 2 }],
  })
  const r = await tools.execute(
    { name: 'list_pending_actions', args: { bucket: 'today' } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.bucket, 'today')
  assert.equal(r.items[0].status, 'todo')
})

test('execute : list_pending_actions → bucket invalide → fallback active', async () => {
  const tools = load({ actions: [] })
  const r = await tools.execute(
    { name: 'list_pending_actions', args: { bucket: 'haxor' } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.bucket, 'active')
})

test('execute : get_metric_series → agrège par date + résumé', async () => {
  const tools = load({
    metrics: [
      { date: '2025-01-03', metric_value: 10, source: 'ga4' },
      { date: '2025-01-01', metric_value: 5, source: 'ga4' },
      { date: '2025-01-02', metric_value: 8, source: 'ga4' },
      { date: '2025-01-02', metric_value: 2, source: 'meta_ads' }, // somme avec celle du dessus
    ],
  })
  const r = await tools.execute(
    { name: 'get_metric_series', args: { metric_key: 'sessions_all', days: 7 } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.metric_key, 'sessions_all')
  assert.equal(r.point_count, 3)
  assert.equal(r.total, 25) // 5+8+2+10
  assert.equal(r.points[0].date, '2025-01-01')
  assert.equal(r.points[1].value, 10) // 8+2 sommés
  assert.equal(r.points[2].date, '2025-01-03')
  assert.deepEqual(r.sources.sort(), ['ga4', 'meta_ads'])
})

test('execute : get_metric_series sans metric_key → error', async () => {
  const tools = load()
  const r = await tools.execute(
    { name: 'get_metric_series', args: {} },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.error, 'metric_key required')
})

test('execute : tool inconnu → error unknown_tool', async () => {
  const tools = load()
  const r = await tools.execute({ name: 'evil', args: {} }, { workspaceId: 'ws-1' })
  assert.match(r.error, /unknown_tool/)
})

test('execute : days cappé à [1, 90]', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    { name: 'get_metric_series', args: { metric_key: 'x', days: 9999 } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.days, 90)
})
