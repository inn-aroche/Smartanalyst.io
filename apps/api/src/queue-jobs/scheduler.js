// Scheduler: bootstrappe les jobs récurrents au démarrage du worker.
//
// Source: docs/20 §1 (cron expressions)
//
// Convention: tous les jobs récurrents utilisent un jobId stable pour
// l'idempotence (réajout du même schedule = pas de duplicate).

const { getQueue, QUEUE_NAMES, JOB_NAMES } = require('./queues')
const { logger } = require('../lib/logger')

const SCHEDULES = [
  {
    queueName: QUEUE_NAMES.DATA_SYNC,
    jobName: JOB_NAMES.DATA_SYNC_SCAN,
    pattern: '0 3 * * *', // 3h UTC quotidien
    description: 'Daily data sync — fan-out across all workspaces',
  },
  {
    queueName: QUEUE_NAMES.REPORTS,
    jobName: JOB_NAMES.REPORTS_SCAN,
    pattern: '0 6 * * *', // 6h UTC quotidien (le handler filtre par report_day)
    description: 'Daily check for monthly report generation',
  },
  {
    queueName: QUEUE_NAMES.ALERTS,
    jobName: JOB_NAMES.ALERTS_SCAN,
    pattern: '0 */4 * * *', // toutes les 4h UTC
    description: 'Anomaly + threshold check across all workspaces',
  },
  {
    queueName: QUEUE_NAMES.OAUTH_REFRESH,
    jobName: JOB_NAMES.OAUTH_REFRESH_SCAN,
    pattern: '15 */4 * * *', // toutes les 4h UTC, décalé de 15min pour étaler la charge
    description: 'OAuth token refresh — scan connectors expiring soon',
  },
  {
    queueName: QUEUE_NAMES.NOTIFICATIONS,
    jobName: JOB_NAMES.WEEKLY_DIGEST_SCAN,
    pattern: '0 8 * * 1', // lundi 8h UTC (brief V2 §3.3 "résumé du lundi matin")
    description: 'Weekly digest email — fan-out across all workspaces',
  },
  {
    queueName: QUEUE_NAMES.NOTIFICATIONS,
    jobName: JOB_NAMES.NOTIFICATIONS_CLEANUP,
    pattern: '0 2 * * *', // 2h UTC quotidien — supprime les notifs > 30j
    description: 'Notification TTL cleanup — purge old notifications',
  },
  {
    queueName: QUEUE_NAMES.ALERTS,
    jobName: JOB_NAMES.WATCHES_EVAL_SCAN,
    pattern: '0 * * * *', // toutes les heures (brief V2 §3.3 — alertes custom user)
    description: 'Custom watches evaluation across all workspaces',
  },
]

async function start() {
  for (const sched of SCHEDULES) {
    const queue = getQueue(sched.queueName)
    await queue.add(
      sched.jobName,
      {},
      {
        repeat: { pattern: sched.pattern, tz: 'UTC' },
        jobId: `repeat:${sched.queueName}:${sched.jobName}`, // déduplique entre redémarrages
      },
    )
    logger.info(
      {
        event: 'scheduler_registered',
        queue: sched.queueName,
        job: sched.jobName,
        pattern: sched.pattern,
      },
      `Scheduled: ${sched.description}`,
    )
  }
}

module.exports = { start, SCHEDULES }
