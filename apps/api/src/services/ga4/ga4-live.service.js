// GA4 live queries — utilisé par les tools chat (get_traffic_sources) qui ont
// besoin de breakdowns dimensionnels non stockés dans canonical_metrics
// (channel, page, country, device…). On tape GA4 en direct via le même OAuth
// token que le connecteur de sync, sans rien persister — c'est de la lecture
// ad-hoc.
//
// Pourquoi pas dans canonical_metrics : canonical = série temporelle par
// metric_key. Stocker tous les breakdowns possibles ferait exploser la table
// (sessions × source × medium × country × device = millions de lignes/jour).
// On préfère interroger GA4 à la demande quand le user pose la question.

const vault = require('../../lib/vault')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')

const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta'

/**
 * Récupère le connecteur GA4 actif d'un workspace et déchiffre son access
 * token. Retourne null si pas de GA4 connecté ou token absent.
 */
async function getActiveGa4Connector(workspaceId) {
  if (!workspaceId) return null
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('connectors')
    .select('id, account_id, access_token, status')
    .eq('workspace_id', workspaceId)
    .eq('source', 'ga4')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  if (!data.access_token) return null
  let accessToken = null
  try {
    accessToken = await vault.decrypt(data.access_token, {
      secretType: 'connector_oauth_token',
      field: 'access_token',
      workspaceId,
      connectorId: data.id,
      source: 'ga4',
    })
  } catch {
    return null
  }
  if (!accessToken) return null
  return { accessToken, accountId: data.account_id }
}

/**
 * Breakdown des sessions par canal d'acquisition (sessionDefaultChannelGroup)
 * sur une fenêtre temporelle. Le canal regroupe les sources brutes en grandes
 * familles (Organic Search, Paid Social, Email, Direct…) — c'est ce que les
 * marketeurs regardent en premier.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {number} [params.days=7]
 * @returns {Promise<{ channels: Array<{channel: string, sessions: number, users: number, conversions: number}>, total: number } | null>}
 */
async function getTrafficSources({ workspaceId, days = 7 }) {
  const conn = await getActiveGa4Connector(workspaceId)
  if (!conn) return null

  const propertyPath = conn.accountId.startsWith('properties/')
    ? conn.accountId
    : `properties/${conn.accountId}`
  const url = `${GA4_API_BASE}/${propertyPath}:runReport`

  const end = new Date()
  const start = new Date(end.getTime() - Math.max(1, Math.min(days, 90)) * 86_400_000)
  const fmt = (d) => d.toISOString().slice(0, 10)

  const body = {
    dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'conversions' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: '10',
  }

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    logger.warn({ event: 'ga4_live_fetch_failed', workspaceId, error: err.message })
    return null
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    logger.warn({
      event: 'ga4_live_api_error',
      workspaceId,
      status: response.status,
      body: text.slice(0, 200),
    })
    return null
  }

  const data = await response.json()
  const channels = (data.rows || []).map((row) => {
    const channel = row.dimensionValues?.[0]?.value || 'unknown'
    const vals = row.metricValues || []
    return {
      channel,
      sessions: Number(vals[0]?.value || 0),
      users: Number(vals[1]?.value || 0),
      conversions: Number(vals[2]?.value || 0),
    }
  })
  const total = channels.reduce((s, c) => s + c.sessions, 0)
  return { channels, total, days }
}

module.exports = { getTrafficSources }
