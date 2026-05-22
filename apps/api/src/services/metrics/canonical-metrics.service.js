// Canonical metrics service: ingest, query, invalidate cache.
//
// Source: docs/03_ARCHITECTURE_GLOBALE.md §4 (data ingestion flow),
//         docs/02_BONNES_PRATIQUES_TRANSVERSALES.md §3.2 (cache strategy),
//         migration 003 (canonical_metrics table)
//
// Règle d'or: aucun appel direct à `canonical_metrics` ailleurs.
// Tout passe par ce service.

const { getServiceRoleClient } = require('../../lib/supabase')
const { getRedis } = require('../../lib/redis')
const { logger } = require('../../lib/logger')

const TABLE = 'canonical_metrics'

/**
 * @typedef {Object} CanonicalMetricRow
 * @property {string} date              - 'YYYY-MM-DD'
 * @property {string} metricKey         - Clé canonique (voir canonical-metrics-mapping.js)
 * @property {number} metricValue
 * @property {number} [confidenceScore] - 0-100, default 100
 * @property {string} [timezoneSource]  - IANA tz du compte source
 */

/**
 * Ingère un batch de métriques canoniques pour un workspace + une source.
 * Idempotent: ON CONFLICT (workspace_id, date, metric_key, source) DO UPDATE.
 *
 * @param {Object} params
 * @param {string} params.workspaceId
 * @param {string} params.source         - 'ga4' | 'meta_ads' | ...
 * @param {string} [params.connectorId]  - UUID du connector (audit)
 * @param {CanonicalMetricRow[]} params.rows
 * @returns {Promise<{ inserted: number }>}
 */
async function ingest({ workspaceId, source, connectorId = null, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0 }
  }

  const supabase = getServiceRoleClient()

  const payload = rows.map((r) => ({
    workspace_id: workspaceId,
    date: r.date,
    metric_key: r.metricKey,
    metric_value: Number(r.metricValue),
    source,
    connector_id: connectorId,
    confidence_score: r.confidenceScore ?? 100,
    timezone_source: r.timezoneSource || null,
  }))

  const { error, count } = await supabase
    .from(TABLE)
    .upsert(payload, {
      onConflict: 'workspace_id,date,metric_key,source',
      count: 'exact',
    })

  if (error) {
    logger.error(
      {
        event: 'canonical_metrics_ingest_failed',
        workspaceId,
        source,
        rowCount: rows.length,
        error: error.message,
      },
      'Failed to ingest canonical metrics',
    )
    throw error
  }

  // Cache invalidation explicite (docs/02 §3.2: pas de TTL cleanup)
  await invalidateCache(workspaceId)

  logger.info(
    {
      event: 'canonical_metrics_ingested',
      workspaceId,
      source,
      rowCount: payload.length,
    },
    'Canonical metrics ingested',
  )

  return { inserted: count ?? payload.length }
}

/**
 * Récupère les métriques canoniques pour un workspace.
 *
 * @param {Object} params
 * @param {string} params.workspaceId
 * @param {string|string[]} [params.metricKey] - filtre une ou plusieurs canonical_keys
 * @param {string} [params.source]
 * @param {string} [params.startDate]          - 'YYYY-MM-DD' inclusif
 * @param {string} [params.endDate]            - 'YYYY-MM-DD' inclusif
 * @param {number} [params.limit=1000]
 * @returns {Promise<Array>}
 */
async function query({ workspaceId, metricKey, source, startDate, endDate, limit = 1000 }) {
  const supabase = getServiceRoleClient()

  let q = supabase
    .from(TABLE)
    .select('date, metric_key, metric_value, source, confidence_score, timezone_source')
    .eq('workspace_id', workspaceId)
    .order('date', { ascending: false })
    .limit(limit)

  if (metricKey) {
    if (Array.isArray(metricKey)) q = q.in('metric_key', metricKey)
    else q = q.eq('metric_key', metricKey)
  }
  if (source) q = q.eq('source', source)
  if (startDate) q = q.gte('date', startDate)
  if (endDate) q = q.lte('date', endDate)

  const { data, error } = await q

  if (error) {
    logger.error(
      { event: 'canonical_metrics_query_failed', workspaceId, error: error.message },
      'Failed to query canonical metrics',
    )
    throw error
  }

  return data || []
}

/**
 * Invalide tous les caches Redis liés à ce workspace.
 * Appelé après chaque ingest réussi.
 */
async function invalidateCache(workspaceId) {
  try {
    const redis = getRedis()
    const patterns = [
      `health_score:${workspaceId}`,
      `kpis:${workspaceId}:*`,
      `insights:${workspaceId}`,
      `dashboard:${workspaceId}`,
    ]

    // Pour les patterns avec wildcard, scan + del
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const stream = redis.scanStream({ match: pattern, count: 100 })
        const keys = []
        for await (const batch of stream) keys.push(...batch)
        if (keys.length > 0) await redis.del(...keys)
      } else {
        await redis.del(pattern)
      }
    }
  } catch (err) {
    // Cache invalidation ne doit jamais bloquer l'ingest.
    logger.warn(
      { event: 'cache_invalidation_failed', workspaceId, error: err.message },
      'Cache invalidation failed',
    )
  }
}

module.exports = { ingest, query, invalidateCache }
