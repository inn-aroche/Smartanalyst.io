// Tests : boucle de function-calling — le chat exécute les tools demandés
// par Gemini et re-soumet leur réponse jusqu'à la réponse finale.

const test = require('node:test')
const assert = require('node:assert/strict')

const GEMINI_PATH = require.resolve('../src/services/ai/gemini.service')
const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const FILES_PATH = require.resolve('../src/services/files/files.service')
const TOOLS_PATH = require.resolve('../src/services/ai/chat-tools')
const CONV_PATH = require.resolve('../src/services/ai/chat-conversations.service')
const SERVICE_PATH = require.resolve('../src/services/ai/chat.service')

function load({ generateOutputs = [{ text: 'Done', functionCalls: [] }], toolResults = {} } = {}) {
  let generateCallCount = 0
  const generateArgs = []

  require.cache[GEMINI_PATH] = {
    id: GEMINI_PATH,
    filename: GEMINI_PATH,
    loaded: true,
    exports: {
      generateOnce: async (args) => {
        generateArgs.push(args)
        const out = generateOutputs[generateCallCount] || generateOutputs[generateOutputs.length - 1]
        generateCallCount++
        return {
          text: out.text || '',
          modelName: 'gemini-2.5-flash',
          functionCalls: out.functionCalls || [],
          candidate: out.candidate || {
            content: {
              parts: (out.functionCalls || []).map((fc) => ({ functionCall: fc })),
            },
          },
        }
      },
    },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: () => ({ insert: () => ({ then: (r) => Promise.resolve({ error: null }).then(r) }) }),
      }),
    },
  }
  // Métrique fictive non-vide : empêche le short-circuit "empty workspace"
  // d'intercepter avant d'atteindre Gemini, ce qu'on teste ici.
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH,
    filename: CANONICAL_PATH,
    loaded: true,
    exports: {
      query: async () => [
        {
          metric_key: 'sessions_all',
          metric_value: 100,
          source: 'ga4',
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    },
  }
  require.cache[FILES_PATH] = {
    id: FILES_PATH,
    filename: FILES_PATH,
    loaded: true,
    exports: { getFileContent: async () => null },
  }
  const toolCalls = []
  require.cache[TOOLS_PATH] = {
    id: TOOLS_PATH,
    filename: TOOLS_PATH,
    loaded: true,
    exports: {
      DECLARATIONS: [{ name: 'get_health_score' }],
      execute: async ({ name, args }, ctx) => {
        toolCalls.push({ name, args, ctx })
        return toolResults[name] ?? { ok: true }
      },
    },
  }
  // Mock conversation persistence : no-op, on ne teste pas la persistance
  // ici (couvert par chat-conversations.test.js). loadRecentMessages renvoie
  // [] pour ne pas injecter d'historique dans les attentes de tests.
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
  return { svc: require(SERVICE_PATH), generateArgs, toolCalls }
}

test('ask : pas de function call → 1 appel Gemini, réponse texte directe', async () => {
  const { svc, generateArgs, toolCalls } = load({
    generateOutputs: [{ text: 'Direct answer', functionCalls: [] }],
  })
  const r = await svc.ask({ userId: 'u', workspaceId: 'ws-1', message: 'Salut', locale: 'fr' })
  assert.equal(r.answer, 'Direct answer')
  assert.equal(generateArgs.length, 1)
  assert.equal(toolCalls.length, 0)
})

test('ask : 1 function call → exécute → re-soumet → réponse finale', async () => {
  const { svc, generateArgs, toolCalls } = load({
    generateOutputs: [
      { text: '', functionCalls: [{ name: 'get_health_score', args: {} }] },
      { text: 'Score est 72', functionCalls: [] },
    ],
    toolResults: { get_health_score: { score: 72, delta_7d: 3 } },
  })
  const r = await svc.ask({ userId: 'u', workspaceId: 'ws-1', message: 'Mon score ?', locale: 'fr' })
  assert.equal(r.answer, 'Score est 72')
  assert.equal(generateArgs.length, 2)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'get_health_score')
  assert.equal(toolCalls[0].ctx.workspaceId, 'ws-1')
  // Le 2e appel Gemini doit contenir l'historique : user → model (functionCall) → user (functionResponse)
  const secondContents = generateArgs[1].contents
  assert.equal(secondContents.length, 3)
  assert.equal(secondContents[0].role, 'user')
  assert.equal(secondContents[1].role, 'model')
  assert.equal(secondContents[2].role, 'user')
  assert.ok(secondContents[2].parts[0].functionResponse)
  assert.equal(secondContents[2].parts[0].functionResponse.name, 'get_health_score')
})

test('ask : workspaceId est injecté côté serveur (pas depuis les args du tool)', async () => {
  const { svc, toolCalls } = load({
    generateOutputs: [
      {
        text: '',
        functionCalls: [{ name: 'get_health_score', args: { workspaceId: 'EVIL' } }],
      },
      { text: 'ok', functionCalls: [] },
    ],
  })
  await svc.ask({ userId: 'u', workspaceId: 'real-ws', message: 'go', locale: 'fr' })
  assert.equal(toolCalls[0].ctx.workspaceId, 'real-ws')
})

test('ask : function calls en chaîne → max 3 rounds puis stop', async () => {
  // Le model demande un tool à chaque tour. On doit s'arrêter après MAX_TOOL_ROUNDS=3
  // et retourner la réponse du dernier appel (vide ici).
  const { svc, generateArgs } = load({
    generateOutputs: [
      { text: '', functionCalls: [{ name: 'get_health_score', args: {} }] },
      { text: '', functionCalls: [{ name: 'get_health_score', args: {} }] },
      { text: '', functionCalls: [{ name: 'get_health_score', args: {} }] },
      { text: 'finally', functionCalls: [] },
    ],
  })
  const r = await svc.ask({ userId: 'u', workspaceId: 'ws-1', message: 'go', locale: 'fr' })
  // 3 rounds avec function calls + 1 round final → 4 appels Gemini au total.
  assert.equal(generateArgs.length, 4)
  assert.equal(r.answer, 'finally')
})

test('ask : function calls parallèles dans le même tour', async () => {
  const { svc, toolCalls } = load({
    generateOutputs: [
      {
        text: '',
        functionCalls: [
          { name: 'get_health_score', args: {} },
          { name: 'list_top_insights', args: { limit: 3 } },
        ],
      },
      { text: 'résumé', functionCalls: [] },
    ],
  })
  await svc.ask({ userId: 'u', workspaceId: 'ws-1', message: 'résumé', locale: 'fr' })
  assert.equal(toolCalls.length, 2)
  assert.equal(toolCalls[0].name, 'get_health_score')
  assert.equal(toolCalls[1].name, 'list_top_insights')
  assert.deepEqual(toolCalls[1].args, { limit: 3 })
})
