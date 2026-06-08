// Dead Letter Queue helpers — gestion des jobs BullMQ qui ont épuisé leurs
// retries.
//
// Pourquoi
// --------
// BullMQ retry les jobs N fois (configuré dans DEFAULT_JOB_OPTIONS.attempts).
// Quand tous les retries sont épuisés, le job passe en état "failed" et reste
// dans Redis (gardé 7 jours par removeOnFail). Mais sans observabilité, ces
// jobs morts disparaissent en silence :
//   - Pas d'alerte Sentry (le worker.on('failed') log juste, pas de capture)
//   - Pas de visibilité sur le volume de fails dans une fenêtre récente
//   - Pas de moyen de rejouer un job spécifique sans toucher à redis-cli
//
// Ce module fournit :
//   - recordFinalFailure : capture Sentry + increment compteur sliding window
//   - getRecentFailureCount : combien de fails dans la dernière heure
//   - hasFailureBurst : détecte un pic anormal (> seuil sur 1h)
//   - Helpers pour list/retry/remove depuis les routes admin

const { getRedis } = require('./redis')
const { captureException, captureMessage } = require('./sentry')
const { logger } = require('./logger')

// Fenêtre par défaut pour le sliding window : 1 heure.
const DEFAULT_WINDOW_SECONDS = 3600

// Seuil de burst : > 10 jobs failed dans la fenêtre = pattern anormal.
// On envoie un Sentry "level=error" avec tag `alert=dlq_burst` pour qu'une
// alerte Slack / email configurée côté Sentry trigger.
const BURST_THRESHOLD = 10

// Préfixe Redis pour le compteur sliding window (séparé des clés BullMQ).
const COUNTER_KEY_PREFIX = 'dlq:failures'

/**
 * Enregistre un échec final de job (= tous les retries épuisés).
 *
 * Action en chaîne :
 *   1. captureException Sentry avec tags business
 *   2. ZADD timestamp dans un sorted set Redis (sliding window)
 *   3. Si le count dans la fenêtre dépasse BURST_THRESHOLD → captureMessage
 *      "burst de fails" avec level=error, tag alert=dlq_burst
 *
 * @param {object} params
 * @param {string} params.queueName - nom de la queue BullMQ
 * @param {string} params.jobName - nom du job (canonical)
 * @param {string|number} params.jobId - id du job
 * @param {Error} params.error - l'erreur finale
 * @param {object} [params.jobData] - data du job (pour Sentry extra)
 * @param {number} [params.attemptsMade] - nb de tentatives faites
 */
async function recordFinalFailure({ queueName, jobName, jobId, error, jobData, attemptsMade }) {
  // 1. Sentry capture explicite.
  captureException(error, {
    tags: {
      kind: 'job_final_failure',
      queue: queueName,
      jobName,
      service: 'worker',
    },
    extra: {
      jobId: String(jobId),
      attemptsMade,
      jobData: jobData ? JSON.stringify(jobData).slice(0, 2000) : undefined,
    },
    level: 'error',
  })

  // 2. Increment sliding window counter.
  const counterKey = `${COUNTER_KEY_PREFIX}:${queueName}`
  const now = Date.now()
  const windowStart = now - DEFAULT_WINDOW_SECONDS * 1000
  try {
    const redis = getRedis()
    // Pipeline pour atomicité minimale (un seul round-trip Redis).
    await redis
      .multi()
      .zadd(counterKey, now, `${jobId}:${now}`)
      .zremrangebyscore(counterKey, 0, windowStart)
      .expire(counterKey, DEFAULT_WINDOW_SECONDS * 2)
      .exec()

    const recentCount = await redis.zcard(counterKey)

    // 3. Si seuil dépassé → alerte burst.
    if (recentCount >= BURST_THRESHOLD) {
      logger.error(
        {
          event: 'dlq_burst_detected',
          queue: queueName,
          count: recentCount,
          window: DEFAULT_WINDOW_SECONDS,
        },
        `DLQ burst detected: ${recentCount} failures in last ${DEFAULT_WINDOW_SECONDS / 60} min`,
      )
      captureMessage(
        `DLQ burst on queue "${queueName}": ${recentCount} jobs failed in last hour`,
        'error',
        {
          tags: {
            alert: 'dlq_burst',
            queue: queueName,
            service: 'worker',
          },
          extra: { count: recentCount, windowSeconds: DEFAULT_WINDOW_SECONDS },
        },
      )
    }
  } catch (redisErr) {
    // L'erreur de tracking ne doit pas masquer l'erreur originale du job.
    logger.warn(
      { event: 'dlq_tracking_failed', error: redisErr.message },
      'Failed to track DLQ failure (non-fatal)',
    )
  }
}

/**
 * Retourne le nombre de jobs failed dans la fenêtre récente pour une queue.
 * Utilisé par l'endpoint admin /admin/queues/:name/stats.
 */
async function getRecentFailureCount(queueName, windowSeconds = DEFAULT_WINDOW_SECONDS) {
  const counterKey = `${COUNTER_KEY_PREFIX}:${queueName}`
  const windowStart = Date.now() - windowSeconds * 1000
  try {
    const redis = getRedis()
    await redis.zremrangebyscore(counterKey, 0, windowStart)
    return await redis.zcard(counterKey)
  } catch (err) {
    logger.warn(
      { event: 'dlq_count_failed', queue: queueName, error: err.message },
      'Failed to read DLQ counter',
    )
    return null
  }
}

/**
 * Liste les jobs failed récents d'une queue. Délègue à BullMQ.
 * @param {import('bullmq').Queue} queue
 * @param {number} [limit=20]
 */
async function listFailedJobs(queue, limit = 20) {
  const jobs = await queue.getFailed(0, Math.max(0, limit - 1))
  return jobs.map((job) => ({
    id: job.id,
    name: job.name,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
    stacktrace: Array.isArray(job.stacktrace) ? job.stacktrace.slice(0, 3) : undefined,
  }))
}

/**
 * Re-enqueue un job failed (relance ses retries depuis zéro).
 */
async function retryFailedJob(queue, jobId) {
  const job = await queue.getJob(jobId)
  if (!job) return { ok: false, error: 'job_not_found' }
  const state = await job.getState()
  if (state !== 'failed') return { ok: false, error: 'not_in_failed_state', state }
  await job.retry()
  return { ok: true, jobId, jobName: job.name }
}

/**
 * Supprime un job failed (sans le rejouer).
 */
async function removeFailedJob(queue, jobId) {
  const job = await queue.getJob(jobId)
  if (!job) return { ok: false, error: 'job_not_found' }
  await job.remove()
  return { ok: true, jobId }
}

module.exports = {
  recordFinalFailure,
  getRecentFailureCount,
  listFailedJobs,
  retryFailedJob,
  removeFailedJob,
  BURST_THRESHOLD,
  DEFAULT_WINDOW_SECONDS,
}
