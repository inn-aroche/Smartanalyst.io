// Tests pour le backfill 12 mois à la connexion (K0 —
// queue-jobs/handlers/sync.handler.js:backfillConnector).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CONNECTORS_PATH = require.resolve('../src/connectors')
const HANDLER_PATH = require.resolve('../src/queue-jobs/handlers/sync.handler')

function load({ record = { id: 'conn-1', source: 'stripe' }, syncImpl } = {}) {
  const syncCalls = []
  const defaultSyncImpl = async (range) => {
    syncCalls.push(range)
    return { metricsCount: 10 }
  }

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
          maybeSingle: async () => ({ data: record, error: null }),
        }),
      }),
    },
  }

  require.cache[CONNECTORS_PATH] = {
    id: CONNECTORS_PATH,
    filename: CONNECTORS_PATH,
    loaded: true,
    exports: {
      getConnector: () => ({
        sync: syncImpl || defaultSyncImpl,
      }),
    },
  }

  delete require.cache[HANDLER_PATH]
  const handler = require(HANDLER_PATH)
  return { handler, syncCalls }
}

test('buildBackfillChunks: couvre 12 mois, du plus récent au plus ancien, sans trou ni chevauchement', () => {
  const { handler } = load()
  const chunks = handler.buildBackfillChunks(12, 90)

  assert.ok(chunks.length >= 4)
  // Le premier chunk se termine aujourd'hui (le plus récent en premier).
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(chunks[0].endDate, today)

  // Chaque chunk doit s'enchaîner sans trou avec le suivant (startDate[i] = endDate[i+1] + 1 jour).
  for (let i = 0; i < chunks.length - 1; i++) {
    const start = new Date(chunks[i].startDate)
    const nextEnd = new Date(chunks[i + 1].endDate)
    const diffDays = (start.getTime() - nextEnd.getTime()) / (24 * 60 * 60 * 1000)
    assert.equal(diffDays, 1)
  }
})

test('backfillConnector: appelle sync() pour chaque chunk, du plus récent au plus ancien', async () => {
  const { handler, syncCalls } = load()
  const result = await handler.backfillConnector({
    data: { workspaceId: 'ws-1', connectorId: 'conn-1', source: 'stripe' },
  })

  assert.equal(result.okCount, syncCalls.length)
  assert.ok(syncCalls.length >= 4)
  // Décroissant : le premier appel couvre la période la plus récente.
  for (let i = 0; i < syncCalls.length - 1; i++) {
    assert.ok(new Date(syncCalls[i].endDate) >= new Date(syncCalls[i + 1].endDate))
  }
})

test('backfillConnector: connecteur introuvable (supprimé avant que le job ne tourne) → skip propre', async () => {
  const { handler } = load({ record: null })
  const result = await handler.backfillConnector({
    data: { workspaceId: 'ws-1', connectorId: 'conn-1', source: 'stripe' },
  })
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'not_found')
})

test('backfillConnector: un chunk qui échoue stoppe les suivants (même cause probable)', async () => {
  let calls = 0
  const { handler, syncCalls } = load({
    syncImpl: async (range) => {
      calls++
      syncCalls.push(range)
      if (calls === 2) throw new Error('INVALID_CREDENTIALS')
      return { metricsCount: 5 }
    },
  })
  const result = await handler.backfillConnector({
    data: { workspaceId: 'ws-1', connectorId: 'conn-1', source: 'stripe' },
  })

  assert.equal(calls, 2)
  assert.equal(result.chunks.length, 2)
  assert.equal(result.chunks[0].ok, true)
  assert.equal(result.chunks[1].ok, false)
  assert.equal(result.okCount, 1)
})
