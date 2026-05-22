// Validation des variables d'environnement au démarrage.
// Source: docs/01_CONVENTIONS_GLOBALES.md §4.2

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET',
  'ANTHROPIC_API_KEY',
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
  'AI_FAST_MODEL',
  'AI_SMART_MODEL',
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

  const missingRecommended = RECOMMENDED_VARS.filter((name) => !process.env[name])
  return {
    ok: true,
    missingRecommended,
  }
}

module.exports = { validateEnv, REQUIRED_VARS, RECOMMENDED_VARS }
