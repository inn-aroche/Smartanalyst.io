// Anthropic Claude wrapper — utilisé pour le mode "Approfondi" du chat
// (cahier ADR-04). Mirror minimal de gemini.service.generateStream pour que
// chat.service.askStream puisse router selon le mode sans connaître le
// provider.
//
// Modèle par défaut : Claude Sonnet 4.6 (claude-sonnet-4-6) pour les
// analyses approfondies — meilleur reasoning que Haiku au prix d'une latence
// 2-3x supérieure. Surcharge via `AI_SMART_MODEL`.
//
// Note function-calling : Anthropic supporte `tools` avec un format différent
// de Gemini (input_schema JSON Schema au lieu de FunctionDeclaration). Pour
// rester pragmatique sur ce 1er round, on n'expose PAS les tools en mode
// Claude. Les crochets d'action restent disponibles via Gemini (mode Rapide).
// Cette limitation est intentionnelle : "Approfondi" sert à l'analyse longue,
// pas à l'action — c'est la philosophie cahier §3 Lot 1.

const { getAnthropic, SMART_MODEL } = require('../../lib/anthropic')

class ClaudeNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY missing or placeholder.')
    this.code = 'CLAUDE_NOT_CONFIGURED'
    this.statusCode = 503
  }
}

function ensureConfigured() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key.startsWith('sk-ant-<') || key === '') {
    throw new ClaudeNotConfiguredError()
  }
}

/**
 * Convertit l'historique format Gemini (role: 'user'|'model', parts: [{text}])
 * en format Anthropic (role: 'user'|'assistant', content: string|blocks).
 * Anthropic n'a pas de rôle 'model', c'est 'assistant'.
 */
function toAnthropicMessages(geminiContents) {
  return geminiContents
    .filter((c) => c.role === 'user' || c.role === 'model')
    .map((c) => {
      const role = c.role === 'model' ? 'assistant' : 'user'
      // On extrait le texte de chaque part (Anthropic accepte des images en
      // tant que blocs image mais on ne porte pas le multimodal ici — V2).
      const text = (c.parts || [])
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
      return { role, content: text || ' ' }
    })
}

/**
 * Streaming Claude. Mêmes contrats que gemini.service.generateStream pour
 * que l'appelant (chat.service.askStream) puisse les utiliser
 * interchangeablement.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array}  [params.contents]   - format Gemini (converti en interne)
 * @param {string} [params.userMessage] - alternative à contents (1 seul tour)
 * @param {number} [params.temperature=0.4]
 * @param {(delta: string) => void} [params.onDelta]
 * @returns {Promise<{ text, modelName, functionCalls, usage }>}
 */
async function generateStream({ systemPrompt, userMessage, contents, temperature = 0.4, onDelta }) {
  ensureConfigured()
  const client = getAnthropic()
  const model = process.env.AI_SMART_MODEL || SMART_MODEL

  const messages = contents
    ? toAnthropicMessages(contents)
    : [{ role: 'user', content: userMessage || ' ' }]

  const t0 = Date.now()
  let text = ''
  let inputTokens = 0
  let outputTokens = 0

  // Le SDK Anthropic expose un Stream via `messages.stream` — itérable
  // avec des évènements typés. On capture les `content_block_delta` (texte)
  // et le `message_delta` final (usage).
  const stream = await client.messages.stream({
    model,
    system: systemPrompt,
    messages,
    temperature,
    max_tokens: 2048,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const delta = event.delta.text || ''
      if (delta) {
        text += delta
        if (typeof onDelta === 'function') onDelta(delta)
      }
    } else if (event.type === 'message_delta' && event.usage) {
      // Anthropic remonte les tokens output dans message_delta progressif.
      // Le total final est aussi dispo via finalMessage() ; on prend le plus
      // récent vu pendant le stream.
      if (event.usage.output_tokens) outputTokens = event.usage.output_tokens
    } else if (event.type === 'message_start' && event.message?.usage) {
      inputTokens = event.message.usage.input_tokens || 0
    }
  }

  return {
    text,
    modelName: model,
    // Claude function-calling pas branché ici (cf. commentaire en-tête).
    functionCalls: [],
    candidate: null,
    usage: {
      inputTokens,
      outputTokens,
      durationMs: Date.now() - t0,
      model,
    },
  }
}

module.exports = {
  generateStream,
  ClaudeNotConfiguredError,
}
