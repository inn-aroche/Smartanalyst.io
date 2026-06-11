// JWT middleware: extrait le Bearer, vérifie le token, attache req.user.
// Source: docs/07_API_AUTH_CONNEXION.md §5

const { AuthError, UserFacingError } = require('../lib/error-handler')
const { verifyToken } = require('../services/auth/jwt.utils')
const { isAllowedEmail } = require('../lib/beta-access')

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

    // Beta lockdown — coupe les JWTs émis à des emails non-whitelistés
    // (cas où on a ajouté un user au lockdown après émission de son token,
    // ou où un attaquant aurait dérobé un token). Voir lib/beta-access.js.
    if (!isAllowedEmail(req.user.email)) {
      return next(
        new UserFacingError(
          "SmartAnalyst est en beta privée. Tu peux rejoindre la waitlist sur smartanalyst.io/beta — on te recontacte au lancement.",
          { statusCode: 403, code: 'BETA_LOCKED' },
        ),
      )
    }

    return next()
  } catch (err) {
    return next(err)
  }
}

module.exports = { jwtMiddleware }
