// Handler évaluation watches (brief V2 §3.3 — alertes custom).
// Job unique scan-all : aucun fan-out par workspace (les watches sont peu
// nombreuses, on garde un seul job par tick d'évaluation horaire).

const { logger } = require('../../lib/logger')
const evaluator = require('../../services/watches/watch-evaluator.service')

async function watchesScanAll(job) {
  logger.info({ event: 'watches_scan_start', jobId: job.id }, 'Watches evaluation pass starting')
  const result = await evaluator.evaluateAllWorkspaces()
  return result
}

module.exports = { watchesScanAll }
