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
  generateStructured,
}
