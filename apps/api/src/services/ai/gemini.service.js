// Google Gemini SDK wrapper. Reads config from env so callers don't have
// to care about model selection or API-key plumbing.
//
// Default model — `gemini-2.5-flash` est le sweet spot prix/perf pour un chat
// marketing (rapide, capable, ~$0.30/M tokens). Surchargeable par env
// GEMINI_MODEL si besoin de bascule (2.5-pro pour analyses profondes,
// 2.5-flash-lite pour quick replies).
//
// IMPORTANT : ne jamais hardcoder un modèle expérimental (suffixe `-exp`)
// en default. Google les retire sans préavis — vécu en juin 2026 avec
// `gemini-2.0-flash-exp` qui a planté tout le chat IA en prod (404 not
// found côté Gemini API).

const DEFAULT_MODEL = 'gemini-2.5-flash'

const { GoogleGenerativeAI } = require('@google/generative-ai')

let client = null
function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey || apiKey.startsWith('AIza<') || apiKey === '') {
      const err = new Error('GEMINI_API_KEY missing or placeholder. Configure it in the env.')
      err.code = 'GEMINI_NOT_CONFIGURED'
      err.statusCode = 503
      throw err
    }
    client = new GoogleGenerativeAI(apiKey)
  }
  return client
}

function getModel(name) {
  const modelName = name || process.env.GEMINI_MODEL || DEFAULT_MODEL
  return getClient().getGenerativeModel({ model: modelName })
}

/**
 * Send a single message and return the text response.
 * Higher-level "conversation" semantics live in chat.service.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} [params.userMessage]    - Le message texte (omis si `contents` fourni)
 * @param {Array}  [params.contents]       - Override : historique de messages au format Gemini (role/parts)
 * @param {Array}  [params.tools]          - Function declarations (function calling, brief V2 §3.5)
 * @param {Array}  [params.attachments]    - Multimodal inline parts (image/PDF)
 * @param {number} [params.temperature=0.4]
 * @returns {Promise<{ text: string, modelName: string, functionCalls: Array, candidate: object }>}
 *   `functionCalls` est non-vide si le model demande à appeler des tools.
 */
async function generateOnce({
  systemPrompt,
  userMessage,
  contents,
  tools,
  temperature = 0.4,
  attachments = [],
}) {
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const model = getModel(modelName)

  let payloadContents = contents
  if (!payloadContents) {
    // Multimodal (brief V2 §3.2) : pièces jointes en inlineData parts.
    const parts = [{ text: userMessage }]
    for (const att of attachments) {
      if (att && att.data && att.mimeType) {
        parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } })
      }
    }
    payloadContents = [{ role: 'user', parts }]
  }

  const requestBody = {
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents: payloadContents,
    generationConfig: {
      temperature,
      maxOutputTokens: 1500,
    },
  }
  if (Array.isArray(tools) && tools.length > 0) {
    requestBody.tools = [{ functionDeclarations: tools }]
  }

  const t0 = Date.now()
  const result = await model.generateContent(requestBody)
  const response = result.response
  const candidate = response.candidates?.[0] || null

  // Extrait les functionCalls éventuels (Gemini peut en émettre plusieurs en
  // parallèle dans le même tour).
  const functionCalls = []
  const candidateParts = candidate?.content?.parts || []
  for (const p of candidateParts) {
    if (p.functionCall) functionCalls.push(p.functionCall)
  }

  // Tracking d'usage : capture inputTokens/outputTokens depuis usageMetadata.
  // Best-effort logging — ne bloque jamais la réponse.
  // Le scope (workspaceId + requestType) est ajouté par l'appelant via
  // un wrapper si nécessaire (voir chat.service.js).
  const usage = response.usageMetadata || {}
  const usageInfo = {
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    durationMs: Date.now() - t0,
    model: modelName,
  }

  // `response.text()` lance si la réponse n'a que des function calls. On le
  // protège pour pouvoir retourner functionCalls sans crash.
  let text = ''
  try {
    text = response.text()
  } catch {
    text = ''
  }

  return { text, modelName, functionCalls, candidate, usage: usageInfo }
}

/**
 * Streaming variant of generateOnce. Yields incremental text deltas via
 * `onDelta(text)` and resolves with the full result (text + functionCalls +
 * usage). Cahier §3 Lot 1 — perception "moderne" du chat.
 *
 * On garde la même API que generateOnce pour les paramètres ; la seule
 * différence côté appelant est `onDelta` (fire-and-forget côté UI).
 *
 * Note function-calling : Gemini ne stream PAS les functionCalls (elles
 * arrivent dans la sortie finale). On collecte donc le buffer complet,
 * puis on yield les deltas texte au fur et à mesure, et on remonte les
 * functionCalls à la fin pour que la boucle tool-use continue.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} [params.userMessage]
 * @param {Array}  [params.contents]
 * @param {Array}  [params.tools]
 * @param {Array}  [params.attachments]
 * @param {number} [params.temperature=0.4]
 * @param {(delta: string) => void} [params.onDelta]
 * @returns {Promise<{ text: string, modelName: string, functionCalls: Array, candidate: object, usage: object }>}
 */
async function generateStream({
  systemPrompt,
  userMessage,
  contents,
  tools,
  temperature = 0.4,
  attachments = [],
  onDelta,
}) {
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const model = getModel(modelName)

  let payloadContents = contents
  if (!payloadContents) {
    const parts = [{ text: userMessage }]
    for (const att of attachments) {
      if (att && att.data && att.mimeType) {
        parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } })
      }
    }
    payloadContents = [{ role: 'user', parts }]
  }

  const requestBody = {
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents: payloadContents,
    generationConfig: {
      temperature,
      maxOutputTokens: 1500,
    },
  }
  if (Array.isArray(tools) && tools.length > 0) {
    requestBody.tools = [{ functionDeclarations: tools }]
  }

  const t0 = Date.now()
  const streamResult = await model.generateContentStream(requestBody)

  let text = ''
  // Itère les chunks au fur et à mesure ; chaque chunk peut contenir du
  // texte partiel (.text()) — on l'envoie au handler avant d'agréger.
  for await (const chunk of streamResult.stream) {
    let delta = ''
    try {
      delta = chunk.text() || ''
    } catch {
      delta = ''
    }
    if (delta) {
      text += delta
      if (typeof onDelta === 'function') onDelta(delta)
    }
  }

  const response = await streamResult.response
  const candidate = response.candidates?.[0] || null

  const functionCalls = []
  const candidateParts = candidate?.content?.parts || []
  for (const p of candidateParts) {
    if (p.functionCall) functionCalls.push(p.functionCall)
  }

  const usage = response.usageMetadata || {}
  const usageInfo = {
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    durationMs: Date.now() - t0,
    model: modelName,
  }

  // Quand le model n'a que des functionCalls, response.text() lance. On a déjà
  // agrégé `text` via les deltas, donc on n'a rien à faire — il sera "" si
  // aucun chunk texte n'est arrivé.
  return { text, modelName, functionCalls, candidate, usage: usageInfo }
}

/**
 * Génère une réponse JSON structurée (Structured Output).
 *
 * Force `responseMimeType: application/json` → Gemini renvoie du JSON valide
 * (pas de prose, pas de ```json fences). Le `responseSchema` optionnel
 * contraint encore le décodage côté Google. On parse + on laisse l'appelant
 * valider finement (cf insight-schema.js) — ceinture ET bretelles.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userMessage
 * @param {object} [params.responseSchema]   - Schema au format SDK Gemini (optionnel)
 * @param {number} [params.temperature=0.3]
 * @param {number} [params.maxOutputTokens=4096]
 * @returns {Promise<{ json: any, raw: string, modelName: string }>}
 * @throws si la réponse n'est pas du JSON parsable
 */
async function generateStructured({
  systemPrompt,
  userMessage,
  responseSchema,
  temperature = 0.3,
  maxOutputTokens = 4096,
}) {
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const model = getModel(modelName)

  const generationConfig = {
    temperature,
    maxOutputTokens,
    responseMimeType: 'application/json',
  }
  if (responseSchema) generationConfig.responseSchema = responseSchema

  const t0 = Date.now()
  const result = await model.generateContent({
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig,
  })
  const raw = result.response.text()
  const um = result.response.usageMetadata || {}
  const usage = {
    inputTokens: um.promptTokenCount || 0,
    outputTokens: um.candidatesTokenCount || 0,
    durationMs: Date.now() - t0,
    model: modelName,
  }

  let json
  try {
    json = JSON.parse(raw)
  } catch (err) {
    const e = new Error(`Gemini structured output is not valid JSON: ${err.message}`)
    e.code = 'STRUCTURED_OUTPUT_INVALID_JSON'
    e.raw = raw
    throw e
  }
  return { json, raw, modelName, usage }
}

module.exports = {
  getModel,
  generateOnce,
  generateStream,
  generateStructured,
}
