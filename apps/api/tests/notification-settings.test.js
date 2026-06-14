// Tests notification-settings : defaults, update partiel, email_override validation.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/notifications/settings.service')

function load({ existing = null, upsertResult = {} } = {}) {
  const chain = {
    select() { return this },
    eq() { return this },
    maybeSingle: async () => ({ data: existing, error: null }),
    upsert(row) {
      this._row = row
      return this
    },
    single: async () => ({ data: { ...upsertResult }, error: null }),
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: { getServiceRoleClient: () => ({ from: () => chain }) },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), chain }
}

test('getSettings : pas de row → defaults', async () => {
  const { svc } = load({ existing: null })
  const s = await svc.getSettings('ws-1')
  assert.equal(s.weekly_digest, true)
  assert.equal(s.critical_alerts, true)
  assert.equal(s.email_override, null)
})

test('getSettings : row existante → retournée telle quelle', async () => {
  const { svc } = load({
    existing: { weekly_digest: false, critical_alerts: true, email_override: 'x@y.com' },
  })
  const s = await svc.getSettings('ws-1')
  assert.equal(s.weekly_digest, false)
  assert.equal(s.email_override, 'x@y.com')
})

test('updateSettings : email_override invalide → throw', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.updateSettings('ws-1', { email_override: 'not-email' }),
    (e) => e.code === 'INVALID_EMAIL',
  )
})

test('updateSettings : email_override null/"" → null stocké', async () => {
  const { svc, chain } = load({ upsertResult: { weekly_digest: true, critical_alerts: true, email_override: null } })
  await svc.updateSettings('ws-1', { email_override: '' })
  assert.equal(chain._row.email_override, null)
})

test('updateSettings : patch partiel ne touche pas les autres champs', async () => {
  const { svc, chain } = load({ upsertResult: {} })
  await svc.updateSettings('ws-1', { weekly_digest: false })
  assert.equal(chain._row.weekly_digest, false)
  assert.ok(!('critical_alerts' in chain._row))
})
