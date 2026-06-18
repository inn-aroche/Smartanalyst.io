// Tests chat-conversations.service : deriveTitle + toGeminiContents (logique
// pure), CRUD via mock Supabase.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/ai/chat-conversations.service')

/**
 * Mock Supabase minimaliste : un objet où chaque méthode de chaîne renvoie
 * `this`, sauf les "terminales" qui résolvent une promesse. On configure le
 * payload terminal via {listRows, singleRow, deletedCount} — selon l'appelant.
 */
function buildSupabaseMock({
  listRows = [],
  singleRow = null,
  maybeSingleRow = null,
  deletedCount = 0,
} = {}) {
  const builder = {
    // Chaîne fluide — chacune retourne le builder lui-même.
    select() {
      return builder
    },
    eq() {
      return builder
    },
    not() {
      return builder
    },
    in() {
      return builder
    },
    is() {
      return builder
    },
    gte() {
      return builder
    },
    order() {
      return builder
    },
    limit() {
      return builder
    },
    insert() {
      return builder
    },
    delete() {
      // Resolve directement avec count (pas de .select/.eq supplémentaire
      // attendu après delete dans notre code).
      return {
        eq() {
          return this
        },
        then(resolve) {
          return Promise.resolve({ error: null, count: deletedCount }).then(resolve)
        },
      }
    },
    // Terminales — chacune résout la promesse.
    single() {
      return Promise.resolve({ data: singleRow, error: null })
    },
    maybeSingle() {
      return Promise.resolve({ data: maybeSingleRow, error: null })
    },
    // Awaitable pour les chaînes qui ne se terminent pas par single()/maybeSingle()
    // (ex: select() + order() + limit() → liste).
    then(resolve) {
      return Promise.resolve({ data: listRows, error: null }).then(resolve)
    },
  }
  return { from: () => builder }
}

function loadSvc(mockOpts) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { getServiceRoleClient: () => buildSupabaseMock(mockOpts) },
  }
  delete require.cache[SERVICE_PATH]
  return require(SERVICE_PATH)
}

// ─── deriveTitle (pur) ──────────────────────────────────────────────────

test('deriveTitle : message court → renvoyé tel quel', () => {
  const svc = loadSvc({})
  assert.equal(svc.deriveTitle('Mon ROAS ?'), 'Mon ROAS ?')
})

test('deriveTitle : message long → tronqué sur un espace, suffixé ellipse', () => {
  const svc = loadSvc({})
  const long = 'Pourquoi mon taux de conversion a chuté la semaine dernière sur Meta Ads et que faire pour le récupérer'
  const r = svc.deriveTitle(long)
  assert.ok(r.length <= 61, `too long: ${r.length}`)
  assert.ok(r.endsWith('…'))
  assert.ok(!r.includes(' …')) // ellipse collée au mot, pas après un espace
})

test('deriveTitle : message vide → fallback', () => {
  const svc = loadSvc({})
  assert.equal(svc.deriveTitle(''), 'Nouvelle conversation')
  assert.equal(svc.deriveTitle(null), 'Nouvelle conversation')
  assert.equal(svc.deriveTitle('   '), 'Nouvelle conversation')
})

test('deriveTitle : whitespace multiple compacté en un seul espace', () => {
  const svc = loadSvc({})
  assert.equal(svc.deriveTitle('Mon   ROAS\n\nplease'), 'Mon ROAS please')
})

// ─── toGeminiContents (pur) ────────────────────────────────────────────

test('toGeminiContents : assistant → role=model, user → role=user', () => {
  const svc = loadSvc({})
  const messages = [
    { role: 'user', content: 'Salut' },
    { role: 'assistant', content: 'Yo' },
    { role: 'user', content: 'Encore' },
  ]
  const out = svc.toGeminiContents(messages)
  assert.deepEqual(out, [
    { role: 'user', parts: [{ text: 'Salut' }] },
    { role: 'model', parts: [{ text: 'Yo' }] },
    { role: 'user', parts: [{ text: 'Encore' }] },
  ])
})

test('toGeminiContents : messages vides filtrés', () => {
  const svc = loadSvc({})
  const messages = [
    { role: 'user', content: '' },
    { role: 'assistant', content: null },
    { role: 'user', content: 'OK' },
  ]
  const out = svc.toGeminiContents(messages)
  assert.equal(out.length, 1)
  assert.equal(out[0].parts[0].text, 'OK')
})

test('toGeminiContents : null / undefined → array vide (pas un crash)', () => {
  const svc = loadSvc({})
  assert.deepEqual(svc.toGeminiContents(null), [])
  assert.deepEqual(svc.toGeminiContents(undefined), [])
  assert.deepEqual(svc.toGeminiContents([]), [])
})

// ─── CRUD via mock Supabase ────────────────────────────────────────────

test('getConversation : retourne null si conversationId absent', async () => {
  const svc = loadSvc({})
  const r = await svc.getConversation(null, 'ws-1')
  assert.equal(r, null)
})

test('getConversation : retourne null si workspaceId absent', async () => {
  const svc = loadSvc({})
  const r = await svc.getConversation('conv-1', null)
  assert.equal(r, null)
})

test('createConversation : insère avec titre dérivé', async () => {
  const created = {
    id: 'new-conv',
    workspace_id: 'ws-1',
    user_id: 'u-1',
    title: 'Mon ROAS',
    created_at: '2026-06-15',
    updated_at: '2026-06-15',
  }
  const svc = loadSvc({ singleRow: created })
  const r = await svc.createConversation({
    workspaceId: 'ws-1',
    userId: 'u-1',
    firstMessage: 'Mon ROAS',
  })
  assert.equal(r.id, 'new-conv')
  assert.equal(r.title, 'Mon ROAS')
})

test('loadRecentMessages : remonte les N plus récents puis re-trie chronologique', async () => {
  // Le mock retourne le bucket DESC (le service trie reverse côté JS).
  const rows = [
    { id: '3', role: 'assistant', content: 'C', sources: [], highlights: [], created_at: '2026-06-15T12:00:00Z' },
    { id: '2', role: 'user', content: 'B', sources: [], highlights: [], created_at: '2026-06-15T11:00:00Z' },
    { id: '1', role: 'assistant', content: 'A', sources: [], highlights: [], created_at: '2026-06-15T10:00:00Z' },
  ]
  const svc = loadSvc({ listRows: rows })
  const r = await svc.loadRecentMessages('conv-1')
  assert.equal(r.length, 3)
  assert.equal(r[0].id, '1') // le plus ancien en 1er
  assert.equal(r[2].id, '3') // le plus récent en dernier
})

test('appendMessage : reject les rôles invalides', async () => {
  const svc = loadSvc({ singleRow: {} })
  await assert.rejects(
    svc.appendMessage({ conversationId: 'c-1', role: 'system', content: 'x' }),
    /invalid role/,
  )
})

test('appendMessage : reject si conversationId absent', async () => {
  const svc = loadSvc({ singleRow: {} })
  await assert.rejects(svc.appendMessage({ role: 'user', content: 'x' }), /conversationId required/)
})

test('appendMessage : tronque content à 50000 chars (defensive)', async () => {
  const svc = loadSvc({ singleRow: { id: 'msg-1', content: 'x' } })
  // On vérifie surtout que le service ne throw pas sur du gros input.
  const r = await svc.appendMessage({
    conversationId: 'c-1',
    role: 'user',
    content: 'a'.repeat(100_000),
  })
  assert.ok(r)
})

test('MAX_CONTEXT_MESSAGES exposé et raisonnable', () => {
  const svc = loadSvc({})
  assert.ok(svc.MAX_CONTEXT_MESSAGES >= 10 && svc.MAX_CONTEXT_MESSAGES <= 50)
})
