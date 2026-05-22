// Workspace service: lectures basiques utilisées par les jobs et services.
//
// Pourquoi un service dédié: pour ne pas dupliquer les requêtes vers la table
// `workspaces` ailleurs (connecteurs, jobs, rapports, etc.).

const { getServiceRoleClient } = require('../../lib/supabase')

/**
 * Tous les workspaces actifs (is_active=true, deleted_at IS NULL).
 * Utilisé par les jobs "scan-all" pour fan-out.
 */
async function listActive() {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, organization_id, name, timezone, report_day, auto_send, sector, market')
    .eq('is_active', true)
    .is('deleted_at', null)

  if (error) throw error
  return data || []
}

async function getById(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .maybeSingle()

  if (error) throw error
  return data
}

module.exports = { listActive, getById }
