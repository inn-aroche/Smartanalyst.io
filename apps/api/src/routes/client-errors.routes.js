// Réception des erreurs JS du frontend (anti-écran blanc + crashes
// inattendus). On les log via logger.error → Sentry server-side les
// capture automatiquement (config dans instrument.js).
//
// Pourquoi un pont plutôt que @sentry/react côté front :
//   - +50kb gzip sur le bundle web
//   - On a déjà toute la pipeline Sentry côté API
//   - Pour la beta on veut juste "voir les crashes", pas du tracing
//     avancé. À migrer vers Sentry React quand on aura besoin de
//     replay/breadcrumbs/source maps en remote.
//
// Pas d'auth : le crash peut arriver AVANT le login (ex: bug dans
// l'AuthProvider). On garde le rate limit serré pour éviter le spam.

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')

const { runValidation } = require('../middleware/validation.middleware')
const { logger } = require('../lib/logger')
const { captureException } = require('../lib/sentry')

const router = express.Router()

const errorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 erreurs / minute / IP suffit largement
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many error reports.' } },
})

router.post(
  '/',
  errorLimiter,
  [
    body('message').isString().isLength({ min: 1, max: 2000 }),
    body('stack').optional().isString().isLength({ max: 8000 }),
    body('componentStack').optional().isString().isLength({ max: 8000 }),
    body('url').optional().isString().isLength({ max: 500 }),
    body('userAgent').optional().isString().isLength({ max: 500 }),
    body('userId').optional().isString().isLength({ max: 80 }),
  ],
  runValidation,
  (req, res) => {
    const { message, stack, componentStack, url, userAgent, userId } = req.body

    // Construit un objet Error pour Sentry (qui s'attend à un stack).
    const err = new Error(message)
    if (typeof stack === 'string') err.stack = stack

    captureException(err, {
      tags: { source: 'web-client' },
      extra: { componentStack, url, userAgent },
      user: userId ? { id: userId } : undefined,
    })

    // En double dans nos logs pino (Sentry l'aura aussi via captureException).
    logger.warn(
      {
        event: 'client_error',
        message,
        url,
        userAgent: userAgent?.slice(0, 200),
        userId,
        hasComponentStack: Boolean(componentStack),
      },
      'Web client error reported',
    )

    res.status(204).end()
  },
)

module.exports = router
