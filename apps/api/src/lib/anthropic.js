// Anthropic SDK client.
// Deux modèles configurables: FAST (Haiku) pour les tâches volumineuses/légères,
// SMART (Sonnet 5) pour les analyses complexes (insights, chat, rapports).
// Attention Sonnet 5 : rejette temperature/top_p/top_k non-défaut (400) et
// le thinking adaptatif est actif par défaut (compte dans max_tokens).
// Source: docs/01_CONVENTIONS_GLOBALES.md §4.1, docs/16_SERVICE_IA_INSIGHTS.md

const Anthropic = require('@anthropic-ai/sdk')

const FAST_MODEL = process.env.AI_FAST_MODEL || 'claude-haiku-4-5-20251001'
const SMART_MODEL = process.env.AI_SMART_MODEL || 'claude-sonnet-5'

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
