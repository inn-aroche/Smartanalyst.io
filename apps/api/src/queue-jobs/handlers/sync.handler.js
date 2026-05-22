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
    await dataSyncQueue.add(
      'sync-workspace',
      { workspaceId: ws.id },
      { jobId },
    )
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

  // Range par défaut: les 7 derniers jours
  const today = new Date()
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fmt = (d) => d.toISOString().slice(0, 10)
  const range = {
    startDate: startDate || fmt(weekAgo),
    endDate: endDate || fmt(today),
  }

  const results = []
  for (const record of connectors || []) {
    try {
      const instance = getConnector(workspaceId, record)
      const r = await instance.sync(range)
      results.push({ connectorId: record.id, source: record.source, ok: true, metricsCount: r.metricsCount })
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
      results.push({ connectorId: record.id, source: record.source, ok: false, error: err.message })
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

  return { workspaceId, range, results, okCount, total: results.length }
}

module.exports = { scanAllWorkspaces, syncWorkspace }
