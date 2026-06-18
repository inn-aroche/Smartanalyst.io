// Handler évaluation watches (brief V2 §3.3 — alertes custom).
// Job unique scan-all : aucun fan-out par workspace (les watches sont peu
// nombreuses, on garde un seul job par tick d'évaluation horaire).

const { logger } = require('../../lib/logger')
const evaluator = require('../../services/watches/watch-evaluator.service')

// Fenêtre de jitter en millisecondes. Le cron étant '0 * * * *' (top of hour),
// tous les workers BullMQ démarrent le scan exactement à :00, ce qui crée un
// spike Redis + Supabase si on a beaucoup de workspaces avec des watches.
// Sleep aléatoire 0-300s en début de handler pour étaler la charge sur les
// 5 premières minutes de l'heure. Tests : JITTER_MAX_MS=0 désactive le sleep.
const JITTER_MAX_MS =
  process.env.WATCHES_JITTER_MS != null ? Number(process.env.WATCHES_JITTER_MS) : 5 * 60 * 1000

async function watchesScanAll(job) {
  if (JITTER_MAX_MS > 0) {
    const delayMs = Math.floor(Math.random() * JITTER_MAX_MS)
    logger.info(
      { event: 'watches_scan_jitter', jobId: job.id, delayMs },
      'Sleeping before scan to spread load',
    )
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  logger.info({ event: 'watches_scan_start', jobId: job.id }, 'Watches evaluation pass starting')
  const result = await evaluator.evaluateAllWorkspaces()
  return result
}

module.exports = { watchesScanAll }
