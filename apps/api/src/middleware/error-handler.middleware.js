// Middleware Express d'erreur global.
// - UserFacingError → message FR renvoyé au user
// - Sinon → 500 générique + log avec stack
// Source: docs/01_CONVENTIONS_GLOBALES.md §3.2

const { logger } = require('../lib/logger')
const { UserFacingError } = require('../lib/error-handler')
const { captureException } = require('../lib/sentry')

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: "Cet endpoint n'existe pas.",
    },
  })
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof UserFacingError) {
    logger.warn(
      {
        event: 'user_facing_error',
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        meta: err.meta,
      },
      err.message,
    )
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    })
  }

  // Erreur inattendue → 500 + log complet (sans exposer le stack au user)
  logger.error(
    {
      event: 'internal_error',
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack,
    },
    'Unhandled error',
  )

  // Report à Sentry — no-op si DSN absent (dev local).
  // Sentry.setupExpressErrorHandler() est censé le faire automatiquement,
  // mais on double-capture explicitement avec des tags business utiles.
  captureException(err, {
    tags: { route: `${req.method} ${req.route?.path || req.path}` },
    extra: { method: req.method, path: req.path },
    user: req.user?.id ? { id: req.user.id } : undefined,
  })

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: "Une erreur inattendue est survenue. Réessaie dans quelques instants.",
    },
  })
}

module.exports = { errorHandler, notFoundHandler }
