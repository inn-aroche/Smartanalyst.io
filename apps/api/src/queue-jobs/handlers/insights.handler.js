// Insights generation handler.
//
// Trigger : après chaque data-sync workspace réussi (cf workers.js).
// Délègue au moteur d'insights (Structured Output Gemini).

const { logger } = require('../../lib/logger')
const insightEngine = require('../../services/insights/insight-engine.service')

async function generateForWorkspace(job) {
  const { workspaceId } = job.data
  const result = await insightEngine.generateForWorkspace(workspaceId)
  logger.info(
    { event: 'insights_generation_done', workspaceId, ...result },
    'Insights generation done',
  )
  return { workspaceId, ...result }
}

module.exports = { generateForWorkspace }
