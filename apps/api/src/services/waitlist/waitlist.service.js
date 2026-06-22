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
const emailTemplate = require('../email/email-template.service')

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
        {
          event: 'waitlist_confirm_email_failed',
          email: normalizedEmail,
          error: confirmation.error,
        },
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
  const greeting = name ? `Salut ${name} 🎉` : 'Salut 🎉'
  const subject = 'Tu es sur la waitlist SmartAnalyst'

  const body = `<p style="margin:0;font-size:14.5px;line-height:1.6;color:#5C5C78">On finalise l'app et on te recontacte avec un accès dès qu'on accueille les premiers utilisateurs. Tu auras un coup d'avance sur tes KPIs marketing (Google Ads, Meta Ads, Stripe, GA4, Search Console…).</p>`

  const { html, text } = emailTemplate.renderEmail({
    preview: 'Merci d’avoir rejoint la waitlist.',
    title: greeting,
    intro: "Merci d'avoir rejoint la waitlist SmartAnalyst.",
    body,
    footer:
      "En attendant, si tu as des questions ou un cas d'usage spécifique, réponds simplement à cet email — on lit tout.",
  })

  return sendEmail({ to, subject, html, text })
}

/**
 * Email d'invitation beta (envoyé quand l'admin passe une inscription en
 * `invited` via POST /admin/waitlist/:id/invite). Sobre, parle au lecteur :
 * tu es prêt à entrer dans la beta, voilà comment.
 *
 * Le `appUrl` est tiré de APP_URL pour éviter de hardcoder le domaine
 * (utile en dev / preview).
 */
async function sendBetaWelcomeEmail(to, { name } = {}) {
  const appUrl = (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
  const subject = 'Bienvenue dans la beta SmartAnalyst'
  const firstName = (name || '').trim().split(' ')[0]
  const hi = firstName ? `Salut ${firstName} 👋` : 'Salut 👋'

  const body = `<p style="margin:0 0 16px 0;font-size:14.5px;line-height:1.6;color:#5C5C78">Connecte tes sources (GA4, Meta Ads, Google Ads, Stripe, Search Console…) en 2 clics. On synchronise les 30 derniers jours, et SmartAnalyst remonte ce qui mérite ton attention — sans dashboard à configurer.</p>
<div style="margin-top:24px;border-top:1px solid #E5E5EA;padding-top:18px">
  <p style="margin:0 0 10px 0;font-size:13px;color:#5C5C78;font-weight:600">Pour démarrer :</p>
  <ul style="margin:0;padding-left:18px;font-size:13.5px;color:#14142A;line-height:1.7">
    <li><a href="${appUrl}/connectors" style="color:#5C8FFF;text-decoration:none">Connecter une 1<sup>ère</sup> source</a></li>
    <li><a href="${appUrl}/chat" style="color:#5C8FFF;text-decoration:none">Poser ta 1<sup>ère</sup> question au chat</a></li>
    <li><a href="${appUrl}/tracking/install" style="color:#5C8FFF;text-decoration:none">Installer le SmartTag (1<sup>st</sup>-party tracking)</a></li>
  </ul>
</div>`

  const { html, text } = emailTemplate.renderEmail({
    preview: 'Tu peux entrer dans la beta dès maintenant.',
    title: hi,
    intro: 'Bonne nouvelle : tu peux entrer dans la beta privée de SmartAnalyst dès maintenant.',
    body,
    cta: { label: 'Ouvrir SmartAnalyst', href: `${appUrl}/login` },
    footer: 'Une question, un blocage, du feedback ? Réponds directement à ce mail, je te lis.',
  })

  return sendEmail({ to, subject, html, text })
}

/**
 * Marque une inscription en `invited`, envoie l'email de bienvenue, stamp
 * `notified_at`. Idempotent : si déjà `invited` ou `converted`, on ne
 * renvoie pas l'email (anti-spam).
 *
 * @returns {Promise<{ id, email, status, sent: boolean, error?: string }>}
 */
async function inviteSignup(id) {
  const service = getServiceRoleClient()
  const { data: row, error: loadErr } = await service
    .from('waitlist_signups')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) throw new Error(`waitlist_load_failed: ${loadErr.message}`)
  if (!row) {
    const err = new Error('Inscription introuvable.')
    err.statusCode = 404
    err.code = 'NOT_FOUND'
    throw err
  }
  if (row.status === 'invited' || row.status === 'converted') {
    return {
      id: row.id,
      email: row.email,
      status: row.status,
      sent: false,
      error: 'already_invited',
    }
  }

  const send = await sendBetaWelcomeEmail(row.email, { name: row.name })
  if (!send.ok) {
    // On garde la row en pending si le mail échoue → on pourra retry plus tard.
    return { id: row.id, email: row.email, status: row.status, sent: false, error: send.error }
  }

  const now = new Date().toISOString()
  const { error: updErr } = await service
    .from('waitlist_signups')
    .update({ status: 'invited', notified_at: now })
    .eq('id', id)
  if (updErr) {
    // L'email est parti mais le status n'a pas pu être mis à jour : c'est OK,
    // on retournera "already_invited" la prochaine fois grâce à notified_at
    // (mais ici le check porte sur status — limitation connue).
    logger.warn(
      { event: 'waitlist_invite_status_update_failed', id, error: updErr.message },
      'Invite email sent but status update failed',
    )
  }
  return { id: row.id, email: row.email, status: 'invited', sent: true }
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

module.exports = {
  addSignup,
  listSignups,
  inviteSignup,
  sendConfirmationEmail,
  sendBetaWelcomeEmail,
}
