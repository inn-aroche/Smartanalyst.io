// Queue definitions (BullMQ).
//
// Source: docs/20_QUEUE_SYSTEM_BULLMQ.md
//
// Convention: noms de queue en kebab-case, noms de job en kebab-case.
// Job names patterns:
//   - "scan-all"        - exécuté périodiquement, fan-out vers per-workspace jobs
//   - "process-<scope>" - travail réel sur une entité (workspace, connector...)

const { Queue, QueueEvents } = require('bullmq')
const { getRedis } = require('../lib/redis')

// Noms de queues (canoniques)
const QUEUE_NAMES = {
  DATA_SYNC: 'data-sync',
  INSIGHTS: 'insights-generation',
  REPORTS: 'monthly-reports',
  ALERTS: 'alert-check',
  OAUTH_REFRESH: 'oauth-refresh',
  NOTIFICATIONS: 'notifications',
}

// Noms de jobs (canoniques)
const JOB_NAMES = {
  // data-sync
  DATA_SYNC_SCAN: 'scan-all-workspaces',
  DATA_SYNC_WORKSPACE: 'sync-workspace',
  DATA_SYNC_CONNECTOR_BACKFILL: 'backfill-connector',
  // insights
  INSIGHTS_WORKSPACE: 'generate-workspace',
  // reports
  REPORTS_SCAN: 'scan-all-workspaces',
  REPORTS_WORKSPACE: 'generate-workspace',
  // alerts
  ALERTS_SCAN: 'scan-all-workspaces',
  ALERTS_WORKSPACE: 'check-workspace',
  // oauth-refresh
  OAUTH_REFRESH_SCAN: 'scan-expiring',
  OAUTH_REFRESH_ONE: 'refresh-token',
  // notifications (brief V2 §3.3)
  WEEKLY_DIGEST_SCAN: 'weekly-digest-scan',
  NOTIFICATIONS_CLEANUP: 'notifications-cleanup',
  // watches custom (brief V2 §3.3 — évaluation horaire)
  WATCHES_EVAL_SCAN: 'watches-eval-scan',
}

// Defaults appliqués à TOUS les jobs (idempotent par job grâce à jobId stable)
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 }, // garde 24h ou 1000 derniers
  removeOnFail: { age: 7 * 24 * 3600 }, // garde 7 jours pour debug
}

const queueCache = new Map()

function getQueue(name) {
  if (!Object.values(QUEUE_NAMES).includes(name)) {
    throw new Error(`Unknown queue: ${name}`)
  }
  if (!queueCache.has(name)) {
    const queue = new Queue(name, {
      connection: getRedis(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
    queueCache.set(name, queue)
  }
  return queueCache.get(name)
}

async function closeAll() {
  const closing = []
  for (const queue of queueCache.values()) {
    closing.push(queue.close())
  }
  queueCache.clear()
  await Promise.allSettled(closing)
}

module.exports = {
  QUEUE_NAMES,
  JOB_NAMES,
  DEFAULT_JOB_OPTIONS,
  getQueue,
  closeAll,
  QueueEvents,
}
