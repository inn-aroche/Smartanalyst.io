// Tests tracking-health.service : composition statut + agrégats + sources.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const INGESTION_PATH = require.resolve('../src/services/tracking/ingestion.service')
const SERVICE_PATH = require.resolve('../src/services/tracking/tracking-health.service')

function load({ status, aggregates = [], sources = [] } = {}) {
  const connChain = {
    select() { return this },
    eq() { return this },
    in: async () => ({ data: sources.map((s) => ({ source: s, status: 'active' })), error: null }),
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: { getServiceRoleClient: () => ({ from: () => connChain }) },
  }
  require.cache[INGESTION_PATH] = {
    id: INGESTION_PATH, filename: INGESTION_PATH, loaded: true,
    exports: {
      getStatus: async () => status,
      getDailyAggregates: async () => aggregates,
    },
  }
  delete require.cache[SERVICE_PATH]
  return require(SERVICE_PATH)
}

function dStr(n) {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
}

test('confidence high quand tag actif + une source connectée', async () => {
  const svc = load({
    status: { installed: true, lastEventAt: Date.now() },
    aggregates: [{ date: dStr(1), event_type: 'pageview', event_name: '', event_count: 10 }],
    sources: ['ga4'],
  })
  const h = await svc.getHealth('ws-1')
  assert.equal(h.smarttag_active, true)
  assert.equal(h.confidence, 'high')
  assert.equal(h.connected_sources.length, 1)
})

test('confidence medium quand seulement une source (tag inactif)', async () => {
  const svc = load({ status: { installed: false, lastEventAt: null }, sources: ['stripe'] })
  const h = await svc.getHealth('ws-1')
  assert.equal(h.confidence, 'medium')
})

test('confidence low quand rien', async () => {
  const svc = load({ status: { installed: false, lastEventAt: null }, sources: [] })
  const h = await svc.getHealth('ws-1')
  assert.equal(h.confidence, 'low')
})

test('sépare events 7j vs 30j', async () => {
  const svc = load({
    status: { installed: true, lastEventAt: Date.now() },
    aggregates: [
      { date: dStr(2), event_type: 'pageview', event_name: '', event_count: 5 },
      { date: dStr(20), event_type: 'pageview', event_name: '', event_count: 100 },
    ],
    sources: ['ga4'],
  })
  const h = await svc.getHealth('ws-1')
  assert.equal(h.events_last_7d, 5)
  assert.equal(h.events_last_30d, 105)
})

test('agrège et trie by_type par count desc', async () => {
  const svc = load({
    status: { installed: true, lastEventAt: Date.now() },
    aggregates: [
      { date: dStr(1), event_type: 'pageview', event_name: '', event_count: 3 },
      { date: dStr(1), event_type: 'custom', event_name: 'lead_submit', event_count: 7 },
    ],
    sources: [],
  })
  const h = await svc.getHealth('ws-1')
  assert.equal(h.by_type[0].count, 7)
  assert.equal(h.by_type[0].event_name, 'lead_submit')
})
