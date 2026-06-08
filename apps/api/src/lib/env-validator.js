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

  const required = isProduction
    ? [...REQUIRED_VARS, ...PRODUCTION_REQUIRED_VARS]
    : REQUIRED_VARS

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

  const missingRecommended = RECOMMENDED_VARS.filter((name) => !process.env[name])
  return {
    ok: true,
    missingRecommended,
  }
}

module.exports = { validateEnv, REQUIRED_VARS, RECOMMENDED_VARS }
