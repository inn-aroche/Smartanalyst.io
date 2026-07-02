// Tests : evenements SSE 'tool' emis pendant askStream (cahier 22b §3.5).
// Verifie que chaque appel de tool produit un event 'running' puis 'done'.
// Verifie aussi que le filtre `sources` est injecte dans le system prompt.

const test = require('node:test')
const assert = require('node:assert/strict')

const GEMINI_PATH = require.resolve('../src/services/ai/gemini.service')
const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const FILES_PATH = require.resolve('../src/services/files/files.service')
const TOOLS_PATH = require.resolve('../src/services/ai/chat-tools')
const CONV_PATH = require.resolve('../src/services/ai/chat-conversations.service')
const HIGHLIGHTS_PATH = require.resolve('../src/services/ai/chat-highlights.service')
const AI_USAGE_PATH = require.resolve('../src/services/ai/ai-usage.service')
const SERVICE_PATH = require.resolve('../src/services/ai/chat.service')

function load({ streamOutputs }) {
  let streamCallCount = 0
  const streamArgs = []

  require.cache[GEMINI_PATH] = {
    id: GEMINI_PATH,
    filename: GEMINI_PATH,
    loaded: true,
    exports: {
      generateStream: async (args) => {
        streamArgs.push(args)
        const out = streamOutputs[streamCallCount] || streamOutputs[streamOutputs.length - 1]
        streamCallCount++
        // Simule un stream avec quelques chunks texte au dernier tour.
        if (out.text && typeof args.onDelta === 'function') {
          args.onDelta(out.text)
        }
        return {
          text: out.text || '',
          modelName: 'gemini-2.5-flash',
          functionCalls: out.functionCalls || [],
          candidate: {
            content: {
              parts: (out.functionCalls || []).map((fc) => ({ functionCall: fc })),
            },
          },
          usage: { inputTokens: 10, outputTokens: 20, durationMs: 100 },
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

  require.cache[TOOLS_PATH] = {
    id: TOOLS_PATH,
    filename: TOOLS_PATH,
    loaded: true,
    exports: {
      DECLARATIONS: [{ name: 'get_health_score' }, { name: 'list_top_insights' }],
      execute: async ({ name }) => {
        if (name === 'get_health_score') return { score: 72 }
        if (name === 'list_top_insights') return { insights: [] }
        return { ok: true }
      },
    },
  }

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

  require.cache[HIGHLIGHTS_PATH] = {
    id: HIGHLIGHTS_PATH,
    filename: HIGHLIGHTS_PATH,
    loaded: true,
    exports: { extract: async () => ({ highlights: [], followUps: [] }) },
  }

  require.cache[AI_USAGE_PATH] = {
    id: AI_USAGE_PATH,
    filename: AI_USAGE_PATH,
    loaded: true,
    exports: {
      checkBudget: async () => ({ allowed: true, used: 0, limit: 100 }),
      recordUsage: async () => null,
    },
  }

  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), streamArgs }
}

test("askStream : emet 'tool' running puis done autour de chaque tool call", async () => {
  const { svc } = load({
    streamOutputs: [
      // Tour 1 : Gemini demande get_health_score
      {
        text: '',
        functionCalls: [{ name: 'get_health_score', args: {} }],
      },
      // Tour 2 : reponse finale
      {
        text: 'Ton score est 72.',
        functionCalls: [],
      },
    ],
  })

  const events = []
  await svc.askStream({
    userId: 'u-1',
    workspaceId: 'ws-1',
    message: 'Score ?',
    onEvent: (ev) => events.push(ev),
  })

  const toolEvents = events.filter((e) => e.type === 'tool')
  assert.equal(toolEvents.length, 2, 'should emit 2 tool events (running + done)')
  assert.equal(toolEvents[0].name, 'get_health_score')
  assert.equal(toolEvents[0].status, 'running')
  assert.equal(toolEvents[1].name, 'get_health_score')
  assert.equal(toolEvents[1].status, 'done')
})

test('askStream : multi tool calls → 2x (running + done)', async () => {
  const { svc } = load({
    streamOutputs: [
      {
        text: '',
        functionCalls: [
          { name: 'get_health_score', args: {} },
          { name: 'list_top_insights', args: {} },
        ],
      },
      { text: 'OK.', functionCalls: [] },
    ],
  })

  const events = []
  await svc.askStream({
    userId: 'u-1',
    workspaceId: 'ws-1',
    message: 'Score + insights',
    onEvent: (ev) => events.push(ev),
  })

  const toolEvents = events.filter((e) => e.type === 'tool')
  assert.equal(toolEvents.length, 4)
  const names = toolEvents.map((e) => e.name)
  assert.deepEqual(names.sort(), ['get_health_score', 'get_health_score', 'list_top_insights', 'list_top_insights'])
})

test("askStream : filtre 'sources' injecte une directive dans le system prompt", async () => {
  const { svc, streamArgs } = load({
    streamOutputs: [{ text: 'OK.', functionCalls: [] }],
  })

  await svc.askStream({
    userId: 'u-1',
    workspaceId: 'ws-1',
    message: 'Compare canaux',
    sources: ['ga4', 'meta_ads'],
    onEvent: () => null,
  })

  assert.ok(streamArgs.length >= 1)
  const sp = streamArgs[0].systemPrompt
  assert.match(sp, /ga4/)
  assert.match(sp, /meta_ads/)
  // En francais (defaut locale='fr') on doit voir la phrase de contrainte.
  assert.match(sp, /restreint les sources/)
})

test('askStream : sans filtre sources → pas de directive dans le system prompt', async () => {
  const { svc, streamArgs } = load({
    streamOutputs: [{ text: 'OK.', functionCalls: [] }],
  })

  await svc.askStream({
    userId: 'u-1',
    workspaceId: 'ws-1',
    message: 'Question simple',
    onEvent: () => null,
  })

  const sp = streamArgs[0].systemPrompt
  assert.doesNotMatch(sp, /restreint les sources/)
})
