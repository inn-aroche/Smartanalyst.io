// Google Gemini SDK wrapper. Reads config from env so callers don't have
// to care about model selection or API-key plumbing.

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
  const modelName = name || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
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
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
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
