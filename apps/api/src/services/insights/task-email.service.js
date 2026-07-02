// Brief V2 §3.4 — "Envoyer comme brief par email à quelqu'un (collaborateur,
// prestataire, direction)". Réutilise Resend (déjà câblé pour waitlist).
//
// Pas de table briefs_sent : on log dans audit_logs pour la trace. Si on a
// besoin d'historique riche plus tard, on dédiera une table.

const { sendEmail } = require('../email/resend.service')
const emailTemplate = require('../email/email-template.service')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError } = require('../../lib/error-handler')

const escapeHtml = emailTemplate.escapeHtml

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Strings EN/FR du brief (ADR-0003 — international dès J1). La locale vient
// du workspace (migration 042).
const BRIEF_STRINGS = {
  fr: {
    subject: (title) => `Brief : ${title}`,
    priority: 'Priorité',
    impact: 'Impact',
    effort: 'Effort',
    confidence: 'Confiance',
    footer: (name) => `Brief envoyé ${name ? `par ${name} ` : ''}depuis SmartAnalyst.`,
  },
  en: {
    subject: (title) => `Brief: ${title}`,
    priority: 'Priority',
    impact: 'Impact',
    effort: 'Effort',
    confidence: 'Confidence',
    footer: (name) => `Brief sent ${name ? `by ${name} ` : ''}from SmartAnalyst.`,
  },
}

/**
 * Compose le HTML + text d'un brief de tâche.
 * Volontairement sobre (système, pas de marketing) — c'est un brief opérationnel.
 *
 * @param {object} task        - row action_cards
 * @param {object} [opts]
 * @param {string} [opts.senderName] - nom du sender (pour signer)
 * @param {string} [opts.note]       - mot perso ajouté en haut
 * @param {'fr'|'en'} [opts.locale='fr']
 * @returns {{ subject, html, text }}
 */
function composeBrief(task, { senderName, note, locale = 'fr' } = {}) {
  const s = BRIEF_STRINGS[locale === 'en' ? 'en' : 'fr']
  const trim = (str, n = 4000) => (typeof str === 'string' ? str.slice(0, n) : '')
  const safeTitle = trim(task.title, 200)
  const subject = s.subject(safeTitle)
  const greetingName = (senderName || '').trim()
  const senderTag = greetingName ? `${greetingName} (via SmartAnalyst)` : 'via SmartAnalyst'

  // Body = note perso optionnelle (en encadre brand) + description tache +
  // table (Priorite/Impact/Effort/Confiance).
  const noteBlock = note
    ? `<div style="margin:0 0 18px 0;padding:12px 14px;background:#F0F4FF;border-left:3px solid #5C8FFF;border-radius:0 6px 6px 0;font-size:14px;line-height:1.55;color:#5C5C78">${escapeHtml(trim(note, 600))}</div>`
    : ''
  const descBlock = task.description
    ? `<p style="margin:0 0 18px 0;font-size:14px;line-height:1.65;color:#14142A">${escapeHtml(trim(task.description, 2000))}</p>`
    : ''
  const metaTable = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-size:13px;color:#5C5C78;border-collapse:collapse;margin:0">
    <tr><td style="padding:3px 14px 3px 0;color:#5C5C78">${s.priority}</td><td style="padding:3px 0;color:#14142A"><strong>${escapeHtml(String(task.priority || '—'))}</strong></td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#5C5C78">${s.impact}</td><td style="padding:3px 0;color:#14142A">${escapeHtml(String(task.impact || '—'))}</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#5C5C78">${s.effort}</td><td style="padding:3px 0;color:#14142A">${escapeHtml(String(task.effort || '—'))}</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#5C5C78">${s.confidence}</td><td style="padding:3px 0;color:#14142A">${escapeHtml(String(task.confidence || '—'))}</td></tr>
  </table>`

  const body = `${noteBlock}${descBlock}${metaTable}`

  const { html, text } = emailTemplate.renderEmail({
    preview: safeTitle,
    title: safeTitle,
    body,
    footer: s.footer(greetingName),
  })

  // text/plain : on ajoute les meta task explicitement (le strip HTML ne
  // rend pas bien la table).
  const textWithMeta = `${text}\n\n— ${senderTag}\n${s.priority} : ${task.priority || '—'} · ${s.impact} : ${task.impact || '—'} · ${s.effort} : ${task.effort || '—'} · ${s.confidence} : ${task.confidence || '—'}`

  return { subject, html, text: textWithMeta }
}

/**
 * Envoie un brief à un destinataire pour une tâche.
 * Log dans audit_logs (best-effort).
 */
async function sendTaskBrief({ workspaceId, userId, task, recipient, note, senderName }) {
  if (!recipient || !EMAIL_RE.test(recipient)) {
    throw new UserFacingError('Destinataire email invalide.', {
      statusCode: 400,
      code: 'INVALID_RECIPIENT',
    })
  }
  // Locale du workspace (migration 042) — best-effort, défaut fr.
  let locale = 'fr'
  try {
    const { data: ws } = await getServiceRoleClient()
      .from('workspaces')
      .select('locale')
      .eq('id', workspaceId)
      .maybeSingle()
    if (ws?.locale === 'en') locale = 'en'
  } catch {
    // défaut fr
  }
  const { subject, html, text } = composeBrief(task, { senderName, note, locale })
  const result = await sendEmail({ to: recipient, subject, html, text })

  // Audit (best-effort)
  if (result.ok) {
    getServiceRoleClient()
      .from('audit_logs')
      .insert({
        user_id: userId || null,
        workspace_id: workspaceId,
        action: 'task_brief_sent',
        resource_type: 'action_card',
        resource_id: task.id,
        changes: { recipient, message_id: result.id || null },
      })
      .then(({ error }) => {
        if (error) {
          logger.warn(
            { event: 'task_brief_audit_failed', error: error.message },
            'Task brief audit log failed',
          )
        }
      })
  }

  return result
}

module.exports = { sendTaskBrief, composeBrief }
