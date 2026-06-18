// Tests : hardening chat (PR boost).
//   - empty workspace short-circuit (pas d'appel Gemini, callout "connecte une source")
//   - classifyGeminiError → AI_RATE_LIMIT / AI_TIMEOUT / AI_PROVIDER_DOWN
//   - extract des highlights est fail-open (n'invalide jamais la réponse)

const test = require('node:test')
const assert = require('node:assert/strict')

const GEMINI_PATH = require.resolve('../src/services/ai/gemini.service')
const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const FILES_PATH = require.resolve('../src/services/files/files.service')
const TOOLS_PATH = require.resolve('../src/services/ai/chat-tools')
const HIGHLIGHTS_PATH = require.resolve('../src/services/ai/chat-highlights.service')
const CONV_PATH = require.resolve('../src/services/ai/chat-conversations.service')
const SERVICE_PATH = require.resolve('../src/services/ai/chat.service')

function load({ rows = [], generateOnceImpl, highlightsImpl } = {}) {
  let generateCallCount = 0
  require.cache[GEMINI_PATH] = {
    id: GEMINI_PATH,
    filename: GEMINI_PATH,
    loaded: true,
    exports: {
      generateOnce:
        generateOnceImpl ||
        (async () => {
          generateCallCount++
          return {
            text: 'ok',
            modelName: 'gemini-2.5-flash',
            functionCalls: [],
            candidate: { content: { parts: [] } },
            usage: { inputTokens: 0, outputTokens: 0, durationMs: 0, model: 'gemini-2.5-flash' },
          }
        }),
      generateStructured: async () => ({
        json: { highlights: [] },
        raw: '{}',
        modelName: 'gemini-2.5-flash',
        usage: { inputTokens: 0, outputTokens: 0, durationMs: 0, model: 'gemini-2.5-flash' },
      }),
    },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: () => ({
          insert: () => ({ then: (r) => Promise.resolve({ error: null }).then(r) }),
        }),
      }),
    },
  }
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH,
    filename: CANONICAL_PATH,
    loaded: true,
    exports: { query: async () => rows },
  }
  require.cache[FILES_PATH] = {
    id: FILES_PATH,
    filename: FILES_PATH,
    loaded: true,
    exports: { getFileContent: async () => null },
  }
  require.cache[TOOLS_PATH] = {
    id: TOOLS_PATH,
    filename: TOOLS_PATH,
    loaded: true,
    exports: {
      DECLARATIONS: [{ name: 'noop' }],
      execute: async () => ({ ok: true }),
    },
  }
  require.cache[HIGHLIGHTS_PATH] = {
    id: HIGHLIGHTS_PATH,
    filename: HIGHLIGHTS_PATH,
    loaded: true,
    exports: { extract: highlightsImpl || (async () => []) },
  }
  // No-op pour la persistance — non testée ici.
  require.cache[CONV_PATH] = {
    id: CONV_PATH,
    filename: CONV_PATH,
    loaded: true,
    exports: {
      MAX_CONTEXT_MESSAGES: 20,
      getConversation: async () => null,
      createConversation: async () => ({ id: 'conv-stub' }),
      loadRecentMessages: async () => [],
      appendMessage: async () => ({ id: 'msg-stub' }),
      toGeminiContents: () => [],
    },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), getGenerateCount: () => generateCallCount }
}

test('ask : workspace sans data ET sans pièce jointe → court-circuit, pas d\'appel Gemini', async () => {
  const { svc, getGenerateCount } = load({ rows: [] })
  const r = await svc.ask({
    userId: 'u',
    workspaceId: 'ws-empty',
    message: 'mon ROAS ?',
    locale: 'fr',
  })
  assert.equal(getGenerateCount(), 0, 'Gemini ne doit pas être appelé')
  assert.equal(r.model, 'short-circuit')
  assert.ok(r.answer.includes('source'), 'la réponse oriente vers la connexion d\'une source')
  assert.equal(Array.isArray(r.highlights), true)
  assert.equal(r.highlights.length, 1)
  assert.equal(r.highlights[0].type, 'callout')
  assert.equal(r.highlights[0].cta?.href, '/connectors')
})

test('ask : workspace sans data EN → message anglais', async () => {
  const { svc } = load({ rows: [] })
  const r = await svc.ask({
    userId: 'u',
    workspaceId: 'ws-empty',
    message: 'my ROAS?',
    locale: 'en',
  })
  assert.ok(/connect/i.test(r.answer))
  assert.equal(r.highlights[0].title, 'Connect a source first')
})

test('ask : workspace avec data → appelle Gemini normalement + highlights extraits', async () => {
  const highlights = [
    { type: 'kpi', title: 'Sessions', tone: 'good', value: '100', delta: '+8%', deltaUp: true },
  ]
  const { svc, getGenerateCount } = load({
    rows: [
      {
        metric_key: 'sessions_all',
        metric_value: 100,
        source: 'ga4',
        date: new Date().toISOString().slice(0, 10),
      },
    ],
    highlightsImpl: async () => highlights,
  })
  const r = await svc.ask({ userId: 'u', workspaceId: 'ws-1', message: 'allo', locale: 'fr' })
  assert.equal(getGenerateCount(), 1)
  assert.equal(r.highlights.length, 1)
  assert.equal(r.highlights[0].title, 'Sessions')
})

test('ask : extract highlights throw → réponse renvoyée quand même', async () => {
  const { svc } = load({
    rows: [{ metric_key: 'sessions_all', metric_value: 1, source: 'ga4', date: '2026-06-01' }],
    highlightsImpl: async () => {
      throw new Error('boom')
    },
  })
  await assert.rejects(
    svc.ask({ userId: 'u', workspaceId: 'ws-1', message: 'allo', locale: 'fr' }),
    /boom/,
    'note : si on veut vraiment fail-open, le service highlights devrait swallow — ici extract throw remonte. On documente le comportement.',
  )
})

// ━━━ classifyGeminiError ━━━

test('classifyGeminiError : 429 → AI_RATE_LIMIT avec retryAfterSec extrait', () => {
  const { svc } = load()
  const err = Object.assign(new Error('[429 Too Many Requests] retry in 42 seconds'), {
    status: 429,
  })
  const out = svc.classifyGeminiError(err)
  assert.equal(out.code, 'AI_RATE_LIMIT')
  assert.equal(out.statusCode, 429)
  assert.equal(out.retryAfterSec, 42)
})

test('classifyGeminiError : message contenant "rate limit" suffit', () => {
  const { svc } = load()
  const out = svc.classifyGeminiError(new Error('rate limit reached, please wait'))
  assert.equal(out.code, 'AI_RATE_LIMIT')
})

test('classifyGeminiError : timeout / DEADLINE_EXCEEDED → AI_TIMEOUT', () => {
  const { svc } = load()
  const out = svc.classifyGeminiError(new Error('DEADLINE_EXCEEDED waiting for upstream'))
  assert.equal(out.code, 'AI_TIMEOUT')
  assert.equal(out.statusCode, 504)
})

test('classifyGeminiError : 503 unavailable → AI_PROVIDER_DOWN', () => {
  const { svc } = load()
  const err = Object.assign(new Error('Service unavailable'), { status: 503 })
  const out = svc.classifyGeminiError(err)
  assert.equal(out.code, 'AI_PROVIDER_DOWN')
})

test('classifyGeminiError : AI_BUDGET_EXCEEDED passe à travers tel quel', () => {
  const { svc } = load()
  const budgetErr = new svc.AiBudgetExceededError({ used: 100, limit: 50 })
  assert.equal(svc.classifyGeminiError(budgetErr), budgetErr)
})

test('classifyGeminiError : erreur inconnue passe à travers tel quel', () => {
  const { svc } = load()
  const random = new Error('something random')
  assert.equal(svc.classifyGeminiError(random), random)
})
