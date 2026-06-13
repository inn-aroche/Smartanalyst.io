// Workers: bindings handler → queue.
//
// Une Worker BullMQ par queue. Chaque Worker dispatch sur le jobName.
//
// Source: docs/20 §"Worker Implementation"

const { Worker } = require('bullmq')
const { getRedis } = require('../lib/redis')
const { logger } = require('../lib/logger')
const { QUEUE_NAMES, JOB_NAMES, getQueue } = require('./queues')
const { recordFinalFailure } = require('../lib/dlq')

const syncHandler = require('./handlers/sync.handler')
const insightsHandler = require('./handlers/insights.handler')
const reportsHandler = require('./handlers/reports.handler')
const alertsHandler = require('./handlers/alerts.handler')
const oauthRefreshHandler = require('./handlers/oauth-refresh.handler')

const workerInstances = []

function wireWorker(queueName, processor) {
  const worker = new Worker(queueName, processor, {
    connection: getRedis(),
    concurrency: 4,
  })

  worker.on('completed', (job, result) => {
    logger.info(
      {
        event: 'job_completed',
        queue: queueName,
        jobName: job.name,
        jobId: job.id,
        result: typeof result === 'object' ? result : undefined,
      },
      'Job completed',
    )
  })

  worker.on('failed', async (job, err) => {
    // Distinction transient (retry à venir) vs final (épuisé).
    // BullMQ ne fournit pas de flag direct, on déduit depuis attemptsMade.
    // attemptsMade = nb de fois où le job a été tenté (incrémenté à chaque échec).
    // opts.attempts = max total. Si attemptsMade >= attempts → final.
    const maxAttempts = job?.opts?.attempts ?? 1
    const attemptsMade = job?.attemptsMade ?? 0
    const isFinal = attemptsMade >= maxAttempts

    logger.error(
      {
        event: isFinal ? 'job_final_failure' : 'job_transient_failure',
        queue: queueName,
        jobName: job?.name,
        jobId: job?.id,
        attemptsMade,
        maxAttempts,
        error: err.message,
      },
      isFinal ? 'Job failed (final, will not retry)' : 'Job failed (will retry)',
    )

    // Sentry capture UNIQUEMENT sur fail final — sinon spam pendant les retries
    // transients qui sont attendus et normaux.
    if (isFinal && job) {
      await recordFinalFailure({
        queueName,
        jobName: job.name,
        jobId: job.id,
        error: err,
        jobData: job.data,
        attemptsMade,
      })
    }
  })

  worker.on('error', (err) => {
    logger.error({ event: 'worker_error', queue: queueName, error: err.message }, 'Worker error')
  })

  workerInstances.push(worker)
  return worker
}

function start() {
  // ━━━ data-sync ━━━
  wireWorker(QUEUE_NAMES.DATA_SYNC, async (job) => {
    if (job.name === JOB_NAMES.DATA_SYNC_SCAN) {
      const dataSyncQueue = getQueue(QUEUE_NAMES.DATA_SYNC)
      return syncHandler.scanAllWorkspaces({ dataSyncQueue })
    }
    if (job.name === JOB_NAMES.DATA_SYNC_WORKSPACE) {
      const result = await syncHandler.syncWorkspace(job)
      // Trigger insights generation
      const insightsQueue = getQueue(QUEUE_NAMES.INSIGHTS)
      await insightsQueue.add(
        JOB_NAMES.INSIGHTS_WORKSPACE,
        { workspaceId: job.data.workspaceId },
        { jobId: `insights:${job.data.workspaceId}:${Date.now()}` },
      )
      return result
    }
    throw new Error(`Unknown job in data-sync queue: ${job.name}`)
  })

  // ━━━ insights-generation ━━━
  wireWorker(QUEUE_NAMES.INSIGHTS, async (job) => {
    if (job.name === JOB_NAMES.INSIGHTS_WORKSPACE) {
      return insightsHandler.generateForWorkspace(job)
    }
    throw new Error(`Unknown job in insights queue: ${job.name}`)
  })

  // ━━━ monthly-reports ━━━
  wireWorker(QUEUE_NAMES.REPORTS, async (job) => {
    if (job.name === JOB_NAMES.REPORTS_SCAN) {
      const reportsQueue = getQueue(QUEUE_NAMES.REPORTS)
      return reportsHandler.scanAllWorkspaces({ reportsQueue })
    }
    if (job.name === JOB_NAMES.REPORTS_WORKSPACE) {
      return reportsHandler.generateForWorkspace(job)
    }
    throw new Error(`Unknown job in reports queue: ${job.name}`)
  })

  // ━━━ alert-check ━━━
  wireWorker(QUEUE_NAMES.ALERTS, async (job) => {
    if (job.name === JOB_NAMES.ALERTS_SCAN) {
      const alertsQueue = getQueue(QUEUE_NAMES.ALERTS)
      return alertsHandler.scanAllWorkspaces({ alertsQueue })
    }
    if (job.name === JOB_NAMES.ALERTS_WORKSPACE) {
      return alertsHandler.checkWorkspace(job)
    }
    throw new Error(`Unknown job in alerts queue: ${job.name}`)
  })

  // ━━━ oauth-refresh ━━━
  // Scan proactif des connectors OAuth dont le token expire bientôt + refresh.
  // Voir handlers/oauth-refresh.handler.js pour le rationale.
  wireWorker(QUEUE_NAMES.OAUTH_REFRESH, async (job) => {
    if (job.name === JOB_NAMES.OAUTH_REFRESH_SCAN) {
      const refreshQueue = getQueue(QUEUE_NAMES.OAUTH_REFRESH)
      return oauthRefreshHandler.scanExpiringConnectors({ refreshQueue })
    }
    if (job.name === JOB_NAMES.OAUTH_REFRESH_ONE) {
      return oauthRefreshHandler.refreshOne(job)
    }
    throw new Error(`Unknown job in oauth-refresh queue: ${job.name}`)
  })

  logger.info({ event: 'workers_started', count: workerInstances.length }, 'Workers ready')
}

async function closeAll() {
  await Promise.allSettled(workerInstances.map((w) => w.close()))
  workerInstances.length = 0
}

module.exports = { start, closeAll }
