// JWT helpers: access (15min) + refresh (7d) tokens.
// Source: docs/02 §2.2, docs/07 §2

const jwt = require('jsonwebtoken')
const { AuthError } = require('../../lib/error-handler')

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'

function signAccessToken({ userId, email }) {
  return jwt.sign(
    { sub: userId, email, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  )
}

function signRefreshToken({ userId }) {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL },
  )
}

/**
 * Verifies a token and asserts its type ('access' | 'refresh').
 * Throws AuthError (401) with a French user-facing message.
 */
function verifyToken(token, expectedType) {
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthError('Ta session a expiré. Reconnecte-toi.')
    }
    throw new AuthError('Token invalide.')
  }

  if (decoded.type !== expectedType) {
    throw new AuthError('Type de token incorrect.')
  }
  return decoded
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
}
