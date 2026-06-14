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
  const { data, error } = await supabase
    .from('workspaces')
    .select('name, organizations!inner(email, name)')
    .eq('id', workspaceId)
    .maybeSingle()
  if (error || !data || !data.organizations?.email) return null
  return { email: data.organizations.email, orgName: data.organizations.name || data.name || null }
}

module.exports = { getWorkspaceRecipient }
