// chat-conversations.service — persistance des fils de discussion chat.
//
// Migration 031 introduit `chat_conversations` (1 fil) + `chat_messages`
// (N messages role=user|assistant). Avant ça, chaque tour de chat repartait
// de zéro côté contexte LLM. Ce service est la couche d'accès qu'utilise
// chat.service.ask() pour :
//   1. Charger l'historique d'une conversation existante (passé au LLM)
//   2. Créer une nouvelle conversation si conversationId absent
//   3. Persister le message user + la réponse assistant après chaque tour
//
// Cap volume : on garde les MAX_CONTEXT_MESSAGES derniers messages du fil
// pour les passer au LLM. Au-delà, on ne rompt pas le fil (l'user voit
// tout l'historique côté UI), on l'élide juste du prompt LLM pour
// contrôler le coût token. La conversation peut grandir indéfiniment.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')

// Nombre max de messages (user+assistant cumulés) renvoyés au LLM par
// tour. Au-delà, les plus anciens sont coupés. 20 = ~10 paires Q/R,
// suffisant pour 95 % des cas et borne le coût input tokens.
const MAX_CONTEXT_MESSAGES = 20

/**
 * Récupère une conversation par id en vérifiant l'ownership workspace.
 * Renvoie null si introuvable / pas autorisée.
 */
async function getConversation(conversationId, workspaceId) {
  if (!conversationId || !workspaceId) return null
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, workspace_id, user_id, title, created_at, updated_at')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Liste les conversations d'un workspace, triées par dernière activité.
 * Pour la sidebar "historique" côté frontend (PR future).
 */
async function listConversations(workspaceId, { limit = 50 } = {}) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, title, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/**
 * Crée une nouvelle conversation. Le titre est dérivé du 1er message user
 * (premiers 60 chars). Best-effort : on coupe sur un espace si possible
 * pour ne pas couper un mot au milieu.
 */
async function createConversation({ workspaceId, userId, firstMessage }) {
  const supabase = getServiceRoleClient()
  const title = deriveTitle(firstMessage)
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ workspace_id: workspaceId, user_id: userId || null, title })
    .select('id, workspace_id, user_id, title, created_at, updated_at')
    .single()
  if (error) throw error
  return data
}

function deriveTitle(message) {
  const cleaned = String(message || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!cleaned) return 'Nouvelle conversation'
  if (cleaned.length <= 60) return cleaned
  // Coupe au dernier espace avant 60 pour ne pas couper un mot.
  const slice = cleaned.slice(0, 60)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 30 ? slice.slice(0, lastSpace) : slice) + '…'
}

/**
 * Charge les N derniers messages d'une conversation, par ordre chronologique
 * croissant (= le format attendu par Gemini : on parle dans l'ordre).
 */
async function loadRecentMessages(conversationId, { limit = MAX_CONTEXT_MESSAGES } = {}) {
  if (!conversationId) return []
  const supabase = getServiceRoleClient()
  // Trick : on prend les N plus récents (DESC) puis on inverse côté JS
  // pour avoir l'ordre chronologique attendu par le LLM.
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, sources, highlights, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

/**
 * Charge l'historique COMPLET d'une conversation, pour affichage UI au
 * chargement du fil (pas de cap, contrairement à ce qu'on envoie au LLM).
 */
async function listMessages(conversationId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, sources, highlights, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Append un message dans une conversation existante. Best-effort sur les
 * champs optionnels (tokens, model, sources, highlights). Le trigger
 * touch_chat_conversation bump l'updated_at de la conversation pour qu'elle
 * remonte en tête de liste.
 */
async function appendMessage({
  conversationId,
  role,
  content,
  sources = [],
  highlights = [],
  inputTokens = 0,
  outputTokens = 0,
  model = null,
}) {
  if (!conversationId) throw new Error('appendMessage: conversationId required')
  if (role !== 'user' && role !== 'assistant') {
    throw new Error(`appendMessage: invalid role "${role}"`)
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      role,
      content: String(content || '').slice(0, 50000),
      sources: sources || [],
      highlights: highlights || [],
      input_tokens: inputTokens || 0,
      output_tokens: outputTokens || 0,
      model,
    })
    .select('id, role, content, sources, highlights, created_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Supprime une conversation (et ses messages, ON DELETE CASCADE).
 */
async function deleteConversation(conversationId, workspaceId) {
  const supabase = getServiceRoleClient()
  const { error, count } = await supabase
    .from('chat_conversations')
    .delete({ count: 'exact' })
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return { deleted: (count || 0) > 0 }
}

/**
 * Transforme les messages persistés en format Gemini `contents` :
 *   [{ role: 'user'|'model', parts: [{text}] }, ...]
 *
 * Gemini utilise role='model' pour ses propres outputs, pas 'assistant'.
 * Les function calls intermédiaires NE SONT PAS persistés (régénérés à
 * chaque tour), donc on ne les remet pas dans l'historique.
 */
function toGeminiContents(messages) {
  return (messages || [])
    .map((m) => {
      const role = m.role === 'assistant' ? 'model' : 'user'
      const text = typeof m.content === 'string' ? m.content : ''
      if (!text) return null
      return { role, parts: [{ text }] }
    })
    .filter(Boolean)
}

module.exports = {
  MAX_CONTEXT_MESSAGES,
  getConversation,
  listConversations,
  createConversation,
  loadRecentMessages,
  listMessages,
  appendMessage,
  deleteConversation,
  toGeminiContents,
  // Internal helpers exposés pour les tests
  deriveTitle,
}
