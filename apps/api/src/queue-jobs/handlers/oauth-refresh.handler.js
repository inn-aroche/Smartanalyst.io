// OAuth refresh handlers.
//
// Pourquoi
// --------
// Aujourd'hui le code de refresh OAuth (BaseConnector.refreshTokenIfNeeded)
// n'est appelé QUE pendant un sync (cf apps/api/src/connectors/base.connector.js).
// Si le sync se déclenche après l'expiration totale du token, le refresh
// échoue → status='expired' → silence radio pour le user qui voit ses
// dashboards stagner sans comprendre.
//
// Ce handler scan proactivement les connectors OAuth dont le token va
// expirer dans les 24h, et déclenche un job de refresh par connector.
// Si le refresh fail malgré la fenêtre confortable, le DLQ alerting
// (PR #38) pingera Sentry → Slack pour intervention.
//
// Architecture fan-out
// --------------------
//   1. Job `scan-expiring` (cron toutes les 4h via scheduler.js)
//      → SELECT connectors WHERE refresh_token NOT NULL AND
//        token_expires_at < NOW() + 24h
//      → enqueue un job `refresh-token` par connector
//   2. Job `refresh-token` (workspaceId, connectorId, source)
//      → instancie le connecteur via getConnector()
//      → appelle instance.refreshTokenIfNeeded()
//      → si fail, marque le connecteur status='expired' avec message clair
//        et throw pour que BullMQ tente les retries puis DLQ → Sentry alert

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { getConnector } = require('../../connectors')

// Refresh proactif si le token expire dans les LOOKAHEAD_HOURS prochaines.
// 24h donne un buffer 6x la fréquence du scan (4h) → plein safety margin
// pour réessayer en cas de failure transient (Google rate limit, etc.).
const LOOKAHEAD_HOURS = 24

/**
 * Scan tous les connectors OAuth dont le token expire bientôt et dispatch
 * un job de refresh par connector. Appelé par le scheduler cron.
 *
 * @param {Object} ctx
 * @param {import('bullmq').Queue} ctx.refreshQueue - queue OAUTH_REFRESH
 * @returns {Promise<{scanned: number, enqueued: number}>}
 */
async function scanExpiringConnectors({ refreshQueue }) {
  const supabase = getServiceRoleClient()
  const cutoffIso = new Date(Date.now() + LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString()

  // On inclut les status 'active' (refresh préventif) ET 'expired' (try
  // recovery — le token peut être encore valide, le sync précédent a peut-être
  // juste rencontré une erreur transient).
  const { data: connectors, error } = await supabase
    .from('connectors')
    .select('id, workspace_id, source, status, token_expires_at')
    .not('refresh_token', 'is', null)
    .lt('token_expires_at', cutoffIso)
    .in('status', ['active', 'expired'])

  if (error) {
    logger.error(
      { event: 'oauth_refresh_scan_failed', error: error.message },
      'OAuth refresh scan failed',
    )
    throw error
  }

  logger.info(
    {
      event: 'oauth_refresh_scan_started',
      connectorCount: connectors?.length || 0,
      lookaheadHours: LOOKAHEAD_HOURS,
    },
    `Scanning ${connectors?.length || 0} expiring OAuth connectors`,
  )

  const enqueued = []
  for (const c of connectors || []) {
    // jobId stable par connector+day pour idempotence : si le scan re-run
    // dans la même journée, BullMQ déduplique. Pas de risque de spam refresh.
    const day = new Date().toISOString().slice(0, 10)
    const jobId = `oauth-refresh:${c.id}:${day}`
    await refreshQueue.add(
      'refresh-token',
      { connectorId: c.id, workspaceId: c.workspace_id, source: c.source },
      { jobId },
    )
    enqueued.push(c.id)
  }

  return {
    scanned: connectors?.length || 0,
    enqueued: enqueued.length,
    lookaheadHours: LOOKAHEAD_HOURS,
  }
}

/**
 * Refresh un connector OAuth en particulier.
 * Si le refresh échoue, marque le connecteur expired + throw pour que
 * BullMQ tente les retries puis push en DLQ (alerte Sentry).
 *
 * @param {Object} job - BullMQ job avec data: { connectorId, workspaceId, source }
 */
async function refreshOne(job) {
  const { connectorId, workspaceId, source } = job.data
  const supabase = getServiceRoleClient()

  const { data: record, error: fetchErr } = await supabase
    .from('connectors')
    .select('*')
    .eq('id', connectorId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!record) {
    logger.warn(
      { event: 'oauth_refresh_connector_not_found', connectorId },
      'Connector not found during refresh (deleted between scan and processing)',
    )
    return { skipped: true, reason: 'not_found' }
  }
  if (!record.refresh_token) {
    return { skipped: true, reason: 'no_refresh_token' }
  }

  const instance = getConnector(workspaceId, record)
  const startedAt = Date.now()
  try {
    const refreshed = await instance.refreshTokenIfNeeded()
    const durationMs = Date.now() - startedAt
    logger.info(
      {
        event: refreshed ? 'oauth_token_refreshed' : 'oauth_token_still_valid',
        workspaceId,
        connectorId,
        source,
        durationMs,
      },
      refreshed
        ? `OAuth token refreshed for ${source}`
        : `OAuth token still valid for ${source} — no refresh needed`,
    )
    return { ok: true, refreshed, connectorId, durationMs }
  } catch (err) {
    const durationMs = Date.now() - startedAt
    logger.error(
      {
        event: 'oauth_token_refresh_failed',
        workspaceId,
        connectorId,
        source,
        error: err.message,
        durationMs,
      },
      `OAuth refresh failed for ${source}`,
    )
    // Marque le connecteur en error pour que le user le voie dans son UI
    // et puisse re-déclencher l'OAuth flow. Non-fatal pour le handler —
    // on relève l'erreur pour que BullMQ trigger les retries / DLQ.
    await supabase
      .from('connectors')
      .update({
        status: 'expired',
        status_reason: 'oauth_refresh_failed',
        last_error_message: err.message?.slice(0, 500) || 'OAuth refresh failed',
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectorId)
    throw err
  }
}

module.exports = { scanExpiringConnectors, refreshOne, LOOKAHEAD_HOURS }
