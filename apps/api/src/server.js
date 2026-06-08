// Entry point: charge .env, valide les vars, démarre le serveur HTTP, gère le shutdown.
// Source: docs/01_CONVENTIONS_GLOBALES.md §4.2

// MUST be first — Sentry instrument OpenTelemetry doit s'attacher avant tout
// autre require (express, ioredis, supabase…). Voir apps/api/src/instrument.js.
require('./instrument')

require('dotenv').config()

const { validateEnv } = require('./lib/env-validator')
const { logger } = require('./lib/logger')
const { closeRedis } = require('./lib/redis')
const { captureException, flush: sentryFlush } = require('./lib/sentry')

async function main() {
  const { missingRecommended } = validateEnv()

  if (missingRecommended.length > 0) {
    logger.warn(
      { event: 'env_recommended_missing', vars: missingRecommended },
      'Some recommended env vars are not set — related features will be disabled',
    )
  }

  // Import APRES validateEnv pour s'assurer que les clients lazy-init voient les vars
  const { createApp } = require('./app')
  const { attachWsServer } = require('./lib/ws-server')
  const app = createApp()

  const port = Number(process.env.PORT) || 3000
  const server = app.listen(port, () => {
    logger.info(
      {
        event: 'server_started',
        port,
        env: process.env.NODE_ENV || 'development',
      },
      `SmartAnalyst API listening on port ${port}`,
    )
  })

  // WebSocket server pour le dashboard temps-réel /live (cf docs SmartTag).
  // Réutilise le même HTTP server pour partager port + TLS termination.
  attachWsServer(server)

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ event: 'shutdown_initiated', signal }, 'Shutting down...')

    server.close(async (err) => {
      if (err) {
        logger.error({ error: err.message }, 'Error closing server')
        process.exit(1)
      }

      try {
        await closeRedis()
      } catch (e) {
        logger.error({ error: e.message }, 'Error closing Redis')
      }

      logger.info({ event: 'shutdown_complete' }, 'Bye')
      process.exit(0)
    })

    // Hard exit si le shutdown traîne au-delà de 10s
    setTimeout(() => {
      logger.error({ event: 'shutdown_timeout' }, 'Forcing shutdown')
      process.exit(1)
    }, 10000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'unhandled_rejection', reason: String(reason) }, 'Unhandled rejection')
    captureException(reason instanceof Error ? reason : new Error(String(reason)), {
      tags: { kind: 'unhandled_rejection' },
    })
  })

  process.on('uncaughtException', async (err) => {
    logger.fatal({ event: 'uncaught_exception', error: err.message, stack: err.stack }, 'Uncaught exception')
    captureException(err, { tags: { kind: 'uncaught_exception' }, level: 'fatal' })
    // Best-effort flush avant exit, sinon l'event reste en mémoire.
    await sentryFlush(2000)
    process.exit(1)
  })
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during startup:', err.message)
  captureException(err, { tags: { kind: 'startup_error' }, level: 'fatal' })
  await sentryFlush(2000)
  process.exit(1)
})
