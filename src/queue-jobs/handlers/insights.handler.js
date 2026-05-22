// Insights generation handler — STUB pour l'instant.
//
// Sera implémenté avec le service AI Insights (doc 16).
// Trigger: après chaque data-sync workspace succès.

const { logger } = require('../../lib/logger')

async function generateForWorkspace(job) {
  const { workspaceId } = job.data
  logger.info(
    { event: 'insights_generation_stub', workspaceId },
    'Insights generation stub — to be implemented (doc 16)',
  )
  return { workspaceId, stub: true, insightsCount: 0 }
}

module.exports = { generateForWorkspace }
