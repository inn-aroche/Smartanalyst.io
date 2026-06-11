// Beta lockdown — autorise uniquement les emails de la whitelist à accéder
// à la plateforme. Pour la période pré-launch où le SaaS n'est pas encore
// monétisé et qu'on ne veut pas qu'un user random s'inscrive et utilise
// gratuitement le produit sans billing setup.
//
// Activation
// ----------
// La whitelist est lue depuis env `BETA_ALLOWED_EMAILS` (comma-separated).
//   - Si la var est vide ou absente → pas de restriction (mode "ouvert", utile en dev)
//   - Si elle contient des emails → seuls ces emails peuvent signup/login/API
//
// Comparaison
// -----------
// Case-insensitive (les emails sont en lowercase dans la DB Supabase de toute
// façon, mais on normalise quoi qu'il arrive).
//
// Où c'est appliqué
// -----------------
// 1. POST /api/v1/auth/signup       → avant la création Supabase
// 2. POST /api/v1/auth/login        → avant validation password
// 3. GET  /api/v1/auth/google/callback → avant le bootstrap workspace
// 4. jwtMiddleware (toutes les routes authentifiées) → coupe les JWTs déjà
//    émis pour des emails qui n'auraient plus le droit. Belt and suspenders.
//
// Désactivation à la livraison du SaaS
// ------------------------------------
// Vider BETA_ALLOWED_EMAILS dans le .env prod → la whitelist se désactive
// automatiquement, signup/login redeviennent ouverts à tous.

function loadAllowedEmails() {
  return (process.env.BETA_ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function isLockdownActive() {
  return loadAllowedEmails().length > 0
}

function isAllowedEmail(email) {
  if (!isLockdownActive()) return true
  if (!email) return false
  return loadAllowedEmails().includes(email.toLowerCase())
}

/**
 * Throw un UserFacingError 403 BETA_LOCKED si l'email n'est pas dans
 * la whitelist active. À appeler depuis les services auth + le jwtMiddleware.
 *
 * Le message renvoyé est destiné à apparaître dans l'UI (Login form,
 * Signup form, page de blocage frontend). Lien vers la waitlist publique.
 */
function assertBetaAccess(email) {
  if (isAllowedEmail(email)) return
  const { UserFacingError } = require('./error-handler')
  throw new UserFacingError(
    "SmartAnalyst est en beta privée. Tu peux rejoindre la waitlist sur smartanalyst.io/beta — on te recontacte au lancement.",
    { statusCode: 403, code: 'BETA_LOCKED' },
  )
}

module.exports = {
  isLockdownActive,
  isAllowedEmail,
  assertBetaAccess,
}
