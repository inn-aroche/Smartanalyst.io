// Tests évaluation watches : logique pure + intégration evaluateOne mocké.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const DIGEST_PATH = require.resolve('../src/services/notifications/digest.service')
const SERVICE_PATH = require.resolve('../src/services/watches/watch-evaluator.service')

function loadIsolated() {
  delete require.cache[SERVICE_PATH]
  return require(SERVICE_PATH)
}

// ─── Logique pure : evaluateCondition ──────────────────────────────────────

test('drops_below : déclenche quand latest < threshold', () => {
  const svc = loadIsolated()
  assert.equal(svc.evaluateCondition('drops_below', 50, 100, 60).triggered, true)
  assert.equal(svc.evaluateCondition('drops_below', 70, 100, 60).triggered, false)
})

test('rises_above : déclenche quand latest > threshold', () => {
  const svc = loadIsolated()
  assert.equal(svc.evaluateCondition('rises_above', 150, 100, 120).triggered, true)
  assert.equal(svc.evaluateCondition('rises_above', 100, 100, 120).triggered, false)
})

test('changes_by_pct : déclenche sur variation absolue ≥ seuil', () => {
  const svc = loadIsolated()
  // +25% vs threshold 20 → trigger
  assert.equal(svc.evaluateCondition('changes_by_pct', 125, 100, 20).triggered, true)
  // -25% vs threshold 20 → trigger
  assert.equal(svc.evaluateCondition('changes_by_pct', 75, 100, 20).triggered, true)
  // +15% vs threshold 20 → pas de trigger
  assert.equal(svc.evaluateCondition('changes_by_pct', 115, 100, 20).triggered, false)
})

test('changes_by_pct : previous null ou zéro → pas de trigger', () => {
  const svc = loadIsolated()
  assert.equal(svc.evaluateCondition('changes_by_pct', 100, null, 20).triggered, false)
  assert.equal(svc.evaluateCondition('changes_by_pct', 100, 0, 20).triggered, false)
})

test('any_change : déclenche quand latest !== previous', () => {
  const svc = loadIsolated()
  assert.equal(svc.evaluateCondition('any_change', 100, 99, 0).triggered, true)
  assert.equal(svc.evaluateCondition('any_change', 100, 100, 0).triggered, false)
  assert.equal(svc.evaluateCondition('any_change', 100, null, 0).triggered, false)
})

test('operator inconnu → pas de trigger', () => {
  const svc = loadIsolated()
  assert.equal(svc.evaluateCondition('evil_op', 100, 50, 10).triggered, false)
})

// ─── evaluateOne : intégration mockée ────────────────────────────────────

function load({ metrics = [], insightInsertError = null, recentlyTriggered = false }) {
  const captured = { insightRow: null, watchUpdate: null, alertSent: null }
  const chain = {
    select() {
      return this
    },
    eq() {
      return this
    },
    insert(row) {
      captured.insightRow = row
      return this
    },
    update(row) {
      captured.watchUpdate = row
      return this
    },
    single: async () => {
      if (insightInsertError) return { data: null, error: insightInsertError }
      return { data: { id: 'insight-1' }, error: null }
    },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { getServiceRoleClient: () => ({ from: () => chain }) },
  }
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH,
    filename: CANONICAL_PATH,
    loaded: true,
    exports: { query: async () => metrics },
  }
  require.cache[DIGEST_PATH] = {
    id: DIGEST_PATH,
    filename: DIGEST_PATH,
    loaded: true,
    exports: {
      sendCriticalAlert: async (_ws, insight) => {
        captured.alertSent = insight
        return { sent: true }
      },
    },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), captured }
}

test('evaluateOne : debounce 24h respecté', async () => {
  const { svc, captured } = load({ metrics: [{ date: '2026-06-14', metric_value: 10 }] })
  const watch = {
    id: 'w-1',
    workspace_id: 'ws-1',
    metric_key: 'sessions_all',
    operator: 'drops_below',
    threshold: 100,
    last_triggered_at: new Date(Date.now() - 1 * 3600_000).toISOString(), // 1h ago
  }
  const fired = await svc.evaluateOne(watch)
  assert.equal(fired, false)
  assert.equal(captured.insightRow, null)
})

test('evaluateOne : pas de metric → pas de trigger', async () => {
  const { svc, captured } = load({ metrics: [] })
  const watch = {
    id: 'w-1',
    workspace_id: 'ws-1',
    metric_key: 'sessions_all',
    operator: 'drops_below',
    threshold: 100,
  }
  const fired = await svc.evaluateOne(watch)
  assert.equal(fired, false)
  assert.equal(captured.insightRow, null)
})

test('evaluateOne : drops_below → insight créé + watch updated', async () => {
  const { svc, captured } = load({
    metrics: [{ date: '2026-06-14', metric_value: 50, source: 'ga4' }],
  })
  const watch = {
    id: 'w-1',
    workspace_id: 'ws-1',
    metric_key: 'sessions_all',
    operator: 'drops_below',
    threshold: 100,
    description: 'Surveille mes sessions',
    notify_email: false,
    triggered_count: 0,
  }
  const fired = await svc.evaluateOne(watch)
  assert.equal(fired, true)
  assert.equal(captured.insightRow.severity, 'critical')
  assert.equal(captured.insightRow.category, 'custom_watch')
  assert.match(captured.insightRow.title, /Surveille mes sessions/)
  assert.equal(captured.insightRow.evidence[0].value, 50)
  assert.equal(captured.watchUpdate.triggered_count, 1)
  assert.equal(captured.alertSent, null) // notify_email=false → pas d'email
})

test('evaluateOne : notify_email=true → alerte critique envoyée', async () => {
  const { svc, captured } = load({
    metrics: [{ date: '2026-06-14', metric_value: 50, source: 'ga4' }],
  })
  const watch = {
    id: 'w-1',
    workspace_id: 'ws-1',
    metric_key: 'sessions_all',
    operator: 'drops_below',
    threshold: 100,
    description: 'Sessions',
    notify_email: true,
    triggered_count: 0,
  }
  await svc.evaluateOne(watch)
  assert.ok(captured.alertSent)
  assert.equal(captured.alertSent.severity, 'critical')
})

test('evaluateOne : dedup_key collision (23505) → silencieux, pas de throw', async () => {
  const { svc } = load({
    metrics: [{ date: '2026-06-14', metric_value: 50, source: 'ga4' }],
    insightInsertError: { code: '23505', message: 'duplicate dedup_key' },
  })
  const watch = {
    id: 'w-1',
    workspace_id: 'ws-1',
    metric_key: 'sessions_all',
    operator: 'drops_below',
    threshold: 100,
    description: 'X',
    notify_email: false,
  }
  // Ne doit pas throw même si l'insert renvoie l'erreur unique constraint.
  await svc.evaluateOne(watch)
})
