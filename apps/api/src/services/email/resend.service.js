// Wrapper Resend pour les emails transactionnels.
//
// Pourquoi un wrapper plutôt que d'utiliser le SDK directement :
//   - Centralise la lecture des env (RESEND_API_KEY, EMAIL_FROM)
//   - Best-effort par défaut : log les erreurs mais ne fait pas planter le caller
//   - Permettra de stubber facilement dans les tests
//
// Source : docs/19_SERVICE_EMAIL_RESEND.md

const { Resend } = require('resend')
const { logger } = require('../../lib/logger')

let client = null

function getClient() {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      const err = new Error('RESEND_API_KEY missing — configure it in the env')
      err.code = 'RESEND_NOT_CONFIGURED'
      err.statusCode = 503
      throw err
    }
    client = new Resend(apiKey)
  }
  return client
}

function getFromAddress() {
  return process.env.EMAIL_FROM || 'SmartAnalyst <hello@smartanalyst.io>'
}

/**
 * Envoie un email transactionnel via Resend.
 *
 * Comportement best-effort : si l'API Resend renvoie une erreur ou si
 * RESEND_API_KEY n'est pas configurée, on log un warn et on renvoie
 * { ok: false, error }. Le caller décide s'il considère ça bloquant.
 *
 * @param {object} params
 * @param {string} params.to       - destinataire (single)
 * @param {string} params.subject  - sujet
 * @param {string} params.html     - HTML body
 * @param {string} [params.text]   - text fallback (recommended pour deliverability)
 * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const c = getClient()
    const result = await c.emails.send({
      from: getFromAddress(),
      to: [to],
      subject,
      html,
      text,
    })
    if (result.error) {
      logger.warn(
        { event: 'email_send_failed', to, subject, error: result.error.message },
        'Resend returned an error',
      )
      return { ok: false, error: result.error.message }
    }
    logger.info(
      { event: 'email_sent', to, subject, id: result.data?.id },
      `Email sent: ${subject}`,
    )
    return { ok: true, id: result.data?.id }
  } catch (err) {
    // Inclut le cas RESEND_NOT_CONFIGURED (en dev local sans clé)
    logger.error(
      { event: 'email_send_error', to, subject, error: err.message, code: err.code },
      'Email send failed',
    )
    return { ok: false, error: err.message }
  }
}

module.exports = { sendEmail, getClient, getFromAddress }
