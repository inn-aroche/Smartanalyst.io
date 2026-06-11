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
 * @param {string} params.systemPrompt - System instructions for the model
 * @param {string} params.userMessage  - The user's message
 * @param {number} [params.temperature=0.4]
 * @returns {Promise<{ text: string, modelName: string }>}
 */
async function generateOnce({ systemPrompt, userMessage, temperature = 0.4 }) {
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const model = getModel(modelName)
  const result = await model.generateContent({
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: 1500,
    },
  })
  const response = result.response
  const text = response.text()
  return { text, modelName }
}

module.exports = {
  getModel,
  generateOnce,
}
