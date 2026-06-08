// Middleware d'auth pour les routes admin (/admin/*).
//
// Différent de l'auth user classique (JWT Supabase) : ici on protège des
// endpoints d'ops (consultation DLQ, retry de jobs morts). Le token est un
// secret long stocké en env, partagé manuellement par les opérateurs (toi).
//
// Choix vs JWT user :
//   - Pas de notion de "rôle admin" en DB → pas besoin de mettre en place
//     un système RBAC pour 3 endpoints internes
//   - Un seul token = un seul vecteur à révoquer si compromis
//   - L'endpoint n'est jamais appelé par le frontend SaaS → cookie/session
//     pas pertinent
//
// Sécurité :
//   - Bind via comparaison à durée constante (timingSafeEqual)
//   - Token ≥ 32 chars obligatoire au boot (validateEnv)
//   - Endpoint exposé via Nginx /admin/* (proxy vers API 3000), pourrait
//     bénéficier d'une IP allow-list Nginx si besoin (pas activé MVP).
//   - Logs : chaque tentative ratée loggée WARN avec IP, chaque succès INFO.

const crypto = require('node:crypto')
const { logger } = require('../lib/logger')

function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_TOKEN
  if (!expected || expected.length < 32) {
    // Fail-closed : si le token n'est pas configuré côté serveur, on refuse
    // tout au lieu de laisser passer "par défaut".
    logger.error(
      { event: 'admin_token_misconfigured', path: req.path },
      'ADMIN_TOKEN not configured — admin endpoints refused',
    )
    return res.status(503).json({ error: 'admin_disabled' })
  }

  const provided = req.header('X-Admin-Token') || ''
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    logger.warn(
      { event: 'admin_auth_failed', ip: req.ip, path: req.path, method: req.method },
      'Admin auth failed',
    )
    return res.status(403).json({ error: 'forbidden' })
  }

  logger.info(
    { event: 'admin_auth_ok', ip: req.ip, path: req.path, method: req.method },
    'Admin endpoint accessed',
  )
  next()
}

module.exports = { requireAdminToken }
