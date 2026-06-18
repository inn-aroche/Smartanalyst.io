// Tests beta-stats : agrégation funnel + costs + signups récents.
// On mock Supabase au niveau du module pour piloter les retours par table.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/admin/beta-stats.service')

/**
 * Construit un mock Supabase qui dispatch par nom de table. Chaque table
 * mock supporte la pattern `.from(t).select().eq()…` qu'on utilise dans
 * le service, en gardant le résultat statique.
 */
function buildSupabaseMock(tables) {
  function chain(rows) {
    const result = { data: rows, error: null }
    const handler = {
      get(target, prop) {
        // .then() : rend le chain awaitable comme une promesse
        if (prop === 'then') {
          return (resolve) => Promise.resolve(result).then(resolve)
        }
        // n'importe quel autre call de méthode retourne le proxy
        return () => proxy
      },
    }
    const proxy = new Proxy({}, handler)
    return proxy
  }
  return {
    from(tableName) {
      const rows = tables[tableName] || []
      return chain(rows)
    },
  }
}

function loadSvc(tables) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { getServiceRoleClient: () => buildSupabaseMock(tables) },
  }
  delete require.cache[SERVICE_PATH]
  return require(SERVICE_PATH)
}

test('getOverview : totals + funnel + ratios cohérents', async () => {
  const now = Date.now()
  const day = 86_400_000
  const tables = {
    workspaces: [
      { id: 'ws-1', name: 'Acme', organization_id: 'org-1', created_at: new Date(now).toISOString() },
      { id: 'ws-2', name: 'Beta', organization_id: 'org-2', created_at: new Date(now - 3 * day).toISOString() },
      { id: 'ws-3', name: 'Charlie', organization_id: 'org-3', created_at: new Date(now - 20 * day).toISOString() },
      { id: 'ws-4', name: 'Delta', organization_id: 'org-4', created_at: new Date(now - 60 * day).toISOString() },
    ],
    organizations: [
      { id: 'org-1', email: 'a@a.com', name: 'Acme Co' },
      { id: 'org-2', email: 'b@b.com', name: 'Beta Co' },
      { id: 'org-3', email: 'c@c.com', name: 'Charlie Co' },
      { id: 'org-4', email: 'd@d.com', name: 'Delta Co' },
    ],
    connectors: [{ workspace_id: 'ws-1' }, { workspace_id: 'ws-2' }],
    canonical_metrics: [{ workspace_id: 'ws-1' }],
    audit_logs: [
      { workspace_id: 'ws-1', created_at: new Date(now).toISOString() },
      { workspace_id: 'ws-1', created_at: new Date(now - 30 * 60_000).toISOString() },
      { workspace_id: 'ws-2', created_at: new Date(now - 2 * day).toISOString() },
    ],
    watches: [{ workspace_id: 'ws-1' }],
    insights: [],
    ai_usage: [
      { workspace_id: 'ws-1', cost_usd: 0.45, input_tokens: 1000, output_tokens: 500 },
      { workspace_id: 'ws-2', cost_usd: 0.12, input_tokens: 300, output_tokens: 200 },
    ],
  }

  const svc = loadSvc(tables)
  const o = await svc.getOverview()

  assert.equal(o.totals.workspaces, 4)
  assert.equal(o.totals.last7d, 2)
  assert.equal(o.totals.last30d, 3)

  const funnelByStep = Object.fromEntries(o.funnel.map((f) => [f.step, f]))
  assert.equal(funnelByStep.signed_up.count, 4)
  assert.equal(funnelByStep.signed_up.ratio, 100)
  assert.equal(funnelByStep.connected_source.count, 2)
  assert.equal(funnelByStep.connected_source.ratio, 50)
  assert.equal(funnelByStep.received_data.count, 1)
  assert.equal(funnelByStep.asked_chat.count, 2)
  assert.equal(funnelByStep.created_watch.count, 1)
  assert.equal(funnelByStep.got_insight.count, 0)
  assert.equal(funnelByStep.got_insight.ratio, 0)
})

test('getOverview : top coûts triés desc et limités à costsLimit', async () => {
  const tables = {
    workspaces: [],
    organizations: [],
    connectors: [],
    canonical_metrics: [],
    audit_logs: [],
    watches: [],
    insights: [],
    ai_usage: [
      { workspace_id: 'cheap', cost_usd: 0.01, input_tokens: 10, output_tokens: 5 },
      { workspace_id: 'medium', cost_usd: 1.5, input_tokens: 3000, output_tokens: 1000 },
      { workspace_id: 'expensive', cost_usd: 8.25, input_tokens: 15_000, output_tokens: 5000 },
      { workspace_id: 'expensive', cost_usd: 1.0, input_tokens: 1000, output_tokens: 800 },
    ],
  }
  const svc = loadSvc(tables)
  const o = await svc.getOverview({ costsLimit: 2 })
  assert.equal(o.topAiCosts.length, 2)
  assert.equal(o.topAiCosts[0].workspaceId, 'expensive')
  assert.equal(o.topAiCosts[0].costUsd, 9.25)
  assert.equal(o.topAiCosts[0].calls, 2)
  assert.equal(o.topAiCosts[1].workspaceId, 'medium')
})

test('getOverview : recentSignups préserve l\'ordre desc (le service.list est déjà trié)', async () => {
  const now = Date.now()
  const day = 86_400_000
  const tables = {
    workspaces: [
      { id: 'ws-newest', name: 'New', organization_id: 'org-1', created_at: new Date(now).toISOString() },
      { id: 'ws-old', name: 'Old', organization_id: 'org-2', created_at: new Date(now - 10 * day).toISOString() },
    ],
    organizations: [
      { id: 'org-1', email: 'new@x.com', name: 'New Org' },
      { id: 'org-2', email: 'old@x.com', name: 'Old Org' },
    ],
    connectors: [],
    canonical_metrics: [],
    audit_logs: [],
    watches: [],
    insights: [],
    ai_usage: [],
  }
  const svc = loadSvc(tables)
  const o = await svc.getOverview({ recentLimit: 5 })
  assert.equal(o.recentSignups.length, 2)
  assert.equal(o.recentSignups[0].workspaceId, 'ws-newest')
  assert.equal(o.recentSignups[0].email, 'new@x.com')
  assert.equal(o.recentSignups[1].workspaceId, 'ws-old')
})

test('getOverview : ratios = null si 0 workspaces (évite division par zéro)', async () => {
  const tables = {
    workspaces: [],
    organizations: [],
    connectors: [],
    canonical_metrics: [],
    audit_logs: [],
    watches: [],
    insights: [],
    ai_usage: [],
  }
  const svc = loadSvc(tables)
  const o = await svc.getOverview()
  assert.equal(o.totals.workspaces, 0)
  const conn = o.funnel.find((s) => s.step === 'connected_source')
  assert.equal(conn.ratio, null)
})
