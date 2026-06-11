// Beta waitlist business logic.
//
// Table : waitlist_signups (migration 017)
// Email confirmation via Resend (best-effort — n'échoue pas le caller).
//
// Flow type :
//   1. User remplit le form marketing → POST /api/v1/waitlist
//   2. addSignup() upsert dans la DB + envoie email de confirmation
//   3. Plus tard, admin via GET /admin/waitlist regarde la liste
//   4. Quand on est prêt à inviter, on update status='invited' manuellement
//      (pas d'auto-invite pour MVP — on garde le contrôle)

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError } = require('../../lib/error-handler')
const { sendEmail } = require('../email/resend.service')

/**
 * Inscrit un email à la waitlist. Idempotent : si l'email existe déjà,
 * met à jour les champs (utile si un user repasse pour préciser son cas d'usage).
 *
 * @param {object} params
 * @param {string} params.email     - obligatoire, normalisé en lowercase
 * @param {string} [params.name]
 * @param {string} [params.company]
 * @param {string} [params.useCase] - description libre du besoin
 * @param {string} [params.source]  - default 'marketing_site' (analytics)
 * @returns {Promise<{ id: string, email: string, isNew: boolean }>}
 */
async function addSignup({ email, name, company, useCase, source }) {
  const service = getServiceRoleClient()
  const normalizedEmail = email.toLowerCase()

  // Check si déjà inscrit (pour savoir si c'est un new ou un update).
  const { data: existing } = await service
    .from('waitlist_signups')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  const { data, error } = await service
    .from('waitlist_signups')
    .upsert(
      {
        email: normalizedEmail,
        name: name || null,
        company: company || null,
        use_case: useCase || null,
        source: source || 'marketing_site',
      },
      { onConflict: 'email' },
    )
    .select()
    .single()

  if (error) {
    logger.error(
      { event: 'waitlist_signup_failed', email: normalizedEmail, error: error.message },
      'Waitlist insert failed',
    )
    throw new UserFacingError(
      "Impossible d'enregistrer ton inscription. Réessaie dans quelques instants.",
      { statusCode: 500, code: 'WAITLIST_INSERT_FAILED' },
    )
  }

  const isNew = !existing
  logger.info(
    {
      event: 'waitlist_signup',
      email: normalizedEmail,
      company: company || null,
      source: source || 'marketing_site',
      isNew,
    },
    isNew ? 'New waitlist signup' : 'Waitlist signup updated',
  )

  // Email confirmation — uniquement pour les NEW signups (évite spam si
  // un user revient mettre à jour son cas d'usage 3 fois).
  if (isNew) {
    const confirmation = await sendConfirmationEmail({ to: normalizedEmail, name })
    if (!confirmation.ok) {
      logger.warn(
        { event: 'waitlist_confirm_email_failed', email: normalizedEmail, error: confirmation.error },
        'Confirmation email failed (non-fatal)',
      )
    }
  }

  return { id: data.id, email: data.email, isNew }
}

/**
 * Construit + envoie l'email de confirmation.
 * Exporté pour pouvoir tester en isolation.
 */
async function sendConfirmationEmail({ to, name }) {
  const greeting = name ? `Salut ${name}` : 'Salut'
  const subject = 'Tu es sur la waitlist SmartAnalyst 🎉'

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;padding:32px 24px;color:#1a1a1a;">
    <h1 style="font-size:22px;margin:0 0 16px;color:#0f172a;">${greeting},</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      Merci d'avoir rejoint la waitlist <strong>SmartAnalyst</strong> 🚀
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      On finalise l'app et on te recontacte avec un accès dès qu'on accueille
      les premiers utilisateurs. Tu auras un coup d'avance sur tes KPIs marketing
      (Google Ads, Meta Ads, Stripe, GA4, Search Console…).
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
      En attendant, si tu as des questions ou un cas d'usage spécifique,
      réponds simplement à cet email — on lit tout.
    </p>
    <p style="font-size:13px;color:#64748b;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:16px;">
      — L'équipe SmartAnalyst<br />
      <a href="https://smartanalyst.io" style="color:#2563eb;text-decoration:none;">smartanalyst.io</a>
    </p>
  </div>
</body>
</html>`

  const text = [
    `${greeting},`,
    '',
    'Merci d\'avoir rejoint la waitlist SmartAnalyst.',
    '',
    'On finalise l\'app et on te recontacte avec un accès dès qu\'on est prêt',
    'à accueillir les premiers utilisateurs.',
    '',
    'En attendant, si tu as des questions ou un cas d\'usage spécifique,',
    'réponds simplement à cet email.',
    '',
    '— L\'équipe SmartAnalyst',
    'https://smartanalyst.io',
  ].join('\n')

  return sendEmail({ to, subject, html, text })
}

/**
 * Liste les inscriptions (endpoint admin).
 * @param {object} [opts]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.status]  - filtre 'pending' | 'invited' | 'converted' | 'declined'
 */
async function listSignups({ limit = 100, offset = 0, status = null } = {}) {
  const service = getServiceRoleClient()
  let q = service
    .from('waitlist_signups')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (status) q = q.eq('status', status)

  const { data, count, error } = await q
  if (error) {
    throw new Error(`waitlist_list_failed: ${error.message}`)
  }
  return { signups: data || [], total: count ?? null, limit, offset }
}

module.exports = { addSignup, listSignups, sendConfirmationEmail }
