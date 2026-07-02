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

// Strings des emails transactionnels — EN/FR (ADR-0003 « international dès
// J1 »). La locale vient du workspace (migration 042) via recipient.js.
const EMAIL_STRINGS = {
  fr: {
    hello: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    digestSubject: (n) => `Ton brief de la semaine — ${n} point${n > 1 ? 's' : ''} à voir`,
    digestPreview: (n) => `${n} point${n > 1 ? 's' : ''} à voir cette semaine.`,
    digestIntro: 'Voici ce qui mérite ton attention cette semaine.',
    digestCta: 'Ouvrir SmartAnalyst',
    digestFooter:
      'Tu reçois ce mail car la veille hebdo est active. Tu peux la régler dans Réglages → Notifications.',
    alertSubject: (title) => `🔴 Alerte : ${title}`,
    alertKicker: 'Alerte critique',
    alertCta: 'Voir le détail',
    alertFooter:
      'Tu reçois ce mail car les alertes critiques sont activées. Tu peux les régler dans Réglages → Notifications.',
    reportSubject: (title) => `Ton rapport — ${title}`,
    reportPreview: (title) => `Le rapport "${title}" est prêt.`,
    reportBody: (title) =>
      `Le rapport <strong style="color:#14142A">${title}</strong> est prêt. Tu peux le consulter en ligne ou l'imprimer en PDF en un clic.`,
    reportCta: 'Voir mon rapport',
    reportFooter:
      'Tu reçois ce mail car la génération automatique de rapports est active sur ton workspace.',
  },
  en: {
    hello: (name) => (name ? `Hi ${name},` : 'Hi,'),
    digestSubject: (n) => `Your weekly brief — ${n} thing${n > 1 ? 's' : ''} to look at`,
    digestPreview: (n) => `${n} thing${n > 1 ? 's' : ''} to look at this week.`,
    digestIntro: 'Here is what deserves your attention this week.',
    digestCta: 'Open SmartAnalyst',
    digestFooter:
      'You receive this email because the weekly digest is on. Manage it in Settings → Notifications.',
    alertSubject: (title) => `🔴 Alert: ${title}`,
    alertKicker: 'Critical alert',
    alertCta: 'See details',
    alertFooter:
      'You receive this email because critical alerts are on. Manage them in Settings → Notifications.',
    reportSubject: (title) => `Your report — ${title}`,
    reportPreview: (title) => `The report "${title}" is ready.`,
    reportBody: (title) =>
      `The report <strong style="color:#14142A">${title}</strong> is ready. View it online or print it as a PDF in one click.`,
    reportCta: 'View my report',
    reportFooter:
      'You receive this email because automatic report generation is active on your workspace.',
  },
}

function strs(locale) {
  return EMAIL_STRINGS[locale === 'en' ? 'en' : 'fr']
}

/**
 * Compose le digest hebdo à partir d'insights ouverts.
 * @returns {{ subject, html, text } | null} null si rien à dire.
 */
function composeWeeklyDigest(insights, { orgName, locale = 'fr' } = {}) {
  if (!insights || insights.length === 0) return null
  const s = strs(locale)
  const top = insights.slice(0, 5)
  const subject = s.digestSubject(top.length)

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
    preview: s.digestPreview(top.length),
    title: s.hello(orgName),
    intro: s.digestIntro,
    body,
    cta: { label: s.digestCta, href: `${appUrl()}/veille` },
    footer: s.digestFooter,
  })

  return { subject, html, text }
}

/**
 * Compose une alerte critique unitaire.
 */
function composeCriticalAlert(insight, { orgName, locale = 'fr' } = {}) {
  const s = strs(locale)
  const subject = s.alertSubject(insight.title)
  const body = `<div style="border-left:3px solid #E0495C;background:#FDF3F5;padding:14px 16px;border-radius:8px;margin:0 0 12px 0">
    <div style="font-size:11px;font-weight:600;color:#E0495C;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 6px 0">${s.alertKicker}</div>
    <div style="font-size:16px;font-weight:700;color:#14142A;line-height:1.4">${escapeHtml(insight.title)}</div>
    <p style="margin:8px 0 0 0;font-size:14px;line-height:1.55;color:#5C5C78">${escapeHtml(insight.summary)}</p>
  </div>`
  const { html, text } = emailTemplate.renderEmail({
    preview: insight.title,
    title: s.hello(orgName),
    body,
    cta: { label: s.alertCta, href: `${appUrl()}/veille` },
    footer: s.alertFooter,
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
  const composed = composeWeeklyDigest(insights, {
    orgName: recipient.orgName,
    locale: recipient.locale,
  })
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
  const composed = composeCriticalAlert(insight, {
    orgName: recipient.orgName,
    locale: recipient.locale,
  })
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
function composeReportReady(report, { orgName, locale = 'fr' } = {}) {
  const s = strs(locale)
  const url = `${appUrl()}/rapports`
  const subject = s.reportSubject(report.title)
  const body = `<p style="margin:0;font-size:14.5px;line-height:1.6;color:#5C5C78">${s.reportBody(escapeHtml(report.title))}</p>`
  const { html, text } = emailTemplate.renderEmail({
    preview: s.reportPreview(report.title),
    title: s.hello(orgName),
    body,
    cta: { label: s.reportCta, href: url },
    footer: s.reportFooter,
  })
  return { subject, html, text }
}

async function sendReportReady(workspaceId, report) {
  const recipient = await getWorkspaceRecipient(workspaceId)
  if (!recipient) return { sent: false, reason: 'no_recipient' }
  const composed = composeReportReady(report, {
    orgName: recipient.orgName,
    locale: recipient.locale,
  })
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
