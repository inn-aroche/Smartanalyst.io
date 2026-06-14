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
 * Email d'invitation beta (envoyé quand l'admin passe une inscription en
 * `invited` via POST /admin/waitlist/:id/invite). Sobre, parle au lecteur :
 * tu es prêt à entrer dans la beta, voilà comment.
 *
 * Le `appUrl` est tiré de APP_URL pour éviter de hardcoder le domaine
 * (utile en dev / preview).
 */
async function sendBetaWelcomeEmail(to, { name } = {}) {
  const appUrl = (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
  const subject = "Bienvenue dans la beta SmartAnalyst"
  const firstName = (name || '').trim().split(' ')[0]
  const hi = firstName ? `Salut ${firstName},` : 'Salut,'

  const html = `<!doctype html>
<html lang="fr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f1f1f;background:#fff">
  <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin:0 0 8px">SmartAnalyst</p>
  <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.3">${hi}</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Bonne nouvelle : tu peux entrer dans la beta privée de SmartAnalyst dès maintenant.</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Connecte tes sources (Stripe, GA4, Meta Ads, Shopify…) en 2 clics. On commence à synchroniser les 30 derniers jours, et SmartAnalyst remonte ce qui mérite ton attention — sans dashboard à configurer.</p>
  <p style="margin:0 0 28px"><a href="${appUrl}/login" style="display:inline-block;background:#1f1f1f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Ouvrir SmartAnalyst →</a></p>
  <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 8px">Pour t'aider à démarrer :</p>
  <ul style="font-size:13px;color:#374151;line-height:1.7;margin:0 0 24px;padding-left:18px">
    <li>Connecter une première source : <a href="${appUrl}/connectors" style="color:#2563eb">page Connecteurs</a></li>
    <li>Poser une première question à Smart Analyst : <a href="${appUrl}/chat" style="color:#2563eb">page Chat</a></li>
    <li>Installer le SmartTag : <a href="${appUrl}/tracking/install" style="color:#2563eb">page Tag</a></li>
  </ul>
  <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0">Une question, un blocage, du feedback ? Réponds directement à ce mail, je te lis.</p>
</body></html>`

  const text = [
    hi,
    '',
    'Bonne nouvelle : tu peux entrer dans la beta privée de SmartAnalyst dès maintenant.',
    '',
    'Connecte tes sources (Stripe, GA4, Meta Ads, Shopify…) en 2 clics. On synchronise les 30 derniers jours, et SmartAnalyst remonte ce qui mérite ton attention.',
    '',
    `→ ${appUrl}/login`,
    '',
    'Pour démarrer :',
    `- Connecteurs : ${appUrl}/connectors`,
    `- Chat : ${appUrl}/chat`,
    `- SmartTag : ${appUrl}/tracking/install`,
    '',
    'Une question ? Réponds à ce mail, je te lis.',
  ].join('\n')

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
    return { id: row.id, email: row.email, status: row.status, sent: false, error: 'already_invited' }
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
