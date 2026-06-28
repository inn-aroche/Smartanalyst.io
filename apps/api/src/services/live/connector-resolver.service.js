// Résout le connecteur actif d'un workspace pour une source donnée et
// déchiffre le token. Mutualisé entre tous les live services.

const { getServiceRoleClient } = require('../../lib/supabase')
const vault = require('../../lib/vault')
const { logger } = require('../../lib/logger')

async function getActiveConnector(workspaceId, source) {
  if (!workspaceId || !source) return null
  const supabase = getServiceRoleClient()

  const { data, error } = await supabase
    .from('connectors')
    .select(
      'id, account_id, account_name, access_token, refresh_token, token_expires_at, status, source',
    )
    .eq('workspace_id', workspaceId)
    .eq('source', source)
    .in('status', ['active', 'expired'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  if (!data.access_token) return null

  const secretType = data.refresh_token ? 'connector_oauth_token' : 'connector_api_key'

  let accessToken = null
  try {
    accessToken = await vault.decrypt(data.access_token, {
      secretType,
      field: 'access_token',
      workspaceId,
      connectorId: data.id,
      source,
    })
  } catch (err) {
    logger.warn({
      event: 'live_connector_decrypt_failed',
      workspaceId,
      source,
      error: err.message,
    })
    return null
  }

  if (!accessToken) return null

  return {
    accessToken,
    accountId: data.account_id,
    accountName: data.account_name,
    connectorId: data.id,
    record: data,
  }
}

module.exports = { getActiveConnector }
