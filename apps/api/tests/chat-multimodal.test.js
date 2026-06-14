// Tests : le chat résout les fileIds en pièces jointes inline pour Gemini.

const test = require('node:test')
const assert = require('node:assert/strict')

const GEMINI_PATH = require.resolve('../src/services/ai/gemini.service')
const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const CANONICAL_PATH = require.resolve('../src/services/metrics/canonical-metrics.service')
const FILES_PATH = require.resolve('../src/services/files/files.service')
const SERVICE_PATH = require.resolve('../src/services/ai/chat.service')

function load({ fileContents = {}, fileThrowsFor = [] } = {}) {
  let lastGenerateArgs = null

  require.cache[GEMINI_PATH] = {
    id: GEMINI_PATH,
    filename: GEMINI_PATH,
    loaded: true,
    exports: {
      generateOnce: async (args) => {
        lastGenerateArgs = args
        return {
          text: 'Réponse.',
          modelName: 'gemini-2.5-flash',
          functionCalls: [],
          candidate: null,
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
  require.cache[CANONICAL_PATH] = {
    id: CANONICAL_PATH,
    filename: CANONICAL_PATH,
    loaded: true,
    exports: { query: async () => [] }, // pas de metrics → contexte null
  }
  require.cache[FILES_PATH] = {
    id: FILES_PATH,
    filename: FILES_PATH,
    loaded: true,
    exports: {
      getFileContent: async (_ws, fileId) => {
        if (fileThrowsFor.includes(fileId)) throw new Error('boom')
        return fileContents[fileId] || { filename: 'f', mimeType: 'image/png', base64: 'AAAA' }
      },
    },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), getLast: () => lastGenerateArgs }
}

// Helper : extrait les inlineData parts du 1er message user (les attachments
// sont posés dans contents[0].parts à côté du texte depuis function-calling).
function attachmentsOf(args) {
  const parts = args?.contents?.[0]?.parts || []
  return parts.filter((p) => p.inlineData).map((p) => p.inlineData)
}

test('ask sans fileIds → pas de pièce jointe', async () => {
  const { svc, getLast } = load()
  await svc.ask({ userId: 'u', workspaceId: 'ws-1', message: 'Salut', locale: 'fr' })
  assert.deepEqual(attachmentsOf(getLast()), [])
})

test('ask avec fileIds → résout en attachments inline', async () => {
  const { svc, getLast } = load({
    fileContents: {
      'file-a': { filename: 'a.png', mimeType: 'image/png', base64: 'IMG' },
      'file-b': { filename: 'b.pdf', mimeType: 'application/pdf', base64: 'PDF' },
    },
  })
  await svc.ask({
    userId: 'u',
    workspaceId: 'ws-1',
    message: 'Analyse ces fichiers',
    locale: 'fr',
    fileIds: ['file-a', 'file-b'],
  })
  const atts = attachmentsOf(getLast())
  assert.equal(atts.length, 2)
  assert.deepEqual(atts[0], { mimeType: 'image/png', data: 'IMG' })
  assert.deepEqual(atts[1], { mimeType: 'application/pdf', data: 'PDF' })
})

test('ask : un fichier illisible est ignoré, pas bloquant', async () => {
  const { svc, getLast } = load({
    fileContents: { ok: { filename: 'ok.png', mimeType: 'image/png', base64: 'OK' } },
    fileThrowsFor: ['broken'],
  })
  const r = await svc.ask({
    userId: 'u',
    workspaceId: 'ws-1',
    message: 'go',
    locale: 'fr',
    fileIds: ['broken', 'ok'],
  })
  assert.equal(r.answer, 'Réponse.')
  const atts = attachmentsOf(getLast())
  assert.equal(atts.length, 1)
  assert.equal(atts[0].data, 'OK')
})

test('ask : cap à 4 fichiers', async () => {
  const { svc, getLast } = load({
    fileContents: {
      a: { mimeType: 'image/png', base64: 'A' },
      b: { mimeType: 'image/png', base64: 'B' },
      c: { mimeType: 'image/png', base64: 'C' },
      d: { mimeType: 'image/png', base64: 'D' },
      e: { mimeType: 'image/png', base64: 'E' },
      f: { mimeType: 'image/png', base64: 'F' },
    },
  })
  await svc.ask({
    userId: 'u',
    workspaceId: 'ws-1',
    message: 'go',
    locale: 'fr',
    fileIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  })
  assert.equal(attachmentsOf(getLast()).length, 4)
})
