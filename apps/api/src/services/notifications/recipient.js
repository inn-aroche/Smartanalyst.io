// Résout l'email destinataire des notifications d'un workspace.
//
// Stratégie : l'email de l'organisation propriétaire du workspace
// (organizations.email, posé à l'inscription). Simple et fiable pour le mode
// "MON business" du brief V2. Le multi-destinataire viendra avec les
// réglages de notifications.

const { getServiceRoleClient } = require('../../lib/supabase')

/**
 * @returns {Promise<{ email: string, orgName: string|null } | null>}
 */
async function getWorkspaceRecipient(workspaceId) {
  const supabase = getServiceRoleClient()
  const [{ data: ws }, { data: settings }] = await Promise.all([
    supabase
      .from('workspaces')
      .select('name, organizations!inner(email, name)')
      .eq('id', workspaceId)
      .maybeSingle(),
    supabase
      .from('notification_settings')
      .select('email_override')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ])
  const fallbackEmail = ws?.organizations?.email
  const email = settings?.email_override || fallbackEmail
  if (!email) return null
  const orgName = ws?.organizations?.name || ws?.name || null
  return { email, orgName }
}

module.exports = { getWorkspaceRecipient }
