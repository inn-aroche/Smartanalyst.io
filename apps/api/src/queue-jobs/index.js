// Worker process entry point — `npm run worker`.
//
// Démarre tous les workers BullMQ + bootstrappe les schedules récurrents.
// Tourne dans un process séparé de l'API HTTP (peut être scalé horizontalement
// indépendamment).

require('dotenv').config()

const { validateEnv } = require('../lib/env-validator')
const { logger } = require('../lib/logger')
const { closeRedis } = require('../lib/redis')
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
  })

  process.on('uncaughtException', (err) => {
    logger.fatal({ event: 'worker_uncaught_exception', error: err.message, stack: err.stack })
    process.exit(1)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during worker startup:', err.message)
  process.exit(1)
})
