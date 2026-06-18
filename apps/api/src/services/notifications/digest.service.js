// Résumé hebdomadaire + alertes critiques par email (brief V2 §3.3).
//
// "La veille qui prévient AVANT qu'on demande — c'est elle qui ramène
// l'utilisateur." Réutilise l'insight engine (insights déjà générés) + Resend.

const { sendEmail } = require('../email/resend.service')
const { logger } = require('../../lib/logger')
const insightsService = require('../insights/insights.service')
const { getWorkspaceRecipient } = require('./recipient')
const settingsService = require('./settings.service')

const SEVERITY_ICON = { critical: '🔴', high: '🔴', medium: '🟡', low: '🔵' }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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
      return `<li style="margin:0 0 14px;list-style:none">
        <div style="font-size:14px;font-weight:600;color:#1f1f1f">${icon} ${escapeHtml(i.title)}</div>
        <div style="font-size:13px;color:#4b5563;line-height:1.5;margin-top:2px">${escapeHtml(i.summary)}</div>
      </li>`
    })
    .join('')

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f1f1f;background:#fff">
  <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin:0 0 8px">SmartAnalyst — Brief hebdo</p>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 6px">${hello}</h1>
  <p style="font-size:14px;color:#4b5563;margin:0 0 20px">Voici ce qui mérite ton attention cette semaine.</p>
  <ul style="padding:0;margin:0 0 24px">${items}</ul>
  <p style="margin:0 0 24px"><a href="${appUrl()}" style="display:inline-block;background:#1f1f1f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Ouvrir SmartAnalyst →</a></p>
  <p style="font-size:12px;color:#9ca3af;margin:0">Tu reçois ce mail car la veille hebdo est active. Tu pourras la régler dans tes paramètres.</p>
</body></html>`

  const text = [
    hello,
    '',
    'Voici ce qui mérite ton attention cette semaine :',
    '',
    ...top.map((i) => `${SEVERITY_ICON[i.severity] || '•'} ${i.title}\n  ${i.summary}`),
    '',
    `→ ${appUrl()}`,
  ].join('\n')

  return { subject, html, text }
}

/**
 * Compose une alerte critique unitaire.
 */
function composeCriticalAlert(insight, { orgName } = {}) {
  const hello = orgName ? `Bonjour ${orgName},` : 'Bonjour,'
  const subject = `🔴 Alerte : ${insight.title}`
  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f1f1f;background:#fff">
  <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#dc2626;margin:0 0 8px">SmartAnalyst — Alerte critique</p>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 6px">${hello}</h1>
  <h2 style="font-size:17px;font-weight:700;margin:14px 0 8px;color:#dc2626">${escapeHtml(insight.title)}</h2>
  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px">${escapeHtml(insight.summary)}</p>
  <p style="margin:0 0 8px"><a href="${appUrl()}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Voir le détail →</a></p>
</body></html>`
  const text = [hello, '', `🔴 ${insight.title}`, '', insight.summary, '', `→ ${appUrl()}`].join(
    '\n',
  )
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
  const url = `${appUrl()}/reports`
  const subject = `Ton rapport — ${escapeHtml(report.title)}`
  const text = `${hello}

Le rapport "${report.title}" est prêt.

Tu peux le consulter (et l'imprimer en PDF si besoin) ici :
${url}

— SmartAnalyst`
  const html = `<p>${hello}</p>
<p>Le rapport <strong>${escapeHtml(report.title)}</strong> est prêt.</p>
<p>Tu peux le consulter (et l'imprimer en PDF si besoin) en suivant ce lien :</p>
<p><a href="${url}" style="background:#3D6BE0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Voir mon rapport →</a></p>
<p style="color:#9C9CB4;font-size:12px">— SmartAnalyst</p>`
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
