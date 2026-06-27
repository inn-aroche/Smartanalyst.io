// Résumé hebdomadaire + alertes critiques par email (brief V2 §3.3).
//
// "La veille qui prévient AVANT qu'on demande — c'est elle qui ramène
// l'utilisateur." Réutilise l'insight engine (insights déjà générés) + Resend.

const { sendEmail } = require('../email/resend.service')
const emailTemplate = require('../email/email-template.service')
const { logger } = require('../../lib/logger')
const insightsService = require('../insights/insights.service')
const notificationCenter = require('./notification-center.service')
const { getWorkspaceRecipient } = require('./recipient')
const settingsService = require('./settings.service')

const SEVERITY_ICON = { critical: '🔴', high: '🔴', medium: '🟡', low: '🔵' }
const escapeHtml = emailTemplate.escapeHtml

function appUrl() {
  return (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
}

/**
 * Compose le digest hebdo à partir d'insights ouverts.
 * @returns {{ subject, html, text } | null} null si rien à dire.
 */
function composeWeeklyDigest(insights, { orgName } = {}) {
  if (!insights || insights.length === 0) return null
  const top = insights.slice(0, 5)
  const hello = orgName ? `Bonjour ${orgName},` : 'Bonjour,'
  const subject = `Ton brief de la semaine — ${top.length} point${top.length > 1 ? 's' : ''} à voir`

  const items = top
    .map((i) => {
      const icon = SEVERITY_ICON[i.severity] || '🔵'
      return `<tr><td style="padding:0 0 14px 0">
        <div style="font-size:14.5px;font-weight:600;color:#14142A;line-height:1.4">${icon} ${escapeHtml(i.title)}</div>
        <div style="font-size:13px;color:#5C5C78;line-height:1.55;margin-top:3px">${escapeHtml(i.summary)}</div>
      </td></tr>`
    })
    .join('')

  const body = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 12px 0">${items}</table>`

  const { html, text } = emailTemplate.renderEmail({
    preview: `${top.length} point${top.length > 1 ? 's' : ''} à voir cette semaine.`,
    title: hello,
    intro: 'Voici ce qui mérite ton attention cette semaine.',
    body,
    cta: { label: 'Ouvrir SmartAnalyst', href: `${appUrl()}/veille` },
    footer:
      'Tu reçois ce mail car la veille hebdo est active. Tu peux la régler dans Réglages → Notifications.',
  })

  return { subject, html, text }
}

/**
 * Compose une alerte critique unitaire.
 */
function composeCriticalAlert(insight, { orgName } = {}) {
  const hello = orgName ? `Bonjour ${orgName},` : 'Bonjour,'
  const subject = `🔴 Alerte : ${insight.title}`
  const body = `<div style="border-left:3px solid #E0495C;background:#FDF3F5;padding:14px 16px;border-radius:8px;margin:0 0 12px 0">
    <div style="font-size:11px;font-weight:600;color:#E0495C;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 6px 0">Alerte critique</div>
    <div style="font-size:16px;font-weight:700;color:#14142A;line-height:1.4">${escapeHtml(insight.title)}</div>
    <p style="margin:8px 0 0 0;font-size:14px;line-height:1.55;color:#5C5C78">${escapeHtml(insight.summary)}</p>
  </div>`
  const { html, text } = emailTemplate.renderEmail({
    preview: insight.title,
    title: hello,
    body,
    cta: { label: 'Voir le détail', href: `${appUrl()}/veille` },
    footer:
      'Tu reçois ce mail car les alertes critiques sont activées. Tu peux les régler dans Réglages → Notifications.',
  })
  return { subject, html, text }
}

/**
 * Envoie le digest hebdo d'un workspace. No-op si pas d'insight / pas de
 * destinataire. Best-effort.
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
async function sendWeeklyDigest(workspaceId) {
  const settings = await settingsService.getSettings(workspaceId)
  if (!settings.weekly_digest) return { sent: false, reason: 'disabled' }

  const recipient = await getWorkspaceRecipient(workspaceId)
  if (!recipient) return { sent: false, reason: 'no_recipient' }

  const insights = await insightsService.listInsights(workspaceId, { status: 'open', limit: 5 })
  const composed = composeWeeklyDigest(insights, { orgName: recipient.orgName })
  if (!composed) return { sent: false, reason: 'no_insights' }

  const result = await sendEmail({ to: recipient.email, ...composed })
  if (!result.ok) {
    logger.warn(
      { event: 'weekly_digest_send_failed', workspaceId, error: result.error },
      'Weekly digest send failed',
    )
    return { sent: false, reason: 'email_failed' }
  }
  logger.info({ event: 'weekly_digest_sent', workspaceId }, 'Weekly digest sent')
  // Notifie aussi dans l'app pour que le badge cloche se mette à jour.
  await notificationCenter.createNotification({
    workspaceId,
    type: 'digest_ready',
    title: composed.subject,
    body: `${insights.length} point${insights.length > 1 ? 's' : ''} à voir cette semaine.`,
    link: '/veille',
    severity: 'info',
  })
  return { sent: true }
}

/**
 * Envoie une alerte critique pour un insight. Appelé par l'insight engine
 * quand un insight critical est nouvellement créé. Best-effort.
 */
async function sendCriticalAlert(workspaceId, insight) {
  const settings = await settingsService.getSettings(workspaceId)
  if (!settings.critical_alerts) return { sent: false, reason: 'disabled' }

  const recipient = await getWorkspaceRecipient(workspaceId)
  if (!recipient) return { sent: false, reason: 'no_recipient' }
  const composed = composeCriticalAlert(insight, { orgName: recipient.orgName })
  const result = await sendEmail({ to: recipient.email, ...composed })
  if (!result.ok) {
    logger.warn(
      { event: 'critical_alert_send_failed', workspaceId, error: result.error },
      'Critical alert send failed',
    )
    return { sent: false, reason: 'email_failed' }
  }
  logger.info(
    { event: 'critical_alert_sent', workspaceId, title: insight.title },
    'Critical alert sent',
  )
  return { sent: true }
}

/**
 * Notifie le destinataire d'un workspace qu'un nouveau rapport est dispo.
 * Best-effort : pas de throw, on log et on continue côté caller.
 */
function composeReportReady(report, { orgName } = {}) {
  const hello = orgName ? `Bonjour ${orgName},` : 'Bonjour,'
  const url = `${appUrl()}/rapports`
  const subject = `Ton rapport — ${report.title}`
  const body = `<p style="margin:0;font-size:14.5px;line-height:1.6;color:#5C5C78">Le rapport <strong style="color:#14142A">${escapeHtml(report.title)}</strong> est prêt. Tu peux le consulter en ligne ou l'imprimer en PDF en un clic.</p>`
  const { html, text } = emailTemplate.renderEmail({
    preview: `Le rapport "${report.title}" est prêt.`,
    title: hello,
    body,
    cta: { label: 'Voir mon rapport', href: url },
    footer:
      'Tu reçois ce mail car la génération automatique de rapports est active sur ton workspace.',
  })
  return { subject, html, text }
}

async function sendReportReady(workspaceId, report) {
  const recipient = await getWorkspaceRecipient(workspaceId)
  if (!recipient) return { sent: false, reason: 'no_recipient' }
  const composed = composeReportReady(report, { orgName: recipient.orgName })
  const result = await sendEmail({ to: recipient.email, ...composed })
  if (!result.ok) {
    logger.warn(
      { event: 'report_ready_send_failed', workspaceId, error: result.error },
      'Report ready email failed',
    )
    return { sent: false, reason: 'email_failed' }
  }
  logger.info(
    { event: 'report_ready_sent', workspaceId, reportId: report.id },
    'Report ready email sent',
  )
  return { sent: true }
}

module.exports = {
  composeWeeklyDigest,
  composeCriticalAlert,
  composeReportReady,
  sendWeeklyDigest,
  sendCriticalAlert,
  sendReportReady,
}
