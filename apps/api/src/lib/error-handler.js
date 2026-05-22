// Classes d'erreur typées.
// UserFacingError → message renvoyé tel quel au user (français, actionnable).
// Sinon → 500 générique + log côté serveur.
// Source: docs/01_CONVENTIONS_GLOBALES.md §3.2

class UserFacingError extends Error {
  constructor(message, { statusCode = 400, code = 'USER_ERROR', meta = {} } = {}) {
    super(message)
    this.name = 'UserFacingError'
    this.statusCode = statusCode
    this.code = code
    this.meta = meta
  }
}

class AuthError extends UserFacingError {
  constructor(message = 'Authentification requise.', meta = {}) {
    super(message, { statusCode: 401, code: 'AUTH_REQUIRED', meta })
    this.name = 'AuthError'
  }
}

class ForbiddenError extends UserFacingError {
  constructor(message = "Tu n'as pas accès à cette ressource.", meta = {}) {
    super(message, { statusCode: 403, code: 'FORBIDDEN', meta })
    this.name = 'ForbiddenError'
  }
}

class NotFoundError extends UserFacingError {
  constructor(message = 'Ressource introuvable.', meta = {}) {
    super(message, { statusCode: 404, code: 'NOT_FOUND', meta })
    this.name = 'NotFoundError'
  }
}

class RateLimitError extends UserFacingError {
  constructor(message = 'Trop de requêtes. Réessaie dans quelques instants.', meta = {}) {
    super(message, { statusCode: 429, code: 'RATE_LIMIT', meta })
    this.name = 'RateLimitError'
  }
}

module.exports = {
  UserFacingError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
}
