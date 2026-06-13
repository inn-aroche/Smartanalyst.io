// Synthèse "Santé du tracking" pour un workspace.
//
// Compose 3 sources :
//   - statut SmartTag (Redis : actif + dernier event)
//   - volumes persistés (smarttag_daily : 7j / 30j, par type)
//   - sources connectées (table connectors)
//
// Sert le bloc "Santé du tracking" de la Home. Les écarts fins (SmartTag vs
// Meta/GA4) sont produits par l'insight engine, pas ici — ici on donne les
// faits bruts + un niveau de confiance simple.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const ingestion = require('./ingestion.service')

function daysAgo(n) {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
}

/**
 * @param {string} workspaceId
 * @returns {Promise<Object>}
 */
async function getHealth(workspaceId) {
  const today = new Date().toISOString().slice(0, 10)

  const [status, agg30, connectors] = await Promise.all([
    ingestion.getStatus(workspaceId),
    ingestion.getDailyAggregates(workspaceId, { startDate: daysAgo(30), endDate: today }),
    _connectedSources(workspaceId),
  ])

  const since7 = daysAgo(7)
  let events7 = 0
  let events30 = 0
  const byTypeMap = new Map()
  for (const r of agg30) {
    const c = Number(r.event_count) || 0
    events30 += c
    if (r.date >= since7) events7 += c
    const key = `${r.event_type}|${r.event_name || ''}`
    byTypeMap.set(key, (byTypeMap.get(key) || 0) + c)
  }
  const byType = Array.from(byTypeMap.entries())
    .map(([k, count]) => {
      const [event_type, event_name] = k.split('|')
      return { event_type, event_name: event_name || null, count }
    })
    .sort((a, b) => b.count - a.count)

  // Confiance simple : tag actif ET au moins une source = high ; l'un des
  // deux = medium ; rien = low.
  const tagActive = Boolean(status.installed)
  const hasSource = connectors.length > 0
  let confidence = 'low'
  if (tagActive && hasSource) confidence = 'high'
  else if (tagActive || hasSource) confidence = 'medium'

  return {
    smarttag_active: tagActive,
    last_event_at: status.lastEventAt,
    events_last_7d: events7,
    events_last_30d: events30,
    by_type: byType,
    connected_sources: connectors,
    confidence,
  }
}

async function _connectedSources(workspaceId) {
  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('connectors')
      .select('source, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['active', 'expired'])
    if (error) throw error
    return Array.from(new Set((data || []).map((c) => c.source)))
  } catch (err) {
    logger.warn(
      { event: 'tracking_health_sources_failed', workspaceId, error: err.message },
      'tracking-health: connected sources lookup failed',
    )
    return []
  }
}

module.exports = { getHealth }
