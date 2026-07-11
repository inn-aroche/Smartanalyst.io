// Service d'alerte connecteur — notifie in-app + email quand un connecteur
// tombe en panne (expired/error) ou en échec silencieux.
//
// Pourquoi ce service existe : le type 'connector_health' était déjà
// whitelisté dans notification-center.service depuis le Lot 0/1, mais
// jamais instancié nulle part — le cron de santé (alerts.handler.js) se
// contentait d'un `logger.warn`. Résultat concret : un connecteur GA4 est
// resté en status='expired' pendant 12 jours en prod sans que personne ne
// soit prévenu (juillet 2026).
//
// Branché à 3 points d'ancrage :
//   - base.connector.js sync()            → échec de sync (auth ou autre)
//   - oauth-refresh.handler.js refreshOne → échec du refresh proactif
//   - alerts.handler.js checkConnectorsHealth → cron 4h, silent_failure
//
// Idempotence : au plus 1 notification/email par connecteur toutes les
// 24h. Volontairement PAS "une seule fois jamais" (un email raté ou classé
// spam laisserait le connecteur mort indéfiniment, exactement le problème
// qu'on corrige) — c'est un rappel quotidien tant que le connecteur reste
// cassé, qui s'arrête dès que le prochain sync réussit (updateStatus
// remet status='active' dans base.connector.js, plus rien à notifier).

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const notificationCenter = require('../notifications/notification-center.service')
const { sendEmail } = require('../email/resend.service')
const emailTemplate = require('../email/email-template.service')
const { getWorkspaceRecipient } = require('../notifications/recipient')

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000

const SOURCE_LABELS = {
  ga4: 'Google Analytics',
  meta_ads: 'Meta Ads',
  shopify: 'Shopify',
  stripe: 'Stripe',
  search_console: 'Search Console',
}

const EMAIL_STRINGS = {
  fr: {
    hello: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    subject: (label) => `⚠ ${label} a besoin d'être reconnecté`,
    kicker: 'Connecteur en panne',
    body: (label) =>
      `La connexion à <strong style="color:#14142A">${label}</strong> a expiré ou rencontre une erreur. Tes données ne se mettent plus à jour depuis cette source — reconnecte-la pour reprendre la veille.`,
    cta: 'Reconnecter',
    footer: 'Tu reçois ce mail car un connecteur de ton workspace est en panne.',
    inAppTitle: (label) => `${label} a besoin d'être reconnecté`,
    inAppBody: (label) =>
      `Les données de ${label} ne se mettent plus à jour. Reconnecte-le pour reprendre la veille.`,
  },
  en: {
    hello: (name) => (name ? `Hi ${name},` : 'Hi,'),
    subject: (label) => `⚠ ${label} needs to be reconnected`,
    kicker: 'Connector down',
    body: (label) =>
      `Your connection to <strong style="color:#14142A">${label}</strong> has expired or is erroring. Data from this source has stopped updating — reconnect it to resume monitoring.`,
    cta: 'Reconnect',
    footer: 'You receive this email because a connector on your workspace is down.',
    inAppTitle: (label) => `${label} needs to be reconnected`,
    inAppBody: (label) =>
      `Data from ${label} has stopped updating. Reconnect it to resume monitoring.`,
  },
}

function appUrl() {
  return (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source
}

/**
 * Notifie (in-app + email) qu'un connecteur est en panne. Best-effort
 * total : ne throw jamais — un échec de notification ne doit pas casser
 * le pipeline de sync/refresh qui l'a déclenché.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.connectorId
 * @param {string} params.source
 * @param {string} [params.reason] - status_reason (ex: 'INVALID_CREDENTIALS')
 * @returns {Promise<{ notified: boolean, reason?: string }>}
 */
async function notifyConnectorDown({ workspaceId, connectorId, source, reason }) {
  try {
    const supabase = getServiceRoleClient()
    const cutoff = new Date(Date.now() - REMINDER_WINDOW_MS).toISOString()
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('type', 'connector_health')
      .contains('meta', { connectorId })
      .gte('created_at', cutoff)
      .limit(1)
      .maybeSingle()
    if (existing) return { notified: false, reason: 'throttled' }

    const label = sourceLabel(source)
    const recipient = await getWorkspaceRecipient(workspaceId)
    const s = EMAIL_STRINGS[recipient?.locale === 'en' ? 'en' : 'fr']

    await notificationCenter.createNotification({
      workspaceId,
      type: 'connector_health',
      severity: 'warning',
      title: s.inAppTitle(label),
      body: s.inAppBody(label),
      link: '/sources',
      meta: { connectorId, source, reason: reason || null },
    })

    if (recipient) {
      const { html, text } = emailTemplate.renderEmail({
        preview: s.subject(label),
        title: s.hello(recipient.orgName),
        body: `<div style="border-left:3px solid #C2820E;background:#FFFBEB;padding:14px 16px;border-radius:8px;margin:0 0 12px 0">
          <div style="font-size:11px;font-weight:600;color:#C2820E;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 6px 0">${s.kicker}</div>
          <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C78">${s.body(label)}</p>
        </div>`,
        cta: { label: s.cta, href: `${appUrl()}/sources` },
        footer: s.footer,
      })
      const result = await sendEmail({ to: recipient.email, subject: s.subject(label), html, text })
      if (!result.ok) {
        logger.warn(
          { event: 'connector_alert_email_failed', workspaceId, connectorId, error: result.error },
          'Connector alert email failed',
        )
      }
    }

    logger.info(
      { event: 'connector_alert_sent', workspaceId, connectorId, source, reason },
      `Connector alert sent for ${source}`,
    )
    return { notified: true }
  } catch (err) {
    logger.warn(
      { event: 'connector_alert_failed', workspaceId, connectorId, error: err.message },
      'notifyConnectorDown failed',
    )
    return { notified: false, reason: 'error' }
  }
}

module.exports = { notifyConnectorDown, sourceLabel }
