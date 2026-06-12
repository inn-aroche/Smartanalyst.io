// Tests du handler oauth-refresh.
//
// Couvre :
//   - scanExpiringConnectors : filtre les connectors qui expirent + enqueue
//     un job par connector avec jobId stable (idempotent)
//   - refreshOne : load connector, instancie via getConnector, appelle
//     refreshTokenIfNeeded. Si fail, marque expired + throw.
//   - Edge cases : connector deleted entre scan et processing, refresh_token
//     manquant, scan vide.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CONNECTORS_INDEX_PATH = require.resolve('../src/connectors')
const HANDLER_PATH = require.resolve('../src/queue-jobs/handlers/oauth-refresh.handler')

function setupMocks({
  expiringConnectors = [],
  connectorById = {},
  connectorInstance = null,
  updateCalls = [],
} = {}) {
  const supabaseCalls = { updates: updateCalls }

  // Mock Supabase query chain. `lastEq` est en closure du fromHandler pour
  // que `.eq().maybeSingle()` partage l'état (pas via `this`, qui change
  // dans les arrow functions).
  const fromHandler = (table) => {
    let lastEq = null
    const chain = {
      select() { return chain },
      eq(field, value) {
        lastEq = { field, value }
        return chain
      },
      not() { return chain },
      lt() { return chain },
      in() { return chain },
      maybeSingle: async () => {
        if (table !== 'connectors') return { data: null, error: null }
        const id = lastEq?.field === 'id' ? lastEq.value : null
        return { data: connectorById[id] || null, error: null }
      },
      // For scan: terminal promise resolve
      then(resolve) {
        return Promise.resolve({ data: expiringConnectors, error: null }).then(resolve)
      },
      update(patch) {
        return {
          eq(field, value) {
            supabaseCalls.updates.push({ table, field, value, patch })
            return Promise.resolve({ error: null })
          },
        }
      },
    }
    return chain
  }

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({ from: fromHandler }),
      getAnonClient: () => ({}),
      getUserScopedClient: () => ({}),
    },
  }

  // Mock connectors index — getConnector renvoie l'instance fournie
  require.cache[CONNECTORS_INDEX_PATH] = {
    id: CONNECTORS_INDEX_PATH,
    filename: CONNECTORS_INDEX_PATH,
    loaded: true,
    exports: {
      getConnector: () => connectorInstance,
      SUPPORTED_SOURCES: ['ga4', 'meta-ads', 'shopify'],
    },
  }

  delete require.cache[HANDLER_PATH]
  return { supabaseCalls }
}

function fakeRefreshQueue() {
  const adds = []
  return {
    add: async (jobName, data, opts) => {
      adds.push({ jobName, data, opts })
      return { id: opts?.jobId || `job-${adds.length}` }
    },
    _adds: adds,
  }
}

function fakeConnectorInstance({ refreshShouldThrow = false, didRefresh = true } = {}) {
  return {
    refreshTokenIfNeeded: async () => {
      if (refreshShouldThrow) {
        const err = new Error('Token refresh failed: provider returned 400')
        err.code = 'REFRESH_FAILED'
        throw err
      }
      return didRefresh
    },
  }
}

// ───────── scanExpiringConnectors ─────────

test('scanExpiringConnectors enqueue un job par connector trouvé', async () => {
  const connectors = [
    { id: 'c1', workspace_id: 'w1', source: 'ga4', status: 'active', token_expires_at: '2026-06-13T10:00:00Z' },
    { id: 'c2', workspace_id: 'w1', source: 'meta-ads', status: 'active', token_expires_at: '2026-06-13T08:00:00Z' },
    { id: 'c3', workspace_id: 'w2', source: 'shopify', status: 'expired', token_expires_at: '2026-06-12T23:00:00Z' },
  ]
  setupMocks({ expiringConnectors: connectors })
  const { scanExpiringConnectors } = require(HANDLER_PATH)
  const queue = fakeRefreshQueue()

  const result = await scanExpiringConnectors({ refreshQueue: queue })

  assert.equal(result.scanned, 3)
  assert.equal(result.enqueued, 3)
  assert.equal(queue._adds.length, 3)
  assert.equal(queue._adds[0].jobName, 'refresh-token')
  assert.equal(queue._adds[0].data.connectorId, 'c1')
  assert.equal(queue._adds[0].data.source, 'ga4')
  // jobId stable par connector+day
  assert.match(queue._adds[0].opts.jobId, /^oauth-refresh:c1:\d{4}-\d{2}-\d{2}$/)
})

test('scanExpiringConnectors vide (aucun connector à refresh) → 0/0', async () => {
  setupMocks({ expiringConnectors: [] })
  const { scanExpiringConnectors } = require(HANDLER_PATH)
  const queue = fakeRefreshQueue()
  const result = await scanExpiringConnectors({ refreshQueue: queue })
  assert.equal(result.scanned, 0)
  assert.equal(result.enqueued, 0)
  assert.equal(queue._adds.length, 0)
})

// ───────── refreshOne ─────────

test('refreshOne success → ok=true + log refreshed', async () => {
  const instance = fakeConnectorInstance({ didRefresh: true })
  setupMocks({
    connectorById: {
      c1: { id: 'c1', workspace_id: 'w1', source: 'ga4', refresh_token: 'enc-token' },
    },
    connectorInstance: instance,
  })
  const { refreshOne } = require(HANDLER_PATH)
  const result = await refreshOne({
    data: { connectorId: 'c1', workspaceId: 'w1', source: 'ga4' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.refreshed, true)
  assert.equal(result.connectorId, 'c1')
})

test('refreshOne sur token still valid → ok=true refreshed=false', async () => {
  const instance = fakeConnectorInstance({ didRefresh: false })
  setupMocks({
    connectorById: {
      c1: { id: 'c1', workspace_id: 'w1', source: 'ga4', refresh_token: 'enc' },
    },
    connectorInstance: instance,
  })
  const { refreshOne } = require(HANDLER_PATH)
  const result = await refreshOne({
    data: { connectorId: 'c1', workspaceId: 'w1', source: 'ga4' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.refreshed, false)
})

test('refreshOne sur connector deleted → skipped not_found', async () => {
  setupMocks({ connectorById: {} })
  const { refreshOne } = require(HANDLER_PATH)
  const result = await refreshOne({
    data: { connectorId: 'missing', workspaceId: 'w1', source: 'ga4' },
  })
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'not_found')
})

test('refreshOne sur connector sans refresh_token → skipped', async () => {
  setupMocks({
    connectorById: {
      c1: { id: 'c1', workspace_id: 'w1', source: 'stripe', refresh_token: null },
    },
  })
  const { refreshOne } = require(HANDLER_PATH)
  const result = await refreshOne({
    data: { connectorId: 'c1', workspaceId: 'w1', source: 'stripe' },
  })
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'no_refresh_token')
})

test('refreshOne refresh fail → marque connector expired + throw', async () => {
  const instance = fakeConnectorInstance({ refreshShouldThrow: true })
  const updateCalls = []
  setupMocks({
    connectorById: {
      c1: { id: 'c1', workspace_id: 'w1', source: 'ga4', refresh_token: 'enc' },
    },
    connectorInstance: instance,
    updateCalls,
  })
  const { refreshOne } = require(HANDLER_PATH)
  await assert.rejects(
    () => refreshOne({
      data: { connectorId: 'c1', workspaceId: 'w1', source: 'ga4' },
    }),
    /refresh failed/i,
  )
  assert.equal(updateCalls.length, 1)
  const upd = updateCalls[0]
  assert.equal(upd.value, 'c1')
  assert.equal(upd.patch.status, 'expired')
  assert.equal(upd.patch.status_reason, 'oauth_refresh_failed')
  assert.match(upd.patch.last_error_message, /refresh failed/i)
})

test('LOOKAHEAD_HOURS exposé pour cohérence config', () => {
  setupMocks()
  const { LOOKAHEAD_HOURS } = require(HANDLER_PATH)
  assert.equal(typeof LOOKAHEAD_HOURS, 'number')
  assert.ok(LOOKAHEAD_HOURS >= 1)
})
