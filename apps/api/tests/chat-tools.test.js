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

test('DECLARATIONS : 13 tools déclarés (22c ajoute analyze_performance + analyze_journey)', () => {
  const tools = load()
  assert.equal(tools.DECLARATIONS.length, 13)
  const names = tools.DECLARATIONS.map((d) => d.name).sort()
  assert.deepEqual(names, [
    'analyze_journey',
    'analyze_performance',
    'build_dashboard_preview',
    'compare_metrics',
    'compute_funnel',
    'compute_table_from_metrics',
    'create_action_card',
    'create_watch',
    'get_health_score',
    'get_metric_series',
    'get_traffic_sources',
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lot V2.2 — compute_table_from_metrics + compare_metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('compute_table_from_metrics : sans metric_keys → error', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    { name: 'compute_table_from_metrics', args: {} },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.error, 'metric_keys_required')
})

test('compute_table_from_metrics : agrege par source, tri desc, cap 10', async () => {
  const metrics = [
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 100, date: '2026-06-01' },
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 50, date: '2026-06-02' },
    { source: 'meta_ads', metric_key: 'sessions_all', metric_value: 300, date: '2026-06-01' },
    { source: 'google_ads', metric_key: 'sessions_all', metric_value: 200, date: '2026-06-01' },
  ]
  const tools = load({ metrics })
  const r = await tools.execute(
    { name: 'compute_table_from_metrics', args: { metric_keys: ['sessions_all'], days: 7 } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.kind, 'table')
  assert.deepEqual(r.columns, ['source', 'sessions_all'])
  // Meta = 300 doit etre 1er, google_ads = 200 2e, ga4 = 150 3e.
  assert.equal(r.rows[0].source, 'meta_ads')
  assert.equal(r.rows[0].sessions_all, 300)
  assert.equal(r.rows[1].source, 'google_ads')
  assert.equal(r.rows[2].source, 'ga4')
  assert.equal(r.rows[2].sessions_all, 150)
  assert.equal(r.truncated, false)
})

test('compute_table_from_metrics : truncated=true quand > 10 sources', async () => {
  const metrics = []
  for (let i = 0; i < 12; i++) {
    metrics.push({ source: `s${i}`, metric_key: 'x', metric_value: i, date: '2026-06-01' })
  }
  const tools = load({ metrics })
  const r = await tools.execute(
    { name: 'compute_table_from_metrics', args: { metric_keys: ['x'] } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.rows.length, 10)
  assert.equal(r.truncated, true)
})

test('compute_table_from_metrics : metric_keys cappe a 4', async () => {
  const metrics = [
    { source: 'ga4', metric_key: 'a', metric_value: 1, date: '2026-06-01' },
  ]
  const tools = load({ metrics })
  const r = await tools.execute(
    {
      name: 'compute_table_from_metrics',
      args: { metric_keys: ['a', 'b', 'c', 'd', 'e', 'f'] },
    },
    { workspaceId: 'ws-1' },
  )
  // 4 metrics + 'source' = 5 colonnes max
  assert.equal(r.columns.length, 5)
})

test('compare_metrics : sources manquantes → error', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    { name: 'compare_metrics', args: { metric_key: 'x', source_a: 'ga4' } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.error, 'metric_key_and_two_sources_required')
})

test('compare_metrics : retourne 2 series cote a cote', async () => {
  // Pour ce test on utilise un mock qui filtre par source.
  const allMetrics = [
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 100, date: '2026-06-01' },
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 200, date: '2026-06-02' },
    { source: 'meta_ads', metric_key: 'sessions_all', metric_value: 50, date: '2026-06-01' },
    { source: 'meta_ads', metric_key: 'sessions_all', metric_value: 75, date: '2026-06-02' },
  ]
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH,
    filename: CANONICAL_PATH,
    loaded: true,
    exports: {
      query: async ({ source }) => {
        if (!source || source.length === 0) return allMetrics
        return allMetrics.filter((m) => source.includes(m.source))
      },
    },
  }
  delete require.cache[TOOLS_PATH]
  const tools = require(TOOLS_PATH)
  const r = await tools.execute(
    {
      name: 'compare_metrics',
      args: { metric_key: 'sessions_all', source_a: 'ga4', source_b: 'meta_ads' },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.kind, 'compare')
  assert.equal(r.left.source, 'ga4')
  assert.equal(r.left.total, 300)
  assert.equal(r.right.source, 'meta_ads')
  assert.equal(r.right.total, 125)
  assert.equal(r.left.points.length, 2)
  assert.equal(r.right.points.length, 2)
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lot V2.3 — compute_funnel + build_dashboard_preview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('compute_funnel : moins de 2 etapes → error', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    { name: 'compute_funnel', args: { steps: ['sessions_all'] } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.error, 'funnel_needs_2_to_6_steps')
})

test('compute_funnel : 3 etapes → retention %', async () => {
  const metrics = [
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 1000, date: '2026-06-01' },
    { source: 'ga4', metric_key: 'add_to_cart', metric_value: 250, date: '2026-06-01' },
    { source: 'ga4', metric_key: 'orders_count', metric_value: 50, date: '2026-06-01' },
  ]
  const tools = load({ metrics })
  const r = await tools.execute(
    {
      name: 'compute_funnel',
      args: { steps: ['sessions_all', 'add_to_cart', 'orders_count'], days: 7 },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.kind, 'funnel')
  assert.equal(r.steps.length, 3)
  assert.equal(r.steps[0].value, 1000)
  assert.equal(r.steps[0].retentionPct, null) // 1ere etape
  assert.equal(r.steps[1].value, 250)
  assert.equal(r.steps[1].retentionPct, 25) // 250/1000
  assert.equal(r.steps[2].retentionPct, 20) // 50/250
})

test('compute_funnel : cap a 6 etapes', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    {
      name: 'compute_funnel',
      args: { steps: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.steps.length, 6)
})

test('build_dashboard_preview : sans metric_keys → error', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    { name: 'build_dashboard_preview', args: {} },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.error, 'metric_keys_required')
})

test('build_dashboard_preview : 4 KPIs avec delta vs N-1', async () => {
  // Mock canonical query qui renvoie selon la fenetre date.
  const today = new Date()
  const d = (offset) => new Date(today.getTime() - offset * 86400_000).toISOString().slice(0, 10)
  const allMetrics = [
    // Periode courante (0-30j)
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 200, date: d(5) },
    { source: 'ga4', metric_key: 'revenue_ecommerce', metric_value: 1000, date: d(5) },
    // Periode precedente (31-60j)
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 100, date: d(40) },
    { source: 'ga4', metric_key: 'revenue_ecommerce', metric_value: 800, date: d(40) },
  ]
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH,
    filename: CANONICAL_PATH,
    loaded: true,
    exports: {
      query: async ({ startDate, endDate }) => {
        // Filtre cote mock par date.
        return allMetrics.filter((m) => m.date >= startDate && m.date <= endDate)
      },
    },
  }
  delete require.cache[TOOLS_PATH]
  const tools = require(TOOLS_PATH)
  const r = await tools.execute(
    {
      name: 'build_dashboard_preview',
      args: { metric_keys: ['sessions_all', 'revenue_ecommerce'], days: 30 },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.kind, 'dashboard')
  assert.equal(r.cards.length, 2)
  const sess = r.cards.find((c) => c.metricKey === 'sessions_all')
  assert.equal(sess.value, 200)
  assert.equal(sess.previousValue, 100)
  assert.equal(sess.deltaPct, 100) // +100%
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cahier 22c — analyze_performance (verdict response format)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('analyze_performance : sans metric_keys → error', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    { name: 'analyze_performance', args: {} },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.error, 'metric_keys_required')
})

test('analyze_performance : 0 rows → pattern=unavailable', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    {
      name: 'analyze_performance',
      args: { metric_keys: ['revenue_ecommerce'], pattern: 'campaigns', days: 30 },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.pattern, 'unavailable')
  assert.equal(r.winner, null)
  assert.equal(r.rows, null)
  assert.ok(Array.isArray(r.actions) && r.actions.length > 0)
})

test('analyze_performance : groupe par source + tri desc + statut quartiles', async () => {
  const metrics = [
    // meta_ads = 5000 (TOP)
    { source: 'meta_ads', metric_key: 'revenue_ecommerce', metric_value: 3000, date: '2026-06-01' },
    { source: 'meta_ads', metric_key: 'revenue_ecommerce', metric_value: 2000, date: '2026-06-02' },
    // google_ads = 3000 (BON)
    { source: 'google_ads', metric_key: 'revenue_ecommerce', metric_value: 3000, date: '2026-06-01' },
    // ga4 = 1000 (MOYEN)
    { source: 'ga4', metric_key: 'revenue_ecommerce', metric_value: 1000, date: '2026-06-01' },
    // stripe = 500 (FAIBLE) → 4 sources, quartile classique
    { source: 'stripe', metric_key: 'revenue_ecommerce', metric_value: 500, date: '2026-06-01' },
  ]
  const tools = load({ metrics })
  const r = await tools.execute(
    {
      name: 'analyze_performance',
      args: { metric_keys: ['revenue_ecommerce'], pattern: 'campaigns', days: 30 },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.pattern, 'campaigns')
  assert.equal(r.header.title, 'Performance par canal')
  assert.match(r.header.context, /Canaux/)
  assert.match(r.header.context, /30j/)
  // Winner = meta_ads (label localisé).
  assert.equal(r.winner.name, 'Meta Ads')
  assert.equal(r.winner.status, 'TOP')
  assert.ok(r.winner.metrics[0].highlight)
  // Rows : 4 sources, triées desc sur la métrique principale.
  assert.equal(r.rows.length, 4)
  assert.equal(r.rows[0].id, 'meta_ads')
  assert.equal(r.rows[0].status, 'TOP')
  assert.equal(r.rows[1].id, 'google_ads')
  assert.equal(r.rows[1].status, 'BON')
  assert.equal(r.rows[2].id, 'ga4')
  assert.equal(r.rows[2].status, 'MOYEN')
  assert.equal(r.rows[3].id, 'stripe')
  assert.equal(r.rows[3].status, 'FAIBLE')
  // value (chiffre brut) = somme par source, valueLabel formaté €.
  assert.equal(r.rows[0].value, 5000)
  assert.match(r.rows[0].valueLabel, /5\s?000/)
  // Actions auto-générées : au moins 1 sur le gagnant + 1 sur les faibles.
  assert.ok(r.actions.length >= 2)
  assert.match(r.actions[0].text, /Meta Ads/)
})

test('analyze_performance : pattern par défaut = campaigns, metric_keys cappe à 3', async () => {
  const metrics = [
    { source: 'ga4', metric_key: 'a', metric_value: 10, date: '2026-06-01' },
  ]
  const tools = load({ metrics })
  const r = await tools.execute(
    {
      name: 'analyze_performance',
      args: { metric_keys: ['a', 'b', 'c', 'd', 'e'] }, // 5 → doit être limité à 3
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.pattern, 'campaigns')
  // Winner.metrics = 3 (1 par metric_key conservée).
  assert.equal(r.winner.metrics.length, 3)
})

test('statusForRank : règles quartiles + cas N<=3', () => {
  const tools = load()
  // N=1 → toujours TOP
  assert.equal(tools.statusForRank(0, 1), 'TOP')
  // N=2 → TOP, BON
  assert.equal(tools.statusForRank(0, 2), 'TOP')
  assert.equal(tools.statusForRank(1, 2), 'BON')
  // N=3 → TOP, BON, MOYEN
  assert.equal(tools.statusForRank(2, 3), 'MOYEN')
  // N=4 → quartile : 0=TOP, 1=BON, 2=MOYEN, 3=FAIBLE
  assert.equal(tools.statusForRank(0, 4), 'TOP')
  assert.equal(tools.statusForRank(3, 4), 'FAIBLE')
  // N=8 → 0-1=TOP, 2-3=BON, 4-5=MOYEN, 6-7=FAIBLE
  assert.equal(tools.statusForRank(0, 8), 'TOP')
  assert.equal(tools.statusForRank(1, 8), 'TOP')
  assert.equal(tools.statusForRank(7, 8), 'FAIBLE')
})

test('analyze_performance : verdict mentionne le gap entre 1er et 2e', async () => {
  const metrics = [
    { source: 'meta_ads', metric_key: 'conversions_total', metric_value: 200, date: '2026-06-01' },
    { source: 'ga4', metric_key: 'conversions_total', metric_value: 100, date: '2026-06-01' },
  ]
  const tools = load({ metrics })
  const r = await tools.execute(
    {
      name: 'analyze_performance',
      args: { metric_keys: ['conversions_total'], days: 30 },
    },
    { workspaceId: 'ws-1' },
  )
  // Gap ×2.0 → "x2" ou "×2,0" (FR)
  assert.match(r.verdict, /Meta Ads/)
  assert.match(r.verdict, /×2/)
  assert.match(r.verdict, /GA4/)
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cahier 22c — analyze_journey (verdict pattern=journey)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('analyze_journey : moins de 2 étapes → error', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    { name: 'analyze_journey', args: { steps: ['sessions_all'] } },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.error, 'journey_needs_2_to_6_steps')
})

test('analyze_journey : aucune valeur → pattern=unavailable', async () => {
  const tools = load({ metrics: [] })
  const r = await tools.execute(
    {
      name: 'analyze_journey',
      args: { steps: ['sessions_all', 'orders_count'], days: 30 },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.pattern, 'unavailable')
  assert.equal(r.journey, undefined) // pas de journey sur unavailable
  assert.match(r.verdict, /funnel/i)
})

test('analyze_journey : retention par étape + status par seuils', async () => {
  const metrics = [
    // sessions = 1000 (TOP, 1ere étape)
    { source: 'ga4', metric_key: 'sessions_all', metric_value: 1000, date: '2026-06-01' },
    // add_to_cart = 700 (rétention 70% → TOP)
    { source: 'ga4', metric_key: 'add_to_cart', metric_value: 700, date: '2026-06-01' },
    // orders_count = 50 (rétention 7.1% → FAIBLE)
    { source: 'ga4', metric_key: 'orders_count', metric_value: 50, date: '2026-06-01' },
  ]
  const tools = load({ metrics })
  const r = await tools.execute(
    {
      name: 'analyze_journey',
      args: { steps: ['sessions_all', 'add_to_cart', 'orders_count'], days: 30 },
    },
    { workspaceId: 'ws-1' },
  )
  assert.equal(r.pattern, 'journey')
  assert.equal(r.header.title, 'Parcours utilisateur')
  assert.equal(r.journey.steps.length, 3)
  // Étape 0 : 1ere, retentionPct=null, status=TOP
  assert.equal(r.journey.steps[0].retentionPct, null)
  assert.equal(r.journey.steps[0].status, 'TOP')
  assert.equal(r.journey.steps[0].value, 1000)
  // Étape 1 : 70% → TOP
  assert.equal(r.journey.steps[1].retentionPct, 70)
  assert.equal(r.journey.steps[1].status, 'TOP')
  // Étape 2 : 50/700 = 7.1% → FAIBLE
  assert.equal(r.journey.steps[2].retentionPct, 7.1)
  assert.equal(r.journey.steps[2].status, 'FAIBLE')
  // Verdict cite la pire transition (add_to_cart → orders_count) avec ~93% perdus
  assert.match(r.verdict, /add/i)
  assert.match(r.verdict, /commande/i)
  // Action prioritaire = audit du drop-off > 45%
  assert.ok(r.actions.length >= 1)
  assert.match(r.actions[0].text, /Auditer/)
})

test('statusForRetention : seuils 60 / 35 / 15', () => {
  const tools = load()
  assert.equal(tools.statusForRetention(null), 'TOP') // 1ere étape
  assert.equal(tools.statusForRetention(75), 'TOP')
  assert.equal(tools.statusForRetention(60), 'TOP')
  assert.equal(tools.statusForRetention(50), 'BON')
  assert.equal(tools.statusForRetention(35), 'BON')
  assert.equal(tools.statusForRetention(20), 'MOYEN')
  assert.equal(tools.statusForRetention(10), 'FAIBLE')
  assert.equal(tools.statusForRetention(0), 'FAIBLE')
})
