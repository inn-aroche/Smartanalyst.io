// Redis connection (BullMQ + cache).
// Singleton: une seule connection partagée par tout le process.
// Source: docs/03_ARCHITECTURE_GLOBALE.md §1 (cache layer), docs/20_QUEUE_SYSTEM_BULLMQ.md

const Redis = require('ioredis')
const { logger } = require('./logger')

let connection = null

function getRedis() {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL, {
      // BullMQ exige maxRetriesPerRequest=null pour les blocking commands (BRPOPLPUSH etc.)
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    })

    connection.on('connect', () => logger.info({ event: 'redis_connected' }, 'Redis connected'))
    connection.on('error', (err) =>
      logger.error({ event: 'redis_error', error: err.message }, 'Redis error'),
    )
    connection.on('close', () =>
      logger.warn({ event: 'redis_closed' }, 'Redis connection closed'),
    )
  }
  return connection
}

async function closeRedis() {
  if (connection) {
    await connection.quit()
    connection = null
  }
}

module.exports = { getRedis, closeRedis }
