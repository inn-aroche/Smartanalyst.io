// Alert check handlers — cahier §3 Lot 0 (santé connecteurs) + §4.7.
//
// Architecture fan-out : scan toutes les 4 h → enqueue un check par
// workspace → check des connecteurs en échec silencieux + (à venir Lot 1)
// seuils d'anomalies sur le health score + tracking cassé.
//
// Pour le Lot 0, on couvre uniquement la **détection** des connecteurs qui
// échouent sans signaler : un connector en `error` depuis > 12 h ou un
// `active` qui n'a pas syncé depuis > 36 h compte comme silencieux et
// remonte un log structuré (`connector_health_alert`). L'envoi de
// notification in-app / email arrivera avec le NotificationCenter (Lot 1).

const { logger } = require('../../lib/logger')
const connectorService = require('../../services/connectors/connector.service')
const connectorHealth = require('../../services/connectors/connector-health.service')
const connectorAlert = require('../../services/connectors/connector-alert.service')
const workspaceService = require('../../services/workspaces/workspace.service')

async function scanAllWorkspaces({ alertsQueue }) {
  const workspaces = await workspaceService.listActive()
  for (const ws of workspaces) {
    await alertsQueue.add(
      'check-workspace',
      { workspaceId: ws.id },
      { jobId: `alert-check:${ws.id}:${Date.now()}` },
    )
  }
  logger.info(
    { event: 'alerts_scan_started', workspaceCount: workspaces.length },
    'Scanning workspaces for alert check',
  )
  return { workspaceCount: workspaces.length }
}

async function checkWorkspace(job) {
  const { workspaceId } = job.data
  const summary = await checkConnectorsHealth(workspaceId)
  return { workspaceId, ...summary }
}

// Exporté pour pouvoir l'appeler ailleurs (tests, endpoint admin, sync).
async function checkConnectorsHealth(workspaceId) {
  const connectors = await connectorService.list(workspaceId)
  const enriched = connectorHealth.enrichWithHealth(connectors)
  const alerts = enriched.filter((c) => c.health_state.silent_failure)
  for (const c of alerts) {
    logger.warn(
      {
        event: 'connector_health_alert',
        workspaceId,
        connectorId: c.id,
        source: c.source,
        health_state: c.health_state.state,
        reason: c.health_state.reason,
        last_synced_at: c.health_state.last_synced_at,
      },
      'Connector silent failure detected',
    )
    // Best-effort — voir connector-alert.service.js. Ce cron (4h) est le
    // filet de sécurité : même si sync()/refreshOne n'ont rien notifié
    // (ex: connecteur 'stale' sans erreur explicite), l'user est prévenu.
    void connectorAlert.notifyConnectorDown({
      workspaceId,
      connectorId: c.id,
      source: c.source,
      reason: c.health_state.reason || c.health_state.state,
    })
  }
  logger.info(
    {
      event: 'connector_health_check_completed',
      workspaceId,
      connectorCount: connectors.length,
      alertsTriggered: alerts.length,
    },
    'Connector health check done',
  )
  return { connectorCount: connectors.length, alertsTriggered: alerts.length }
}

module.exports = { scanAllWorkspaces, checkWorkspace, checkConnectorsHealth }
