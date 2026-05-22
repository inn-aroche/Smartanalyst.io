// Express app setup.
// Sources: docs/02_BONNES_PRATIQUES_TRANSVERSALES.md §2.3 (rate limit), §2.4 (CORS),
//          docs/05_INFRASTRUCTURE_DEVOPS.md §5 (health endpoint)

const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const pinoHttp = require('pino-http')

const { logger } = require('./lib/logger')
const { errorHandler, notFoundHandler } = require('./middleware/error-handler.middleware')

function createApp() {
  const app = express()
  const isProduction = process.env.NODE_ENV === 'production'

  // Trust proxy headers en production (derrière Nginx)
  if (isProduction) {
    app.set('trust proxy', 1)
  }

  // HTTPS redirect en production
  if (isProduction) {
    app.use((req, res, next) => {
      if (req.header('x-forwarded-proto') !== 'https') {
        return res.redirect(`https://${req.header('host')}${req.url}`)
      }
      return next()
    })
  }

  // Request logging structuré
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
      // /health ne pollue pas les logs
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
    }),
  )

  // CORS restrictif (doc 02 §2.4)
  app.use(
    cors({
      origin: process.env.APP_URL || true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  // Body parsers (raw pour Stripe webhook plus tard, JSON pour le reste)
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))

  // Rate limit global (doc 02 §2.3) — 100 req / 15 min par IP
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT',
        message: 'Trop de requêtes. Réessaie dans quelques minutes.',
      },
    },
  })
  app.use('/api/', globalLimiter)

  // Health endpoint (doc 05 §5)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    })
  })

  // Placeholder root
  app.get('/', (req, res) => {
    res.json({ name: 'SmartAnalyst API', version: '0.1.0' })
  })

  // Routes
  app.use('/api/v1/auth', require('./routes/auth.routes'))
  // TODO: onboarding, connectors, chat, reports
  // app.use('/api/v1/onboarding', require('./routes/onboarding.routes'))
  // app.use('/api/v1/connectors', require('./routes/connectors.routes'))
  // app.use('/api/v1/chat', require('./routes/chat.routes'))
  // app.use('/api/v1/reports', require('./routes/reports.routes'))

  // 404 + error handler (toujours en dernier)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

module.exports = { createApp }
