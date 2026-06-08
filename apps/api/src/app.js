// Express app setup.
// Sources: docs/02_BONNES_PRATIQUES_TRANSVERSALES.md §2.3 (rate limit), §2.4 (CORS),
//          docs/05_INFRASTRUCTURE_DEVOPS.md §5 (health endpoint)

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
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

  // Security headers (CSP, HSTS, X-Frame-Options, etc.) via helmet.
  // L'API ne sert pas de HTML : CSP par défaut 'none', frame-ancestors 'none'.
  // crossOriginEmbedderPolicy désactivé : casserait les redirections OAuth.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  )

  // Request logging structuré
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
      // /health* ne pollue pas les logs (uptime monitors les pollent ~1×/min)
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/health/ready',
      },
    }),
  )

  // CORS restrictif (doc 02 §2.4)
  // Resolution order:
  //   1. CORS_ALLOWED_ORIGINS (comma-separated) if set
  //   2. APP_URL fallback
  //   3. null → cors() allows any origin (dev only)
  // In production we always merge KNOWN_PRODUCTION_ORIGINS in, so the marketing
  // site and the web app stay allowed even if someone forgets to update the env
  // file when a new prod origin is added.
  const KNOWN_PRODUCTION_ORIGINS = [
    'https://smartanalyst.io',
    'https://www.smartanalyst.io',
    'https://app.smartanalyst.io',
  ]
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : process.env.APP_URL
      ? [process.env.APP_URL]
      : null
  const corsOrigins =
    configuredOrigins === null
      ? isProduction
        ? KNOWN_PRODUCTION_ORIGINS
        : null
      : Array.from(new Set([...configuredOrigins, ...(isProduction ? KNOWN_PRODUCTION_ORIGINS : [])]))
  app.use(
    cors({
      origin: corsOrigins ?? true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  // Webhooks signés cryptographiquement — DOIVENT être montés avant le
  // body parser JSON pour conserver le raw Buffer nécessaire à la
  // vérification de signature (Stripe HMAC).
  app.use('/api/v1/webhooks', require('./routes/webhooks.routes'))

  // Body parsers (JSON pour le reste de l'API)
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

  // Health endpoints — /health (liveness) + /health/ready (readiness DB+Redis).
  // Voir apps/api/src/routes/health.routes.js.
  app.use(require('./routes/health.routes'))

  // Admin queues (observabilité DLQ + retry manuel) — protégé par X-Admin-Token.
  // Exposé via Nginx /admin/queues/* qui proxy vers cet endpoint API.
  app.use(require('./routes/admin-queues.routes'))

  // Placeholder root
  app.get('/', (req, res) => {
    res.json({ name: 'SmartAnalyst API', version: '0.1.0' })
  })

  // Routes
  app.use('/api/v1/auth', require('./routes/auth.routes'))
  app.use('/api/v1/connectors', require('./routes/connectors.routes'))
  app.use('/api/v1/onboarding', require('./routes/onboarding.routes'))
  app.use('/api/v1/metrics', require('./routes/metrics.routes'))
  app.use('/api/v1/chat', require('./routes/chat.routes'))
  // SmartTag ingestion (publique, CORS *, rate-limit dédié — cf track.routes.js)
  app.use('/api/v1/track', require('./routes/track.routes'))
  // SmartTag dashboard (authentifié — status install, à enrichir)
  app.use('/api/v1/smarttag', require('./routes/smarttag.routes'))
  // M4 Phase D — Audit SEO/GEO on-demand
  app.use('/api/v1/audit', require('./routes/audit.routes'))
  // TODO: reports
  // app.use('/api/v1/reports', require('./routes/reports.routes'))

  // Sentry Express error handler — DOIT être avant les autres error handlers.
  // En v8+ du SDK, c'est `setupExpressErrorHandler` qui s'occupe d'attacher
  // l'auto-instrumentation et de capturer les exceptions remontées via next(err).
  const { enabled: sentryEnabled, Sentry } = require('./lib/sentry')
  if (sentryEnabled) {
    Sentry.setupExpressErrorHandler(app)
  }

  // 404 + error handler (toujours en dernier)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

module.exports = { createApp }
