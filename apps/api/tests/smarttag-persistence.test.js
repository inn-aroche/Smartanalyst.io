// Tests persistance SmartTag (smarttag_daily).
//
// Couverture :
//   - persistDaily appelle la RPC increment_smarttag_daily avec la bonne
//     date (dérivée du ts), event_type, et event_name ('' sauf custom).
//   - getDailyAggregates requête la table et renvoie les rows.
//
// Mocks : getServiceRoleClient (.rpc + .from chainable), getRedis (inutilisé
// ici mais requis par le module).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const REDIS_PATH = require.resolve('../src/lib/redis')
const SERVICE_PATH = require.resolve('../src/services/tracking/ingestion.service')

function loadServiceWithMocks() {
  const rpcCalls = []
  let aggregatesResult = { data: [], error: null }
  const queryChain = {
    select() { return this },
    eq() { return this },
    order() { return this },
    gte() { return this },
    lte() { return this },
    then(resolve) { return Promise.resolve(aggregatesResult).then(resolve) },
  }

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        rpc: (name, args) => {
          rpcCalls.push({ name, args })
          return Promise.resolve({ data: null, error: null })
        },
        from: () => queryChain,
      }),
    },
  }
  require.cache[REDIS_PATH] = {
    id: REDIS_PATH,
    filename: REDIS_PATH,
    loaded: true,
    exports: { getRedis: () => ({}) },
  }

  delete require.cache[SERVICE_PATH]
  const svc = require(SERVICE_PATH)
  return { svc, rpcCalls, setAggregates: (r) => { aggregatesResult = r } }
}

test('persistDaily appelle la RPC avec la date dérivée du ts et event_name vide pour un pageview', () => {
  const { svc, rpcCalls } = loadServiceWithMocks()
  const ts = Date.parse('2026-06-10T14:30:00Z')
  svc.persistDaily('ws-1', { type: 'pageview', sid: 's1', ts })

  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, 'increment_smarttag_daily')
  assert.deepEqual(rpcCalls[0].args, {
    p_workspace_id: 'ws-1',
    p_date: '2026-06-10',
    p_event_type: 'pageview',
    p_event_name: '',
    p_delta: 1,
  })
})

test('persistDaily garde le nom pour un event custom', () => {
  const { svc, rpcCalls } = loadServiceWithMocks()
  const ts = Date.parse('2026-06-10T09:00:00Z')
  svc.persistDaily('ws-1', { type: 'custom', name: 'lead_submit', sid: 's2', ts })

  assert.equal(rpcCalls[0].args.p_event_type, 'custom')
  assert.equal(rpcCalls[0].args.p_event_name, 'lead_submit')
})

test('persistDaily fallback sur la date du jour si ts absent', () => {
  const { svc, rpcCalls } = loadServiceWithMocks()
  svc.persistDaily('ws-1', { type: 'click', sid: 's3' })
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(rpcCalls[0].args.p_date, today)
})

test('getDailyAggregates renvoie les rows de la table', async () => {
  const { svc, setAggregates } = loadServiceWithMocks()
  setAggregates({
    data: [
      { date: '2026-06-10', event_type: 'custom', event_name: 'lead_submit', event_count: 12 },
    ],
    error: null,
  })
  const rows = await svc.getDailyAggregates('ws-1', { startDate: '2026-06-01', endDate: '2026-06-13' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].event_count, 12)
})

test('getDailyAggregates renvoie [] sur erreur DB (jamais throw)', async () => {
  const { svc, setAggregates } = loadServiceWithMocks()
  setAggregates({ data: null, error: { message: 'boom' } })
  const rows = await svc.getDailyAggregates('ws-1', { startDate: '2026-06-01', endDate: '2026-06-13' })
  assert.deepEqual(rows, [])
})
