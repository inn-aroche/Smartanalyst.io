// OAuth state JWT: protège contre CSRF + transporte le contexte du flux
// d'ajout de connecteur jusqu'au callback.
//
// Source: pattern OAuth standard (RFC 6749 §10.12)
//
// State signé avec JWT_SECRET, TTL 5 min. Contient:
//   { userId, workspaceId, source, accountId, type: 'oauth_state' }

const jwt = require('jsonwebtoken')
const { UserFacingError } = require('../../lib/error-handler')

const STATE_TTL = '5m'
const STATE_TYPE = 'oauth_state'

function sign({ userId, workspaceId, source, accountId, accountName }) {
  return jwt.sign(
    {
      type: STATE_TYPE,
      userId,
      workspaceId,
      source,
      accountId: accountId || null,
      accountName: accountName || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: STATE_TTL },
  )
}

function verify(state) {
  if (!state) {
    throw new UserFacingError('State OAuth manquant ou invalide.', {
      statusCode: 400,
      code: 'OAUTH_STATE_MISSING',
    })
  }
  let decoded
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET)
  } catch (err) {
    throw new UserFacingError(
      err.name === 'TokenExpiredError'
        ? 'Le lien OAuth a expiré. Réessaie depuis le tableau de bord.'
        : 'State OAuth invalide.',
      { statusCode: 400, code: 'OAUTH_STATE_INVALID' },
    )
  }
  if (decoded.type !== STATE_TYPE) {
    throw new UserFacingError('Type de state OAuth incorrect.', {
      statusCode: 400,
      code: 'OAUTH_STATE_INVALID',
    })
  }
  return decoded
}

module.exports = { sign, verify }
