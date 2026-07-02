// Anthropic Claude wrapper — utilisé pour le mode "Approfondi" du chat
// (cahier ADR-04). Mirror de gemini.service.generateStream pour que
// chat.service.askStream puisse router selon le mode sans connaître le
// provider.
//
// Modèle par défaut : Claude Sonnet 5 (claude-sonnet-5) pour les analyses
// approfondies — qualité proche d'Opus au prix Sonnet. Surcharge via
// `AI_SMART_MODEL`. Particularités Sonnet 5 : temperature/top_p/top_k
// non-défaut sont rejetés (400), le thinking adaptatif est actif par défaut
// et compte dans le budget max_tokens (d'où le passage 2048 → 8192).
//
// Function-calling : porté à Claude (Anthropic Messages API "tools").
// Format différent de Gemini (JSON Schema input_schema vs FunctionDeclaration) —
// on convertit en interne via `toAnthropicTools()`. Les `functionCalls` remontés
// suivent le même contrat que generateOnce/generateStream Gemini pour que
// chat.service.askStream() ne se soucie pas du provider sous-jacent.

const { getAnthropic, SMART_MODEL } = require('../../lib/anthropic')

class ClaudeNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY missing or placeholder.')
    this.code = 'CLAUDE_NOT_CONFIGURED'
    this.statusCode = 503
  }
}

// Anthropic renvoie un 400 "credit balance is too low" quand le compte
// n'a plus de crédits prépayés. On la mappe vers AI_CREDIT_DEPLETED pour
// que le frontend affiche un message dédié (et pas l'erreur brute).
class ClaudeCreditDepletedError extends Error {
  constructor() {
    super('Anthropic credit balance too low.')
    this.code = 'AI_CREDIT_DEPLETED'
    this.statusCode = 402
  }
}

function classifyAnthropicError(err) {
  const msg = String(err?.message || '')
  if (/credit balance is too low|credit_balance/i.test(msg)) {
    return new ClaudeCreditDepletedError()
  }
  return err
}

function ensureConfigured() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key.startsWith('sk-ant-<') || key === '') {
    throw new ClaudeNotConfiguredError()
  }
}

/**
 * Convertit les tool declarations Gemini (FunctionDeclaration au format
 * STRING/INTEGER en majuscules) vers le format Anthropic (JSON Schema
 * standard avec "string"/"integer" en minuscules + properties enveloppé
 * dans input_schema).
 */
function toAnthropicTools(geminiTools) {
  if (!Array.isArray(geminiTools) || geminiTools.length === 0) return undefined
  return geminiTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: normalizeProperties(t.parameters?.properties || {}),
      required: t.parameters?.required || [],
    },
  }))
}

// Recursive : Gemini utilise 'OBJECT'/'STRING'/'INTEGER'/'NUMBER'/'BOOLEAN'/'ARRAY'
// en MAJUSCULES, JSON Schema (Anthropic) attend les mêmes mots en minuscules.
function normalizeProperties(props) {
  const out = {}
  for (const [key, schema] of Object.entries(props)) {
    out[key] = normalizeSchema(schema)
  }
  return out
}

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  const out = { ...schema }
  if (typeof out.type === 'string') out.type = out.type.toLowerCase()
  if (out.properties) out.properties = normalizeProperties(out.properties)
  if (out.items) out.items = normalizeSchema(out.items)
  return out
}

// Types d'images acceptés par les content blocks image Anthropic.
const ANTHROPIC_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * Convertit une part Gemini `inlineData` (base64) en content block Anthropic.
 * Images → block image ; PDF → block document ; CSV → document texte
 * (décodé) ; autres types (xls/xlsx…) → note texte pour que le modèle
 * puisse le signaler à l'utilisateur au lieu d'ignorer silencieusement.
 */
function inlineDataToBlock(inlineData) {
  const { mimeType, data } = inlineData || {}
  if (!mimeType || !data) return null
  if (ANTHROPIC_IMAGE_MIMES.has(mimeType)) {
    return { type: 'image', source: { type: 'base64', media_type: mimeType, data } }
  }
  if (mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  }
  if (mimeType === 'text/csv') {
    let decoded = ''
    try {
      decoded = Buffer.from(data, 'base64').toString('utf8')
    } catch {
      return null
    }
    return { type: 'document', source: { type: 'text', media_type: 'text/plain', data: decoded } }
  }
  // Type non supporté par Anthropic (ex: xlsx binaire) — on informe le modèle.
  return {
    type: 'text',
    text: `[Attached file of type ${mimeType} could not be included in this mode — tell the user to convert it to CSV or PDF.]`,
  }
}

/**
 * Convertit l'historique format Gemini en format Anthropic.
 * Gère :
 *   - role: 'user'|'model' → 'user'|'assistant'
 *   - parts texte
 *   - parts inlineData (fichiers joints) → blocks image/document
 *   - parts functionCall → content blocks tool_use (pour rejouer un tour précédent)
 *   - parts functionResponse → content blocks tool_result (idem)
 */
function toAnthropicMessages(geminiContents) {
  const out = []
  for (const c of geminiContents) {
    if (c.role !== 'user' && c.role !== 'model') continue
    const role = c.role === 'model' ? 'assistant' : 'user'
    const blocks = []
    for (const p of c.parts || []) {
      if (typeof p.text === 'string' && p.text) {
        blocks.push({ type: 'text', text: p.text })
      } else if (p.inlineData) {
        const block = inlineDataToBlock(p.inlineData)
        if (block) blocks.push(block)
      } else if (p.functionCall) {
        // Tour précédent où le model a demandé un tool — on le rejoue en
        // tant que tool_use block côté assistant.
        blocks.push({
          type: 'tool_use',
          id: `call_${p.functionCall.name}_${out.length}`,
          name: p.functionCall.name,
          input: p.functionCall.args || {},
        })
      } else if (p.functionResponse) {
        // Tour précédent où le serveur a renvoyé un résultat — en
        // Anthropic, c'est un message role=user avec un tool_result block.
        blocks.push({
          type: 'tool_result',
          tool_use_id: `call_${p.functionResponse.name}_${out.length - 1}`,
          content: JSON.stringify(p.functionResponse.response?.result ?? {}),
        })
      }
    }
    // Anthropic refuse les content vides — on met un texte minimal au pire.
    out.push({ role, content: blocks.length ? blocks : [{ type: 'text', text: ' ' }] })
  }
  return out
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
 * @param {Array}  [params.tools]      - tool declarations format Gemini (converties)
 * @param {number} [params.temperature=0.4]
 * @param {(delta: string) => void} [params.onDelta]
 * @returns {Promise<{ text, modelName, functionCalls, candidate, usage }>}
 */
async function generateStream({
  systemPrompt,
  userMessage,
  contents,
  tools,
  // Accepté pour compat avec le contrat Gemini mais JAMAIS envoyé :
  // Sonnet 5 rejette les paramètres de sampling non-défaut (400).
  // eslint-disable-next-line no-unused-vars
  temperature,
  onDelta,
}) {
  ensureConfigured()
  const client = getAnthropic()
  const model = process.env.AI_SMART_MODEL || SMART_MODEL

  const messages = contents
    ? toAnthropicMessages(contents)
    : [{ role: 'user', content: userMessage || ' ' }]

  // max_tokens couvre thinking adaptatif + texte + tool calls sur Sonnet 5.
  // Prompt caching : le breakpoint sur le system (rendu APRÈS les tools)
  // cache tools + system ensemble — gros gain sur la boucle multi-tours du
  // mode approfondi (le même préfixe est renvoyé à chaque round).
  const requestBody = {
    model,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages,
    max_tokens: 8192,
  }
  const anthropicTools = toAnthropicTools(tools)
  if (anthropicTools) requestBody.tools = anthropicTools

  const t0 = Date.now()
  let text = ''
  let inputTokens = 0
  let outputTokens = 0
  // Reconstruction des tool_use blocks au fil du stream — Anthropic émet
  // input_json_delta pour streamer les arguments JSON par morceaux.
  const toolUses = new Map() // index → { id, name, inputBuffer: string }
  const finalContentBlocks = [] // ordre de sortie pour candidate.content.parts

  let stream
  try {
    stream = await client.messages.stream(requestBody)
  } catch (err) {
    throw classifyAnthropicError(err)
  }

  try {
    for await (const event of stream) {
      if (event.type === 'message_start' && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens || 0
      } else if (event.type === 'content_block_start') {
        const block = event.content_block
        if (block?.type === 'text') {
          finalContentBlocks.push({ type: 'text', text: '' })
        } else if (block?.type === 'tool_use') {
          toolUses.set(event.index, {
            id: block.id,
            name: block.name,
            inputBuffer: '',
          })
          finalContentBlocks.push({ type: 'tool_use', id: block.id, name: block.name, input: {} })
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          const delta = event.delta.text || ''
          if (delta) {
            text += delta
            const last = finalContentBlocks[finalContentBlocks.length - 1]
            if (last?.type === 'text') last.text += delta
            if (typeof onDelta === 'function') onDelta(delta)
          }
        } else if (event.delta?.type === 'input_json_delta') {
          // Arguments JSON du tool, streamés caractère par caractère.
          const tu = toolUses.get(event.index)
          if (tu) tu.inputBuffer += event.delta.partial_json || ''
        }
      } else if (event.type === 'content_block_stop') {
        // À la fin d'un block tool_use, on parse son input JSON accumulé.
        const tu = toolUses.get(event.index)
        if (tu) {
          let parsed = {}
          try {
            parsed = tu.inputBuffer ? JSON.parse(tu.inputBuffer) : {}
          } catch {
            parsed = {}
          }
          // Met à jour le block correspondant pour exposer les args.
          for (const b of finalContentBlocks) {
            if (b.type === 'tool_use' && b.id === tu.id) b.input = parsed
          }
        }
      } else if (event.type === 'message_delta' && event.usage) {
        if (event.usage.output_tokens) outputTokens = event.usage.output_tokens
      }
    }
  } catch (err) {
    // Erreur en cours de stream (rare — souvent c'est une coupure réseau).
    throw classifyAnthropicError(err)
  }

  // Construit le contrat `functionCalls` compatible Gemini : la couche
  // chat.service.askStream les exécute via chatTools.execute().
  const functionCalls = finalContentBlocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ name: b.name, args: b.input || {} }))

  // Mime un `candidate.content.parts` à la Gemini pour que
  // chat.service.askStream puisse l'inscrire dans l'historique du prochain
  // tour (re-conversion via toAnthropicMessages).
  const candidate = {
    content: {
      parts: finalContentBlocks
        .map((b) => {
          if (b.type === 'text') return { text: b.text }
          if (b.type === 'tool_use') return { functionCall: { name: b.name, args: b.input } }
          return null
        })
        .filter(Boolean),
    },
  }

  return {
    text,
    modelName: model,
    functionCalls,
    candidate,
    usage: {
      inputTokens,
      outputTokens,
      durationMs: Date.now() - t0,
      model,
    },
  }
}

/**
 * Sortie structurée Claude — même contrat que gemini.generateStructured :
 * renvoie `{ json, usage }` validé contre le responseSchema fourni (JSON
 * Schema minuscules). Implémentation : tool unique forcé via tool_choice —
 * le modèle DOIT appeler le tool, dont l'input est notre objet structuré.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userMessage
 * @param {object} params.responseSchema  - JSON Schema (type object)
 * @param {number} [params.maxOutputTokens=1024]
 * @returns {Promise<{ json: object|null, usage: { inputTokens, outputTokens, model } }>}
 */
async function generateStructured({
  systemPrompt,
  userMessage,
  responseSchema,
  // Ignoré volontairement (compat contrat Gemini) — Sonnet 5 rejette les
  // paramètres de sampling non-défaut.
  // eslint-disable-next-line no-unused-vars
  temperature,
  maxOutputTokens = 1024,
}) {
  ensureConfigured()
  const client = getAnthropic()
  const model = process.env.AI_SMART_MODEL || SMART_MODEL

  try {
    const res = await client.messages.create({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      // Marge pour le thinking adaptatif (compté dans max_tokens sur Sonnet 5).
      max_tokens: Math.max(maxOutputTokens, 512) + 2048,
      tools: [
        {
          name: 'emit_structured_output',
          description: 'Emit the final structured answer. Always call this tool exactly once.',
          input_schema: normalizeSchema(responseSchema),
        },
      ],
      tool_choice: { type: 'tool', name: 'emit_structured_output' },
    })
    const toolUse = (res.content || []).find((b) => b.type === 'tool_use')
    return {
      json: toolUse?.input ?? null,
      usage: {
        inputTokens: res.usage?.input_tokens || 0,
        outputTokens: res.usage?.output_tokens || 0,
        model,
      },
    }
  } catch (err) {
    throw classifyAnthropicError(err)
  }
}

module.exports = {
  generateStream,
  generateStructured,
  ClaudeNotConfiguredError,
  ClaudeCreditDepletedError,
}
