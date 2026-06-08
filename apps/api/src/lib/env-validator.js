// Validation des variables d'environnement au démarrage.
// Source: docs/01_CONVENTIONS_GLOBALES.md §4.2

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
  // Admin token pour /admin/queues/* — sans ça les endpoints répondent 503.
  // Fail-fast au boot prod plutôt que de découvrir le souci au 1er incident.
  'ADMIN_TOKEN',
]

const RECOMMENDED_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'META_APP_ID',
  'META_APP_SECRET',
  'EMAIL_FROM',
  'GEMINI_MODEL',
  // Observability — l'app boote sans, mais les erreurs prod doivent partir
  // quelque part. SENTRY_DSN manquant en prod = warning au démarrage.
  'SENTRY_DSN',
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
