// Tests du validateEnv — s'assure qu'un secret optionnel absent ne tue PAS
// la prod (régression de la PR #38 qui avait mis ADMIN_TOKEN en
// PRODUCTION_REQUIRED → crash loop en prod).

const test = require('node:test')
const assert = require('node:assert/strict')

const ENV_VALIDATOR_PATH = require.resolve('../src/lib/env-validator')

function snapshotEnv() {
  const keys = [
    'NODE_ENV',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_ANON_KEY',
    'JWT_SECRET',
    'GEMINI_API_KEY',
    'REDIS_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'APP_URL',
    'ADMIN_TOKEN',
    'SENTRY_DSN',
  ]
  const snap = {}
  for (const k of keys) snap[k] = process.env[k]
  return { snap, keys }
}

function restoreEnv(snap, keys) {
  for (const k of keys) {
    if (snap[k] === undefined) delete process.env[k]
    else process.env[k] = snap[k]
  }
}

function setRequiredEnv() {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'svc'
  process.env.SUPABASE_ANON_KEY = 'anon'
  process.env.JWT_SECRET = 'a'.repeat(32)
  process.env.GEMINI_API_KEY = 'gk'
  process.env.REDIS_URL = 'redis://x'
}

function setProductionRequiredEnv() {
  process.env.STRIPE_SECRET_KEY = 'sk_live_test1234567890'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec'
  process.env.RESEND_API_KEY = 'rs'
  process.env.APP_URL = 'https://app.smartanalyst.io'
}

test('validateEnv en prod sans ADMIN_TOKEN → OK + warning recommended', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'production'
    setRequiredEnv()
    setProductionRequiredEnv()
    delete process.env.ADMIN_TOKEN
    delete process.env.SENTRY_DSN

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    const result = validateEnv()

    assert.equal(result.ok, true)
    assert.ok(result.missingRecommended.includes('ADMIN_TOKEN'))
    assert.ok(result.missingRecommended.includes('SENTRY_DSN'))
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv en prod sans Stripe → throw (toujours REQUIRED en prod)', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'production'
    setRequiredEnv()
    setProductionRequiredEnv()
    delete process.env.STRIPE_SECRET_KEY

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    assert.throws(() => validateEnv(), /STRIPE_SECRET_KEY/)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv en dev sans rien de prod → OK', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'development'
    setRequiredEnv()
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.RESEND_API_KEY
    delete process.env.ADMIN_TOKEN

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    const result = validateEnv()
    assert.equal(result.ok, true)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv throw si ADMIN_TOKEN défini mais < 32 chars', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'development'
    setRequiredEnv()
    process.env.ADMIN_TOKEN = 'short'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    assert.throws(() => validateEnv(), /ADMIN_TOKEN must be at least 32 characters/)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv OK si ADMIN_TOKEN ≥ 32 chars', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'development'
    setRequiredEnv()
    process.env.ADMIN_TOKEN = 'a'.repeat(64)

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    const result = validateEnv()
    assert.equal(result.ok, true)
    assert.ok(!result.missingRecommended.includes('ADMIN_TOKEN'))
  } finally {
    restoreEnv(snap, keys)
  }
})

// ━━━ Stripe live key validation ━━━

test('validateEnv throw si STRIPE_SECRET_KEY = sk_test_ en prod', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'production'
    setRequiredEnv()
    setProductionRequiredEnv()
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_1234'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    assert.throws(() => validateEnv(), /must be a live key/)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv OK avec sk_live_ en prod', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'production'
    setRequiredEnv()
    setProductionRequiredEnv()
    process.env.STRIPE_SECRET_KEY = 'sk_live_real_key_1234'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    const result = validateEnv()
    assert.equal(result.ok, true)
  } finally {
    restoreEnv(snap, keys)
  }
})

// ━━━ APP_URL & OAUTH_REDIRECT_URI validation ━━━

test('validateEnv throw si APP_URL n\'est pas une URL valide', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'development'
    setRequiredEnv()
    process.env.APP_URL = 'not-a-url'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    assert.throws(() => validateEnv(), /APP_URL is not a valid URL/)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv throw si APP_URL a un slash final', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'development'
    setRequiredEnv()
    process.env.APP_URL = 'https://app.smartanalyst.io/'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    assert.throws(() => validateEnv(), /trailing slash/)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv throw si APP_URL = http en prod (hors localhost)', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'production'
    setRequiredEnv()
    setProductionRequiredEnv()
    process.env.APP_URL = 'http://app.smartanalyst.io'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    assert.throws(() => validateEnv(), /must use https in production/)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv OK si APP_URL = http://localhost en dev', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'development'
    setRequiredEnv()
    process.env.APP_URL = 'http://localhost:3000'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    const result = validateEnv()
    assert.equal(result.ok, true)
  } finally {
    restoreEnv(snap, keys)
  }
})

test('validateEnv throw si OAUTH_REDIRECT_URI invalide', () => {
  const { snap, keys } = snapshotEnv()
  try {
    delete require.cache[ENV_VALIDATOR_PATH]
    process.env.NODE_ENV = 'development'
    setRequiredEnv()
    process.env.OAUTH_REDIRECT_URI = 'oops'

    const { validateEnv } = require(ENV_VALIDATOR_PATH)
    assert.throws(() => validateEnv(), /OAUTH_REDIRECT_URI/)
  } finally {
    restoreEnv(snap, keys)
    delete process.env.OAUTH_REDIRECT_URI
  }
})
