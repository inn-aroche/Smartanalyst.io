// Tests générateur de rapports : escapeHtml, défaut titre, défaut note,
// render (sanity), et generate end-to-end mocké.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const INSIGHTS_PATH = require.resolve('../src/services/insights/insights.service')
const HEALTH_PATH = require.resolve('../src/services/health/health-score.service')
const SERVICE_PATH = require.resolve('../src/services/reports/report-generator.service')

function load({ workspace = { id: 'ws-1', name: 'Acme' }, score = null, insights = [], metrics = [] } = {}) {
  const captured = { insertRow: null, updateRow: null }
  let updateOnce = false
  const chain = {
    select() {
      return this
    },
    eq() {
      return this
    },
    insert(row) {
      captured.insertRow = row
      return this
    },
    update(row) {
      if (!captured.updateRow) captured.updateRow = row
      else updateOnce = true
      return this
    },
    single: async () => {
      if (captured.insertRow && !updateOnce) {
        return { data: { id: 'rep-1', ...captured.insertRow }, error: null }
      }
      return { data: { id: 'rep-1', ...captured.insertRow, ...captured.updateRow }, error: null }
    },
    maybeSingle: async () => ({ data: workspace, error: null }),
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
  require.cache[INSIGHTS_PATH] = {
    id: INSIGHTS_PATH,
    filename: INSIGHTS_PATH,
    loaded: true,
    exports: { listInsights: async () => insights },
  }
  require.cache[HEALTH_PATH] = {
    id: HEALTH_PATH,
    filename: HEALTH_PATH,
    loaded: true,
    exports: { getScore: async () => score },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), captured }
}

test('escapeHtml : échappe < > & " \'', () => {
  const { svc } = load()
  assert.equal(svc.escapeHtml('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;')
  assert.equal(svc.escapeHtml('it\'s & "ok"'), 'it&#39;s &amp; &quot;ok&quot;')
  assert.equal(svc.escapeHtml(null), '')
})

test('defaultTitle : monthly → "Point du mois — <mois année>"', () => {
  const { svc } = load()
  const t = svc.defaultTitle('2026-06-01', '2026-06-30', 'monthly')
  assert.match(t, /^Point du mois — juin 2026$/i)
})

test('defaultTitle : quarterly + custom', () => {
  const { svc } = load()
  assert.match(svc.defaultTitle('2026-04-01', '2026-06-30', 'quarterly'), /^Bilan trimestriel/)
  assert.match(svc.defaultTitle('2026-06-01', '2026-06-15', 'custom'), /^Rapport — /)
})

test('defaultAnalystNote : tonalité dépend du score', () => {
  const { svc } = load()
  assert.match(svc.defaultAnalystNote(null, 0), /pas encore assez de données/i)
  assert.match(svc.defaultAnalystNote(80, 0), /Bonne dynamique/i)
  assert.match(svc.defaultAnalystNote(60, 1), /mitigés/i)
  assert.match(svc.defaultAnalystNote(40, 3), /À surveiller/i)
})

test('renderHtml : produit du HTML valide avec titre + score', () => {
  const { svc } = load()
  const html = svc.renderHtml({
    title: 'Point du mois — juin 2026',
    workspace: { name: 'Atelier Lumi' },
    score: { score: 78, delta: 3, has_data: true },
    topInsights: [
      { title: 'ROAS Meta -28 %', summary: 'Cause technique', severity: 'critical' },
    ],
    kpis: [{ key: 'revenue_ecommerce', value: 24380, kind: 'sum' }],
    revenueSeries: [],
    period: { start: '2026-06-01', end: '2026-06-30' },
    analystNote: null,
    whiteLabel: false,
  })
  assert.match(html, /<!doctype html>/i)
  assert.match(html, /Point du mois — juin 2026/)
  assert.match(html, /Atelier Lumi/)
  assert.match(html, /ROAS Meta -28 %/)
  // XSS guard : aucun script
  assert.ok(!/<script/i.test(html))
})

test('renderHtml : white_label change la couverture (pas de gradient SmartAnalyst)', () => {
  const { svc } = load()
  const wl = svc.renderHtml({
    title: 'X',
    workspace: {},
    score: null,
    topInsights: [],
    kpis: [],
    revenueSeries: [],
    period: { start: '2026-06-01', end: '2026-06-30' },
    whiteLabel: true,
  })
  assert.ok(!/SmartAnalyst — Point périodique/.test(wl))
  const normal = svc.renderHtml({
    title: 'X',
    workspace: {},
    score: null,
    topInsights: [],
    kpis: [],
    revenueSeries: [],
    period: { start: '2026-06-01', end: '2026-06-30' },
    whiteLabel: false,
  })
  assert.match(normal, /SmartAnalyst — Point périodique/)
})

test('generate : crée le row en generating puis met à jour en ready', async () => {
  const { svc, captured } = load({
    score: { score: 80, delta: 2, has_data: true },
    insights: [{ id: 'i1', title: 'T', summary: 'S', severity: 'medium' }],
    metrics: [],
  })
  const r = await svc.generate({
    workspaceId: 'ws-1',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    kind: 'monthly',
    userId: 'u-1',
  })
  assert.equal(r.id, 'rep-1')
  assert.ok(r.html)
  assert.match(r.html, /<!doctype html>/i)
  assert.equal(captured.insertRow.status, 'generating')
  assert.equal(captured.updateRow.status, 'ready')
  assert.ok(captured.updateRow.html_content.includes('<!doctype html>'))
})
