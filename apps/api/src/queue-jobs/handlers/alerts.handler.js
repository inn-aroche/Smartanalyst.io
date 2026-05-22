// Alert check handlers — STUB.
//
// Source: docs/20 §4, docs/16b (anomaly detection)
//
// Architecture fan-out: scan toutes les 4h → enqueue un check par workspace
// → check des seuils (anomalies, broken tracking, drop > 15pts du health score)
// → si critique, envoie email + push (à venir).

const { logger } = require('../../lib/logger')
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
  logger.info(
    { event: 'alert_check_stub', workspaceId },
    'Alert check stub — to be implemented (doc 16b)',
  )
  return { workspaceId, stub: true, alertsTriggered: 0 }
}

module.exports = { scanAllWorkspaces, checkWorkspace }
