// Tests ai-usage : computeCostUsd + recordUsage + getMonthlyUsage agréation.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/ai/ai-usage.service')

function load({ rows = [], workspace = { ai_monthly_token_limit: null }, throws = null } = {}) {
  const captured = { insertRow: null }
  const chain = {
    select() {
      return this
    },
    eq() {
      return this
    },
    gte() {
      return this
    },
    insert(row) {
      captured.insertRow = row
      if (throws) return { ...this, then: (cb) => cb({ error: throws }) }
      return { ...this, then: (cb) => cb({ error: null }) }
    },
    maybeSingle: async () => ({ data: workspace, error: null }),
    then(cb) {
      cb({ data: rows, error: null })
    },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { getServiceRoleClient: () => ({ from: () => chain }) },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), captured }
}

test('computeCostUsd : Gemini 2.5 Flash 1000 in + 500 out → 0.00155 USD', () => {
  const { svc } = load()
  // (1000 * 0.3 + 500 * 2.5) / 1_000_000 = 0.00155
  const cost = svc.computeCostUsd('gemini-2.5-flash', 1000, 500)
  assert.equal(cost, 0.00155)
})

test('computeCostUsd : modèle inconnu → 0', () => {
  const { svc } = load()
  assert.equal(svc.computeCostUsd('unknown-model', 1000, 500), 0)
})

test('recordUsage : workspaceId null → no-op silencieux', async () => {
  const { svc, captured } = load()
  await svc.recordUsage({
    workspaceId: null,
    model: 'gemini-2.5-flash',
    requestType: 'chat',
    inputTokens: 100,
    outputTokens: 50,
  })
  assert.equal(captured.insertRow, null)
})

test('recordUsage : INSERT correct avec cost calculé', async () => {
  const { svc, captured } = load()
  await svc.recordUsage({
    workspaceId: 'ws-1',
    userId: 'u-1',
    model: 'gemini-2.5-flash',
    requestType: 'chat',
    inputTokens: 1000,
    outputTokens: 500,
    durationMs: 1234,
  })
  assert.equal(captured.insertRow.workspace_id, 'ws-1')
  assert.equal(captured.insertRow.input_tokens, 1000)
  assert.equal(captured.insertRow.output_tokens, 500)
  assert.equal(captured.insertRow.cost_usd, 0.00155)
  assert.equal(captured.insertRow.duration_ms, 1234)
  assert.equal(captured.insertRow.request_type, 'chat')
})

test('recordUsage : ne throw jamais même si INSERT échoue', async () => {
  const { svc } = load({ throws: { message: 'boom' } })
  // Best-effort : on s'assure que ça ne crash pas.
  await svc.recordUsage({
    workspaceId: 'ws-1',
    model: 'gemini-2.5-flash',
    requestType: 'chat',
    inputTokens: 100,
    outputTokens: 50,
  })
})

test('PRICING expose les modèles connus', () => {
  const { svc } = load()
  assert.ok(svc.PRICING['gemini-2.5-flash'])
  assert.ok(svc.PRICING['claude-sonnet-4-6'])
})
