// Worker process entry point — `npm run worker`.
//
// Démarre tous les workers BullMQ + bootstrappe les schedules récurrents.
// Tourne dans un process séparé de l'API HTTP (peut être scalé horizontalement
// indépendamment).

// MUST be first — voir apps/api/src/instrument.js. Tag service=worker pour
// que Sentry sépare les events worker des events API dans le dashboard.
process.env.SENTRY_SERVICE_TAG = 'worker'
require('../instrument')

require('dotenv').config()

const { validateEnv } = require('../lib/env-validator')
const { logger } = require('../lib/logger')
const { closeRedis } = require('../lib/redis')
const { captureException, flush: sentryFlush } = require('../lib/sentry')
const workers = require('./workers')
const scheduler = require('./scheduler')
const { closeAll: closeAllQueues } = require('./queues')

async function main() {
  validateEnv()

  workers.start()
  await scheduler.start()

  logger.info({ event: 'worker_process_ready' }, 'SmartAnalyst worker process is ready')

  const shutdown = async (signal) => {
    logger.info({ event: 'worker_shutdown', signal }, 'Shutting down worker...')
    try {
      await workers.closeAll()
      await closeAllQueues()
      await closeRedis()
    } catch (err) {
      logger.error({ error: err.message }, 'Error during worker shutdown')
    }
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'worker_unhandled_rejection', reason: String(reason) }, 'Unhandled rejection in worker')
    captureException(reason instanceof Error ? reason : new Error(String(reason)), {
      tags: { kind: 'unhandled_rejection', service: 'worker' },
    })
  })

  process.on('uncaughtException', async (err) => {
    logger.fatal({ event: 'worker_uncaught_exception', error: err.message, stack: err.stack })
    captureException(err, { tags: { kind: 'uncaught_exception', service: 'worker' }, level: 'fatal' })
    await sentryFlush(2000)
    process.exit(1)
  })
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during worker startup:', err.message)
  captureException(err, { tags: { kind: 'startup_error', service: 'worker' }, level: 'fatal' })
  await sentryFlush(2000)
  process.exit(1)
})
