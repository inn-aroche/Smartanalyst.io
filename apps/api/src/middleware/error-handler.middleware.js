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

/**
 * Extrait le workspaceId de la requête où qu'il soit posé (body, query,
 * params). Utilisé pour tagger les erreurs Sentry et les logs avec le
 * workspace concerné — quand un user remonte "ça plante", on retrouve
 * la trace en une recherche.
 */
function extractWorkspaceId(req) {
  return req.body?.workspaceId || req.query?.workspaceId || req.params?.workspaceId || null
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const workspaceId = extractWorkspaceId(req)
  const requestId = req.requestId || null
  const userId = req.user?.id || null

  // Guard SSE : si la réponse a déjà commencé (streaming chat avec headers
  // flushés + chunks écrits), on ne peut PLUS envoyer un body JSON sinon
  // Express throw ERR_HTTP_HEADERS_SENT et pollue les logs. On log quand même
  // l'erreur métier, et on close la connexion proprement.
  if (res.headersSent) {
    logger.warn(
      {
        event: 'error_after_headers_sent',
        path: req.path,
        method: req.method,
        workspaceId,
        userId,
        requestId,
        error: err.message,
        isUserFacing: err instanceof UserFacingError,
      },
      'Error raised after response headers were sent — closing connection silently',
    )
    try {
      res.end()
    } catch {
      // socket déjà fermée
    }
    return
  }

  if (err instanceof UserFacingError) {
    logger.warn(
      {
        event: 'user_facing_error',
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        workspaceId,
        userId,
        requestId,
        meta: err.meta,
      },
      err.message,
    )
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        // requestId exposé au client pour pouvoir le coller dans un ticket
        // support — récupération de la trace en O(1) côté serveur.
        requestId,
      },
    })
  }

  // Erreur inattendue → 500 + log complet (sans exposer le stack au user)
  logger.error(
    {
      event: 'internal_error',
      path: req.path,
      method: req.method,
      workspaceId,
      userId,
      requestId,
      error: err.message,
      stack: err.stack,
    },
    'Unhandled error',
  )

  // Report à Sentry — no-op si DSN absent (dev local).
  // Sentry.setupExpressErrorHandler() est censé le faire automatiquement,
  // mais on double-capture explicitement avec des tags business utiles.
  // workspaceId + requestId permettent de filtrer/grouper côté Sentry.
  captureException(err, {
    tags: {
      route: `${req.method} ${req.route?.path || req.path}`,
      workspace_id: workspaceId || 'none',
      request_id: requestId || 'none',
    },
    extra: { method: req.method, path: req.path, workspaceId, requestId },
    user: userId ? { id: userId } : undefined,
  })

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur inattendue est survenue. Réessaie dans quelques instants.',
      requestId,
    },
  })
}

module.exports = { errorHandler, notFoundHandler }
