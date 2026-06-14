// Handler résumé hebdomadaire (brief V2 §3.3).
// Scan tous les workspaces actifs, envoie un digest à chacun (séquentiel —
// volume beta faible ; fan-out possible plus tard si besoin).

const { logger } = require('../../lib/logger')
const workspaceService = require('../../services/workspaces/workspace.service')
const digestService = require('../../services/notifications/digest.service')

async function weeklyDigestScan() {
  const workspaces = await workspaceService.listActive()
  let sent = 0
  let skipped = 0
  for (const ws of workspaces) {
    try {
      const r = await digestService.sendWeeklyDigest(ws.id)
      if (r.sent) sent++
      else skipped++
    } catch (err) {
      skipped++
      logger.warn(
        { event: 'weekly_digest_workspace_failed', workspaceId: ws.id, error: err.message },
        'Weekly digest failed for workspace (continuing)',
      )
    }
  }
  logger.info(
    { event: 'weekly_digest_scan_done', total: workspaces.length, sent, skipped },
    'Weekly digest scan done',
  )
  return { total: workspaces.length, sent, skipped }
}

module.exports = { weeklyDigestScan }
