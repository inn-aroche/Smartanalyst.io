// Request ID middleware — pose un identifiant stable par requête, propagé
// dans les logs, Sentry et le header de réponse `X-Request-Id`.
//
// Pourquoi : quand un user se plaint d'un bug ("le chat a planté à 14h32"),
// avoir un ID stable qui apparaît dans tous les logs (entrée Express,
// erreur Gemini, audit, Sentry) permet de retrouver la trace en 30s au
// lieu de fouiller par timestamp.
//
// Le client peut aussi passer son propre `X-Request-Id` (corrélation
// front/back). On valide qu'il ressemble à un UUID — sinon on régénère
// pour éviter qu'un client malicieux injecte des chaînes arbitraires
// dans nos logs.

const { randomUUID } = require('crypto')

// UUID v4 strict — pas de support de v1/v6/v7 (pas besoin).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id']
  const id = typeof incoming === 'string' && UUID_RE.test(incoming) ? incoming : randomUUID()
  req.requestId = id
  res.setHeader('X-Request-Id', id)
  next()
}

module.exports = { requestId, UUID_RE }
