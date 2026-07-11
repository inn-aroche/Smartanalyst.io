// Data sync handlers.
//
// Source: docs/20_QUEUE_SYSTEM_BULLMQ.md §1
//
// Architecture fan-out:
//   1. Job "scan-all-workspaces" (cron quotidien) → enqueue un job
//      "sync-workspace" par workspace actif
//   2. Job "sync-workspace" → sync TOUS les connecteurs actifs du workspace
//      en série (parallel possible, mais on évite le rate limit)
//   3. Après succès → enqueue insights-generation (fait dans index.js
//      via worker.on('completed'))

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const workspaceService = require('../../services/workspaces/workspace.service')
const { getConnector } = require('../../connectors')
const { resyncWindowDays } = require('../../services/connectors/connector.service')

// Backfill à la connexion : 12 mois d'historique, en chunks de 90 jours pour
// rester sous les limites de pagination/rate-limit des APIs sources (GA4,
// Meta Ads, Shopify...) plutôt qu'un seul fetch sur 365 jours. Ordre
// du chunk le plus récent au plus ancien — le dashboard a des données
// utiles dès le 1er chunk au lieu d'attendre les 4.
const BACKFILL_MONTHS = 12
const BACKFILL_CHUNK_DAYS = 90

function buildBackfillChunks(months = BACKFILL_MONTHS, chunkDays = BACKFILL_CHUNK_DAYS) {
  const fmt = (d) => d.toISOString().slice(0, 10)
  const today = new Date()
  const earliestStart = new Date(today.getTime() - months * 30 * 24 * 60 * 60 * 1000)

  const chunks = []
  let chunkEnd = today
  while (chunkEnd > earliestStart) {
    const chunkStart = new Date(
      Math.max(chunkEnd.getTime() - chunkDays * 24 * 60 * 60 * 1000, earliestStart.getTime()),
    )
    chunks.push({ startDate: fmt(chunkStart), endDate: fmt(chunkEnd) })
    chunkEnd = new Date(chunkStart.getTime() - 24 * 60 * 60 * 1000)
  }
  return chunks
}

/**
 * Scan-all: fan-out vers un job par workspace actif.
 * @param {Object} ctx - { dataSyncQueue: Queue }
 */
async function scanAllWorkspaces({ dataSyncQueue }) {
  const workspaces = await workspaceService.listActive()
  logger.info(
    { event: 'data_sync_scan_started', workspaceCount: workspaces.length },
    'Scanning workspaces for daily sync',
  )

  const enqueued = []
  for (const ws of workspaces) {
    // jobId stable = idempotence sur la journée (UTC). Si le job existe déjà
    // pour aujourd'hui, BullMQ le déduplique.
    const today = new Date().toISOString().slice(0, 10)
    const jobId = `sync-workspace:${ws.id}:${today}`
    await dataSyncQueue.add('sync-workspace', { workspaceId: ws.id }, { jobId })
    enqueued.push(ws.id)
  }

  return { workspaceCount: workspaces.length, enqueued: enqueued.length }
}

/**
 * Sync all connectors for a single workspace.
 * @param {Object} job - { data: { workspaceId, startDate?, endDate? } }
 */
async function syncWorkspace(job) {
  const { workspaceId, startDate, endDate } = job.data
  const supabase = getServiceRoleClient()

  const { data: connectors, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['active', 'expired']) // expired = on tente quand même (peut refresh)

  if (error) {
    logger.error(
      { event: 'sync_workspace_connectors_fetch_failed', workspaceId, error: error.message },
      'Failed to fetch connectors',
    )
    throw error
  }

  const today = new Date()
  const fmt = (d) => d.toISOString().slice(0, 10)

  // Si startDate/endDate est passé explicitement (override), s'applique à
  // tous les connecteurs. Sinon, chaque connecteur resync sur SA propre
  // fenêtre (connectors.resync_window_days) — Stripe et Shopify ont besoin
  // de plus de recul que 7j pour rattraper remboursements/statuts révisés.
  const explicitRange = startDate && endDate ? { startDate, endDate } : null

  const results = []
  for (const record of connectors || []) {
    const range = explicitRange || {
      startDate: fmt(new Date(today.getTime() - resyncWindowDays(record) * 24 * 60 * 60 * 1000)),
      endDate: fmt(today),
    }
    try {
      const instance = getConnector(workspaceId, record)
      const r = await instance.sync(range)
      results.push({
        connectorId: record.id,
        source: record.source,
        ok: true,
        metricsCount: r.metricsCount,
        range,
      })
    } catch (err) {
      logger.warn(
        {
          event: 'sync_connector_failed_in_batch',
          workspaceId,
          connectorId: record.id,
          source: record.source,
          error: err.message,
        },
        'Connector sync failed during workspace sync (continuing with next)',
      )
      results.push({
        connectorId: record.id,
        source: record.source,
        ok: false,
        error: err.message,
        range,
      })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  logger.info(
    {
      event: 'sync_workspace_completed',
      workspaceId,
      connectorTotal: results.length,
      connectorOk: okCount,
    },
    'Workspace sync completed',
  )

  return { workspaceId, explicitRange, results, okCount, total: results.length }
}

/**
 * Backfill l'historique d'UN connecteur (12 mois, par chunks) — déclenché à
 * la connexion (OAuth callback ou ajout API key) pour que le user voie tout
 * son historique dès le premier jour au lieu d'attendre que le cron
 * quotidien (fenêtre 7j) accumule des mois de data.
 *
 * @param {Object} job - { data: { workspaceId, connectorId, source } }
 */
async function backfillConnector(job) {
  const { workspaceId, connectorId, source } = job.data
  const supabase = getServiceRoleClient()

  const { data: record, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('id', connectorId)
    .maybeSingle()

  if (error) throw error
  if (!record) {
    logger.warn(
      { event: 'backfill_connector_not_found', connectorId },
      'Connector not found for backfill (deleted before job ran)',
    )
    return { skipped: true, reason: 'not_found' }
  }

  const instance = getConnector(workspaceId, record)
  const chunks = buildBackfillChunks()

  const results = []
  for (const range of chunks) {
    try {
      const r = await instance.sync(range)
      results.push({ ...range, ok: true, metricsCount: r.metricsCount })
    } catch (err) {
      // Un chunk qui échoue échoue probablement pour la même raison que les
      // suivants (creds invalides, scope manquant) — inutile de tous les
      // tenter. base.connector.js a déjà marqué le connecteur en erreur et
      // notifié l'utilisateur (connector-alert.service).
      logger.warn(
        {
          event: 'backfill_chunk_failed',
          workspaceId,
          connectorId,
          source,
          range,
          error: err.message,
        },
        'Backfill chunk failed — stopping remaining chunks',
      )
      results.push({ ...range, ok: false, error: err.message })
      break
    }
  }

  const okCount = results.filter((r) => r.ok).length
  logger.info(
    {
      event: 'backfill_connector_completed',
      workspaceId,
      connectorId,
      source,
      chunkTotal: results.length,
      chunkOk: okCount,
    },
    'Connector historical backfill completed',
  )

  return { workspaceId, connectorId, source, chunks: results, okCount }
}

module.exports = { scanAllWorkspaces, syncWorkspace, backfillConnector, buildBackfillChunks }
