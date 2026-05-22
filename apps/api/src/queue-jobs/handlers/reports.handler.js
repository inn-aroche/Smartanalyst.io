// Monthly reports handlers — STUB pour l'instant.
//
// Source: docs/20 §3, docs/18 (rapports PDF), docs/26 (feature rapports auto)
//
// Architecture fan-out:
//   1. scan-all-workspaces (cron mensuel le 1er à 6am UTC) → check report_day
//      + auto_send + timezone par workspace, enqueue un job par workspace éligible
//   2. generate-workspace: génère le PDF (Playwright), upload Storage, envoie email
//
// Sera complété avec le service PDF + Email.

const { logger } = require('../../lib/logger')
const workspaceService = require('../../services/workspaces/workspace.service')

async function scanAllWorkspaces({ reportsQueue }) {
  const workspaces = await workspaceService.listActive()
  const now = new Date()
  const dayOfMonth = now.getUTCDate()

  // MVP: tous en UTC, day_of_month doit matcher workspace.report_day
  // TODO: respect timezone par workspace (doc 01 §5.4)
  const eligible = workspaces.filter(
    (ws) => ws.auto_send === true && ws.report_day === dayOfMonth,
  )

  logger.info(
    {
      event: 'reports_scan_started',
      workspaceTotal: workspaces.length,
      eligibleCount: eligible.length,
      dayOfMonth,
    },
    'Scanning workspaces for monthly reports',
  )

  for (const ws of eligible) {
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const jobId = `report:${ws.id}:${period}`
    await reportsQueue.add('generate-workspace', { workspaceId: ws.id, period }, { jobId })
  }

  return { eligibleCount: eligible.length }
}

async function generateForWorkspace(job) {
  const { workspaceId, period } = job.data
  logger.info(
    { event: 'report_generation_stub', workspaceId, period },
    'Monthly report generation stub — to be implemented (doc 18)',
  )
  return { workspaceId, period, stub: true }
}

module.exports = { scanAllWorkspaces, generateForWorkspace }
