// Anthropic SDK client.
// Deux modèles configurables: FAST (Haiku) pour les tâches volumineuses/légères,
// SMART (Sonnet) pour les analyses complexes (insights, chat).
// Source: docs/01_CONVENTIONS_GLOBALES.md §4.1, docs/16_SERVICE_IA_INSIGHTS.md

const Anthropic = require('@anthropic-ai/sdk')

const FAST_MODEL = process.env.AI_FAST_MODEL || 'claude-haiku-4-5-20251001'
const SMART_MODEL = process.env.AI_SMART_MODEL || 'claude-sonnet-4-6'

let client = null

function getAnthropic() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return client
}

module.exports = {
  getAnthropic,
  FAST_MODEL,
  SMART_MODEL,
}
