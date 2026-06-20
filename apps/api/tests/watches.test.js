// Tests du service watches (CRUD + validation).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/watches/watches.service')

function load({ insertResult = {}, updateResult = {}, listResult = [], deleteCount = 1 } = {}) {
  const captured = { insertRow: null, updateRow: null }
  const chain = {
    select() {
      return this
    },
    eq() {
      return this
    },
    order: async () => ({ data: listResult, error: null }),
    insert(row) {
      captured.insertRow = row
      return this
    },
    update(row) {
      captured.updateRow = row
      return this
    },
    delete({ count } = {}) {
      this._count = count
      return this
    },
    single: async () => ({ data: { id: 'w1', ...captured.insertRow }, error: null }),
    maybeSingle: async () => ({ data: { id: 'w1', ...captured.updateRow, ...updateResult }, error: null }),
    then: undefined, // empêche un await accidentel
  }
  // delete renvoie une promesse {error,count} via await
  Object.defineProperty(chain, 'then', {
    get() {
      return (resolve) => resolve({ error: null, count: deleteCount })
    },
  })
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { getServiceRoleClient: () => ({ from: () => chain }) },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), captured, insertResult, updateResult }
}

test('createWatch : description trop courte → throw INVALID_DESCRIPTION', async () => {
  const { svc } = load()
  await assert.rejects(
    () =>
      svc.createWatch('ws-1', 'u-1', {
        description: 'no',
        metric_key: 'sessions_all',
        operator: 'drops_below',
        threshold: 1000,
      }),
    (e) => e.code === 'INVALID_DESCRIPTION',
  )
})

test('createWatch : opérateur invalide → throw INVALID_OPERATOR', async () => {
  const { svc } = load()
  await assert.rejects(
    () =>
      svc.createWatch('ws-1', 'u-1', {
        description: 'Surveille mon MRR',
        metric_key: 'mrr',
        operator: 'evil_op',
        threshold: 100,
      }),
    (e) => e.code === 'INVALID_OPERATOR',
  )
})

test('createWatch : threshold manquant pour drops_below → throw INVALID_THRESHOLD', async () => {
  const { svc } = load()
  await assert.rejects(
    () =>
      svc.createWatch('ws-1', 'u-1', {
        description: 'Surveille mon MRR',
        metric_key: 'mrr',
        operator: 'drops_below',
      }),
    (e) => e.code === 'INVALID_THRESHOLD',
  )
})

test('createWatch : any_change ne requiert pas de threshold', async () => {
  const { svc, captured } = load()
  await svc.createWatch('ws-1', 'u-1', {
    description: 'Préviens-moi à chaque changement de churn',
    metric_key: 'churn_rate_subscription',
    operator: 'any_change',
  })
  assert.equal(captured.insertRow.threshold, null)
  assert.equal(captured.insertRow.operator, 'any_change')
})

test('createWatch : insertion correcte avec defaults', async () => {
  const { svc, captured } = load()
  await svc.createWatch('ws-1', 'u-1', {
    description: 'Alerte ROAS chute 15%',
    metric_key: 'return_on_investment_paid',
    operator: 'drops_below',
    threshold: 2,
  })
  assert.equal(captured.insertRow.workspace_id, 'ws-1')
  assert.equal(captured.insertRow.created_by, 'u-1')
  assert.equal(captured.insertRow.threshold, 2)
  assert.equal(captured.insertRow.notify_in_app, true) // default
  assert.equal(captured.insertRow.notify_email, false) // default
  assert.equal(captured.insertRow.enabled, true)
})

test('patchWatch : aucun champ → throw EMPTY_PATCH', async () => {
  const { svc } = load()
  // metric_key et operator restent non-éditables (cf. Lot 4 : on autorise
  // l'édition de description / threshold / snooze mais pas la métrique elle-même).
  await assert.rejects(
    () => svc.patchWatch('ws-1', 'w-1', { metric_key: 'forbidden' }),
    (e) => e.code === 'EMPTY_PATCH',
  )
})

test('patchWatch : ne garde que les champs whitelistés', async () => {
  const { svc, captured } = load()
  await svc.patchWatch('ws-1', 'w-1', {
    enabled: false,
    description: 'nouvelle desc',
    metric_key: 'forbidden',
    operator: 'forbidden',
  })
  // description est désormais whitelistée (Lot 4) ; metric_key/operator ne le
  // sont pas. updated_at est posé automatiquement.
  assert.equal(captured.updateRow.enabled, false)
  assert.equal(captured.updateRow.description, 'nouvelle desc')
  assert.ok(captured.updateRow.updated_at, 'updated_at posé automatiquement')
  assert.equal(captured.updateRow.metric_key, undefined)
  assert.equal(captured.updateRow.operator, undefined)
})

test('patchWatch : snooze_hours → snoozed_until calculé', async () => {
  const { svc, captured } = load()
  const before = Date.now()
  await svc.patchWatch('ws-1', 'w-1', { snooze_hours: 24 })
  const after = Date.now()
  assert.ok(captured.updateRow.snoozed_until, 'snoozed_until posé')
  const snoozedAtMs = new Date(captured.updateRow.snoozed_until).getTime()
  assert.ok(
    snoozedAtMs >= before + 24 * 3_600_000 - 1000 &&
      snoozedAtMs <= after + 24 * 3_600_000 + 1000,
    'snoozed_until ≈ now + 24h',
  )
})

test('patchWatch : snooze_hours=0 → snoozed_until=null (annule)', async () => {
  const { svc, captured } = load()
  await svc.patchWatch('ws-1', 'w-1', { snooze_hours: 0 })
  assert.strictEqual(captured.updateRow.snoozed_until, null)
})

test('listWatches : passe-plat', async () => {
  const list = [{ id: 'w1' }, { id: 'w2' }]
  const { svc } = load({ listResult: list })
  const r = await svc.listWatches('ws-1')
  assert.deepEqual(r, list)
})
