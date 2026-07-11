// Tests pour la fenêtre de resync paramétrable par connecteur (K0).

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resyncWindowDays,
  SOURCE_DEFAULT_RESYNC_DAYS,
} = require('../src/services/connectors/connector.service')

test('resyncWindowDays: utilise la valeur explicite du connecteur si présente', () => {
  assert.equal(resyncWindowDays({ source: 'ga4', resync_window_days: 45 }), 45)
})

test('resyncWindowDays: retombe sur le défaut par source si pas de valeur explicite', () => {
  assert.equal(resyncWindowDays({ source: 'stripe' }), SOURCE_DEFAULT_RESYNC_DAYS.stripe)
  assert.equal(resyncWindowDays({ source: 'shopify' }), SOURCE_DEFAULT_RESYNC_DAYS.shopify)
  assert.equal(resyncWindowDays({ source: 'ga4' }), SOURCE_DEFAULT_RESYNC_DAYS.ga4)
})

test('resyncWindowDays: retombe sur 7j si source inconnue et pas de valeur explicite', () => {
  assert.equal(resyncWindowDays({ source: 'made_up_source' }), 7)
})

test('resyncWindowDays: Stripe et Shopify ont une fenêtre par défaut plus large que GA4/Meta (remboursements/statuts révisés)', () => {
  assert.ok(SOURCE_DEFAULT_RESYNC_DAYS.stripe > SOURCE_DEFAULT_RESYNC_DAYS.ga4)
  assert.ok(SOURCE_DEFAULT_RESYNC_DAYS.shopify > SOURCE_DEFAULT_RESYNC_DAYS.ga4)
})

// ── syncWorkspace : chaque connecteur resync sur SA propre fenêtre ──

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CONNECTORS_PATH = require.resolve('../src/connectors')
const WORKSPACE_SERVICE_PATH = require.resolve('../src/services/workspaces/workspace.service')
const HANDLER_PATH = require.resolve('../src/queue-jobs/handlers/sync.handler')

function loadHandler(connectors) {
  const syncCalls = []

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: () => ({
          select() {
            return this
          },
          eq() {
            return this
          },
          in: async () => ({ data: connectors, error: null }),
        }),
      }),
    },
  }
  require.cache[CONNECTORS_PATH] = {
    id: CONNECTORS_PATH,
    filename: CONNECTORS_PATH,
    loaded: true,
    exports: {
      getConnector: (workspaceId, record) => ({
        sync: async (range) => {
          syncCalls.push({ connectorId: record.id, source: record.source, range })
          return { metricsCount: 1 }
        },
      }),
    },
  }
  require.cache[WORKSPACE_SERVICE_PATH] = {
    id: WORKSPACE_SERVICE_PATH,
    filename: WORKSPACE_SERVICE_PATH,
    loaded: true,
    exports: { listActive: async () => [] },
  }

  delete require.cache[HANDLER_PATH]
  const handler = require(HANDLER_PATH)
  return { handler, syncCalls }
}

test('syncWorkspace: sans override, chaque connecteur reçoit une fenêtre calibrée sur sa propre source', async () => {
  const { handler, syncCalls } = loadHandler([
    { id: 'c-stripe', source: 'stripe', workspace_id: 'ws-1' },
    { id: 'c-ga4', source: 'ga4', workspace_id: 'ws-1' },
  ])

  await handler.syncWorkspace({ data: { workspaceId: 'ws-1' } })

  const stripeCall = syncCalls.find((c) => c.connectorId === 'c-stripe')
  const ga4Call = syncCalls.find((c) => c.connectorId === 'c-ga4')

  const daysCovered = (range) =>
    Math.round((Date.parse(range.endDate) - Date.parse(range.startDate)) / (24 * 60 * 60 * 1000))

  assert.equal(daysCovered(stripeCall.range), SOURCE_DEFAULT_RESYNC_DAYS.stripe)
  assert.equal(daysCovered(ga4Call.range), SOURCE_DEFAULT_RESYNC_DAYS.ga4)
})

test('syncWorkspace: avec startDate/endDate explicites, tous les connecteurs utilisent le même range (override)', async () => {
  const { handler, syncCalls } = loadHandler([
    { id: 'c-stripe', source: 'stripe', workspace_id: 'ws-1' },
    { id: 'c-ga4', source: 'ga4', workspace_id: 'ws-1' },
  ])

  await handler.syncWorkspace({
    data: { workspaceId: 'ws-1', startDate: '2026-01-01', endDate: '2026-01-31' },
  })

  for (const call of syncCalls) {
    assert.deepEqual(call.range, { startDate: '2026-01-01', endDate: '2026-01-31' })
  }
})

test('syncWorkspace: un connecteur avec resync_window_days explicite l\'emporte sur le défaut source', async () => {
  const { handler, syncCalls } = loadHandler([
    { id: 'c-custom', source: 'ga4', workspace_id: 'ws-1', resync_window_days: 21 },
  ])

  await handler.syncWorkspace({ data: { workspaceId: 'ws-1' } })

  const daysCovered = (range) =>
    Math.round((Date.parse(range.endDate) - Date.parse(range.startDate)) / (24 * 60 * 60 * 1000))
  assert.equal(daysCovered(syncCalls[0].range), 21)
})
