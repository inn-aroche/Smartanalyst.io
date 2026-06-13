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
    pattern: '0 */4 * * *', // toutes les 4h UTC — bon ratio quota providers / fraîcheur
    description: 'Data sync — fan-out across all workspaces every 4h',
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
]

async function start() {
  for (const sched of SCHEDULES) {
    const queue = getQueue(sched.queueName)
    await queue.add(sched.jobName, {}, {
      repeat: { pattern: sched.pattern, tz: 'UTC' },
      jobId: `repeat:${sched.queueName}:${sched.jobName}`, // déduplique entre redémarrages
    })
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
