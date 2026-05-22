// JWT middleware: extrait le Bearer, vérifie le token, attache req.user.
// Source: docs/07_API_AUTH_CONNEXION.md §5

const { AuthError } = require('../lib/error-handler')
const { verifyToken } = require('../services/auth/jwt.utils')

function jwtMiddleware(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthError('Token manquant. Connecte-toi.'))
  }

  const token = authHeader.substring('Bearer '.length).trim()

  try {
    const decoded = verifyToken(token, 'access')
    req.user = {
      id: decoded.sub,
      email: decoded.email,
    }
    return next()
  } catch (err) {
    return next(err)
  }
}

module.exports = { jwtMiddleware }
