// Chat business logic. Takes a user message, asks Gemini for an answer,
// records an audit log (best-effort), returns the text.
//
// Next iteration will pull canonical_metrics for the caller's workspace and
// inject them as context — for now the model only has the system prompt.

const { generateOnce } = require('./gemini.service')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')

const SYSTEM_PROMPT_FR = `Tu es SmartAnalyst, un analyste marketing IA pour PME et agences.
Tu réponds en français, de manière structurée et concise.
Format de réponse :
- Une phrase de TL;DR au début
- 2-3 points clés en bullets si pertinent
- Suggestion d'action concrète à la fin si la question le permet

Si la question demande des chiffres spécifiques (CTR, MRR, CAC…) et que tu n'as pas accès aux données du user, dis-le clairement et propose-lui de connecter les sources concernées (GA4, Meta Ads, Google Ads, Stripe, Search Console).

Reste honnête : si tu n'as pas l'info, dis-le. Ne fabrique pas de chiffres.`

const SYSTEM_PROMPT_EN = `You are SmartAnalyst, an AI marketing analyst for SMBs and agencies.
You answer in English, in a structured and concise manner.
Response format:
- One-sentence TL;DR at the top
- 2-3 key bullets if relevant
- A concrete next-action suggestion at the end if the question allows for one

If the question asks for specific numbers (CTR, MRR, CAC…) and you don't have access to the user's data, say so clearly and suggest they connect the relevant sources (GA4, Meta Ads, Google Ads, Stripe, Search Console).

Be honest: if you don't know, say so. Don't make up numbers.`

function pickSystemPrompt(locale) {
  return locale === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_FR
}

/**
 * Ask SmartAnalyst a question.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.workspaceId
 * @param {string} params.message
 * @param {string} [params.locale='fr']
 * @returns {Promise<{ answer: string, model: string }>}
 */
async function ask({ userId, workspaceId, message, locale = 'fr' }) {
  const systemPrompt = pickSystemPrompt(locale)
  const t0 = Date.now()
  const { text, modelName } = await generateOnce({
    systemPrompt,
    userMessage: message,
    temperature: 0.4,
  })
  const durationMs = Date.now() - t0

  logger.info(
    { event: 'chat_answered', userId, workspaceId, model: modelName, durationMs, msgLen: message.length },
    'Chat answered',
  )

  // Best-effort audit log. We never block the response on the audit write.
  const service = getServiceRoleClient()
  service
    .from('audit_logs')
    .insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      action: 'chat_ask',
      changes: { message_length: message.length, model: modelName, duration_ms: durationMs },
    })
    .then(({ error }) => {
      if (error) logger.warn({ event: 'chat_audit_failed', error: error.message })
    })

  return { answer: text, model: modelName }
}

module.exports = { ask }
