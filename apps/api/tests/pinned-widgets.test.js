// Tests pinned-widgets.service (cahier 22b Lot V2.3).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/pinned-widgets/pinned-widgets.service')

function load({ count = 0, maxPosition = -1, insertResult = null } = {}) {
  const captured = { inserted: null }
  const supabase = {
    from() {
      return {
        select(_cols, opts) {
          if (opts?.head) {
            // count head
            return { eq: () => Promise.resolve({ count, error: null }) }
          }
          return {
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: maxPosition >= 0 ? { position: maxPosition } : null,
                    error: null,
                  }),
                }),
                then: undefined,
              }),
            }),
          }
        },
        insert(row) {
          captured.inserted = row
          return {
            select: () => ({
              single: async () => ({
                data: insertResult || { id: 'w-1', ...row },
                error: null,
              }),
            }),
          }
        },
        delete() {
          return {
            eq: () => ({
              eq: async () => ({ count: 1, error: null }),
            }),
          }
        },
      }
    },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { getServiceRoleClient: () => supabase },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), captured }
}

test('validateSpec : kpi sans title → throw', () => {
  const { svc } = load()
  assert.throws(
    () => svc.validateSpec('kpi', { value: '42' }),
    (e) => e.code === 'TITLE_REQUIRED',
  )
})

test('validateSpec : kpi minimal valide → garde title + value', () => {
  const { svc } = load()
  const spec = svc.validateSpec('kpi', { title: 'MRR', value: '4200€', delta: '+8%' })
  assert.equal(spec.title, 'MRR')
  assert.equal(spec.value, '4200€')
  assert.equal(spec.delta, '+8%')
})

test('validateSpec : chart avec 1 point → throw CHART_NEEDS_2_POINTS', () => {
  const { svc } = load()
  assert.throws(
    () =>
      svc.validateSpec('chart', {
        title: 'CA',
        series: [{ date: '2026-06-01', value: 100 }],
      }),
    (e) => e.code === 'CHART_NEEDS_2_POINTS',
  )
})

test('validateSpec : chart filtre les points invalides + cap 200', () => {
  const { svc } = load()
  const series = []
  for (let i = 0; i < 300; i++) {
    series.push({ date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`, value: i })
  }
  series.push({ date: null, value: 1 }) // invalide
  series.push({ date: '2026-06-02', value: 'abc' }) // invalide
  const spec = svc.validateSpec('chart', { title: 'CA', series })
  assert.equal(spec.series.length, 200)
})

test('validateSpec : kind invalide → throw INVALID_KIND', () => {
  const { svc } = load()
  assert.throws(
    () => svc.validateSpec('haxor', { title: 'x' }),
    (e) => e.code === 'INVALID_KIND',
  )
})

test('createWidget : kpi OK → insere avec position +1', async () => {
  const { svc, captured } = load({ count: 3, maxPosition: 5 })
  const w = await svc.createWidget('ws-1', 'u-1', {
    kind: 'kpi',
    spec: { title: 'Sessions', value: '12500' },
    sourceMessageId: 'msg-1',
  })
  assert.equal(captured.inserted.position, 6)
  assert.equal(captured.inserted.kind, 'kpi')
  assert.equal(captured.inserted.source_kind, 'chat')
  assert.equal(captured.inserted.source_message_id, 'msg-1')
  assert.ok(w.id)
})

test('createWidget : depasse MAX_WIDGETS → throw MAX_WIDGETS', async () => {
  const { svc } = load({ count: 12 })
  await assert.rejects(
    () =>
      svc.createWidget('ws-1', 'u-1', {
        kind: 'kpi',
        spec: { title: 'X', value: '1' },
      }),
    (e) => e.code === 'MAX_WIDGETS',
  )
})

test('createWidget : kind invalide → throw INVALID_KIND', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.createWidget('ws-1', 'u-1', { kind: 'evil', spec: {} }),
    (e) => e.code === 'INVALID_KIND',
  )
})

test('createWidget : spec sans title → throw TITLE_REQUIRED', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.createWidget('ws-1', 'u-1', { kind: 'kpi', spec: { value: '1' } }),
    (e) => e.code === 'TITLE_REQUIRED',
  )
})

test('deleteWidget : retourne deleted=true', async () => {
  const { svc } = load()
  const r = await svc.deleteWidget('ws-1', 'w-1')
  assert.equal(r.deleted, true)
})
