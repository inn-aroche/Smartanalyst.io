// Validation des variables d'environnement au démarrage.
// Source: docs/01_CONVENTIONS_GLOBALES.md §4.2
//
// Philosophie :
//   - REQUIRED       → l'app NE PEUT PAS faire son job sans (DB, Redis, JWT_SECRET).
//                      Si absent → throw au boot. Fail-fast.
//   - PRODUCTION_REQUIRED → idem mais critique seulement en prod (Stripe, Resend).
//   - RECOMMENDED    → features optionnelles qui dégradent gracieusement si absentes
//                      (Sentry no-op, OAuth providers désactivés, ADMIN_TOKEN
//                      = endpoints admin renvoient 503).
//
// Règle d'or : ne JAMAIS rendre REQUIRED un secret qui n'est pas nécessaire au
// boot du process Node lui-même. Sinon un secret manquant tue la prod entière
// alors qu'on pourrait juste désactiver une feature.

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'REDIS_URL',
]

const PRODUCTION_REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'APP_URL',
]

const RECOMMENDED_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'META_APP_ID',
  'META_APP_SECRET',
  'EMAIL_FROM',
  'GEMINI_MODEL',
  // Sentry — l'app boote sans (no-op silencieux), mais en prod sans Sentry
  // les erreurs partent au néant. Warning au boot pour le rappeler.
  'SENTRY_DSN',
  // ADMIN_TOKEN — protège /admin/queues/*. Si absent, ces endpoints répondent
  // 503 admin_disabled (fail-closed côté middleware). Le reste de l'API tourne.
  // PR follow-up de #38 : auparavant en PRODUCTION_REQUIRED, ce qui tuait la
  // prod si oublié. Remis en RECOMMENDED pour que la dégradation soit graceful.
  'ADMIN_TOKEN',
]

function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production'

  const required = isProduction ? [...REQUIRED_VARS, ...PRODUCTION_REQUIRED_VARS] : REQUIRED_VARS

  const missing = required.filter((name) => !process.env[name])

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        `See .env.example for the full list. Copy it to .env and fill the values.`,
    )
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long')
  }

  if (process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length < 32) {
    throw new Error('ADMIN_TOKEN must be at least 32 characters long')
  }

  // APP_URL pilote l'URL de redirection OAuth pour TOUS les providers (GA4,
  // Meta, Stripe, Shopify, etc.). Une URL mal-formée (typo, slash final,
  // protocole oublié) produit un redirect_uri silencieusement invalide :
  // Google répond 400 sans contexte, l'user voit "error" sans qu'on sache
  // pourquoi. On vérifie maintenant au boot pour fail-fast plutôt qu'à
  // chaque OAuth en prod.
  if (process.env.APP_URL) {
    let parsed
    try {
      parsed = new URL(process.env.APP_URL)
    } catch {
      throw new Error(
        `APP_URL is not a valid URL: "${process.env.APP_URL}". Expected something like https://app.smartanalyst.io (no trailing slash).`,
      )
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error(
        `APP_URL must use http:// or https:// (got "${parsed.protocol}"). Most OAuth providers reject other schemes.`,
      )
    }
    if (process.env.APP_URL.endsWith('/')) {
      throw new Error(
        `APP_URL must NOT end with a trailing slash (got "${process.env.APP_URL}"). The OAuth callback path is appended without normalization.`,
      )
    }
    if (isProduction && parsed.protocol === 'http:' && parsed.hostname !== 'localhost') {
      throw new Error(
        `APP_URL must use https in production (got "${process.env.APP_URL}"). OAuth providers reject http callbacks outside localhost.`,
      )
    }
  }

  // OAUTH_REDIRECT_URI override : mêmes contraintes (URL valide, pas de slash
  // final, https en prod).
  if (process.env.OAUTH_REDIRECT_URI) {
    let parsed
    try {
      parsed = new URL(process.env.OAUTH_REDIRECT_URI)
    } catch {
      throw new Error(`OAUTH_REDIRECT_URI is not a valid URL: "${process.env.OAUTH_REDIRECT_URI}".`)
    }
    if (isProduction && parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      throw new Error(
        `OAUTH_REDIRECT_URI must use https in production (got "${process.env.OAUTH_REDIRECT_URI}").`,
      )
    }
  }

  const missingRecommended = RECOMMENDED_VARS.filter((name) => !process.env[name])
  return {
    ok: true,
    missingRecommended,
  }
}

module.exports = { validateEnv, REQUIRED_VARS, RECOMMENDED_VARS }
