// Tests : snooze granulaire des insights (cahier 23).
//
// Couvre updateInsightStatus + reopenExpiredSnoozes. Pas de vrai Supabase :
// on injecte un faux getServiceRoleClient via require.cache pour mock le
// builder fluide (from/update/eq/...).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/insights/insights.service')

// Builder mock minimal : enregistre les calls + retourne une promesse data.
function makeMockClient({ updateResponse, listResponse = { data: [], error: null } }) {
  const calls = { update: [], lte: [], eq: [] }
  function chain(returnData) {
    const obj = {
      update(patch) {
        calls.update.push(patch)
        return obj
      },
      select() {
        return obj
      },
      eq(col, val) {
        calls.eq.push({ col, val })
        return obj
      },
      lte(col, val) {
        calls.lte.push({ col, val })
        return Promise.resolve(returnData)
      },
      order() {
        return obj
      },
      limit() {
        return Promise.resolve(listResponse)
      },
      maybeSingle() {
        return Promise.resolve(returnData)
      },
      in() {
        return Promise.resolve({ data: [], error: null })
      },
    }
    return obj
  }
  return {
    calls,
    from(table) {
      // On gère deux tables : insights (update) et action_cards (listInsights).
      if (table === 'action_cards') {
        return {
          select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        }
      }
      return chain(updateResponse)
    },
  }
}

function load(mockClient) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { getServiceRoleClient: () => mockClient },
  }
  delete require.cache[SERVICE_PATH]
  return require(SERVICE_PATH)
}

test('updateInsightStatus snoozed sans deadline → throw', async () => {
  const svc = load(makeMockClient({ updateResponse: { data: { id: 'i1', status: 'snoozed' } } }))
  await assert.rejects(
    () => svc.updateInsightStatus('ws-1', 'i1', 'snoozed'),
    /snoozed_until/,
  )
})

test('updateInsightStatus snoozed avec deadline passée → throw', async () => {
  const svc = load(makeMockClient({ updateResponse: { data: null, error: null } }))
  const past = new Date(Date.now() - 60_000).toISOString()
  await assert.rejects(
    () => svc.updateInsightStatus('ws-1', 'i1', 'snoozed', { snoozedUntil: past }),
    /date future valide/,
  )
})

test('updateInsightStatus snoozed avec deadline future → patch passe avec snoozed_until', async () => {
  const client = makeMockClient({
    updateResponse: {
      data: { id: 'i1', status: 'snoozed', snoozed_until: '2099-01-01T00:00:00Z' },
      error: null,
    },
  })
  const svc = load(client)
  const future = new Date(Date.now() + 3600_000).toISOString()
  const res = await svc.updateInsightStatus('ws-1', 'i1', 'snoozed', { snoozedUntil: future })
  assert.equal(res.status, 'snoozed')
  // Le patch envoyé contient bien snoozed_until.
  const patch = client.calls.update[0]
  assert.ok(patch.snoozed_until)
  assert.equal(patch.status, 'snoozed')
})

test('updateInsightStatus dismissed → remet snoozed_until à null', async () => {
  const client = makeMockClient({
    updateResponse: {
      data: { id: 'i1', status: 'dismissed', snoozed_until: null },
      error: null,
    },
  })
  const svc = load(client)
  await svc.updateInsightStatus('ws-1', 'i1', 'dismissed')
  const patch = client.calls.update[0]
  assert.equal(patch.snoozed_until, null)
  assert.equal(patch.status, 'dismissed')
})

test('reopenExpiredSnoozes patche status=open + snoozed_until=null avec filtre lte(now)', async () => {
  const client = makeMockClient({ updateResponse: { error: null } })
  const svc = load(client)
  const res = await svc.reopenExpiredSnoozes('ws-1')
  assert.equal(res.ok, true)
  // Patch envoyé = { status: 'open', snoozed_until: null, updated_at }
  const patch = client.calls.update[0]
  assert.equal(patch.status, 'open')
  assert.equal(patch.snoozed_until, null)
  // Filtre lte('snoozed_until', maintenant) — bien posé.
  assert.equal(client.calls.lte[0].col, 'snoozed_until')
})

test('updateInsightStatus statut invalide → throw INVALID_STATUS', async () => {
  const svc = load(makeMockClient({ updateResponse: { data: null, error: null } }))
  await assert.rejects(
    () => svc.updateInsightStatus('ws-1', 'i1', 'haxor'),
    /Statut insight invalide/,
  )
})
