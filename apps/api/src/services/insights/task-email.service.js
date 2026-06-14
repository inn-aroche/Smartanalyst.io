// Brief V2 §3.4 — "Envoyer comme brief par email à quelqu'un (collaborateur,
// prestataire, direction)". Réutilise Resend (déjà câblé pour waitlist).
//
// Pas de table briefs_sent : on log dans audit_logs pour la trace. Si on a
// besoin d'historique riche plus tard, on dédiera une table.

const { sendEmail } = require('../email/resend.service')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError } = require('../../lib/error-handler')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Compose le HTML + text d'un brief de tâche.
 * Volontairement sobre (système, pas de marketing) — c'est un brief opérationnel.
 *
 * @param {object} task        - row action_cards
 * @param {object} [opts]
 * @param {string} [opts.senderName] - nom du sender (pour signer)
 * @param {string} [opts.note]       - mot perso ajouté en haut
 * @returns {{ subject, html, text }}
 */
function composeBrief(task, { senderName, note } = {}) {
  const trim = (s, n = 4000) => (typeof s === 'string' ? s.slice(0, n) : '')
  const safeTitle = trim(task.title, 200)
  const subject = `Brief : ${safeTitle}`
  const greetingName = (senderName || '').trim()
  const signature = greetingName ? `— ${greetingName} (via SmartAnalyst)` : '— via SmartAnalyst'

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f1f1f;background:#fff">
  <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin:0 0 8px">SmartAnalyst — Brief</p>
  ${note ? `<p style="font-size:14px;line-height:1.6;background:#f8fafc;border-left:3px solid #5C8FFF;padding:12px 14px;margin:0 0 18px;color:#374151">${escapeHtml(trim(note, 600))}</p>` : ''}
  <h1 style="font-size:20px;font-weight:700;margin:0 0 12px;line-height:1.35">${escapeHtml(safeTitle)}</h1>
  ${task.description ? `<p style="font-size:14px;line-height:1.65;color:#374151;margin:0 0 18px">${escapeHtml(trim(task.description, 2000))}</p>` : ''}
  <table style="font-size:13px;color:#374151;border-collapse:collapse;margin:0 0 22px">
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Priorité</td><td style="padding:4px 0"><strong>${task.priority}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Impact</td><td style="padding:4px 0">${task.impact}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Effort</td><td style="padding:4px 0">${task.effort}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Confiance</td><td style="padding:4px 0">${task.confidence}</td></tr>
  </table>
  <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0">${signature}</p>
</body></html>`

  const text = [
    'SmartAnalyst — Brief',
    '',
    ...(note ? [trim(note, 600), ''] : []),
    safeTitle,
    '',
    ...(task.description ? [trim(task.description, 2000), ''] : []),
    `Priorité : ${task.priority}`,
    `Impact   : ${task.impact}`,
    `Effort   : ${task.effort}`,
    `Confiance: ${task.confidence}`,
    '',
    signature,
  ].join('\n')

  return { subject, html, text }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  const { subject, html, text } = composeBrief(task, { senderName, note })
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
