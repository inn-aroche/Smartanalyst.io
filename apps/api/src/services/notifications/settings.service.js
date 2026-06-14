// Réglages notifications par workspace.

const { getServiceRoleClient } = require('../../lib/supabase')
const { UserFacingError } = require('../../lib/error-handler')

const DEFAULTS = { weekly_digest: true, critical_alerts: true, email_override: null }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function getSettings(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('notification_settings')
    .select('weekly_digest, critical_alerts, email_override')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw error
  return data || { ...DEFAULTS }
}

async function updateSettings(workspaceId, patch) {
  const allowed = {}
  if (typeof patch.weekly_digest === 'boolean') allowed.weekly_digest = patch.weekly_digest
  if (typeof patch.critical_alerts === 'boolean') allowed.critical_alerts = patch.critical_alerts
  if (patch.email_override === null || patch.email_override === '') {
    allowed.email_override = null
  } else if (typeof patch.email_override === 'string') {
    if (!EMAIL_RE.test(patch.email_override)) {
      throw new UserFacingError('Email invalide.', { statusCode: 400, code: 'INVALID_EMAIL' })
    }
    allowed.email_override = patch.email_override
  }
  if (Object.keys(allowed).length === 0) return getSettings(workspaceId)

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('notification_settings')
    .upsert({ workspace_id: workspaceId, ...allowed, updated_at: new Date().toISOString() })
    .select('weekly_digest, critical_alerts, email_override')
    .single()
  if (error) throw error
  return data
}

module.exports = { getSettings, updateSettings, DEFAULTS }
