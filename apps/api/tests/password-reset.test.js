// Tests password reset : request (toujours OK, anti-enumeration) +
// confirm (validation, échec sur token expiré, succès sur 200).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/auth/auth.service')

function load({ resetError = null, fetchResponse = { ok: true, status: 200, json: async () => ({ id: 'u1' }) } } = {}) {
  const resetCalls = []
  const fetchCalls = []

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: {
      getServiceRoleClient: () => ({ from: () => ({}) }),
      getAnonClient: () => ({
        auth: {
          resetPasswordForEmail: async (email, opts) => {
            resetCalls.push({ email, opts })
            return { error: resetError }
          },
        },
      }),
      getUserScopedClient: () => ({}),
    },
  }

  // Mock global.fetch (Supabase REST API)
  const originalFetch = global.fetch
  global.fetch = async (url, init) => {
    fetchCalls.push({ url, init })
    return {
      ok: fetchResponse.ok,
      status: fetchResponse.status,
      json: fetchResponse.json,
      text: fetchResponse.text || (async () => ''),
    }
  }

  delete require.cache[SERVICE_PATH]
  process.env.SUPABASE_URL = 'https://supabase.example.com'
  process.env.SUPABASE_ANON_KEY = 'anon-key'
  process.env.APP_URL = 'https://app.example.com'

  const svc = require(SERVICE_PATH)
  return {
    svc,
    resetCalls,
    fetchCalls,
    restore: () => {
      global.fetch = originalFetch
    },
  }
}

test('requestPasswordReset appelle Supabase avec redirectTo', async () => {
  const { svc, resetCalls, restore } = load()
  try {
    await svc.requestPasswordReset({ email: 'a@b.com' })
    assert.equal(resetCalls.length, 1)
    assert.equal(resetCalls[0].email, 'a@b.com')
    assert.equal(resetCalls[0].opts.redirectTo, 'https://app.example.com/reset-password/confirm')
  } finally {
    restore()
  }
})

test('requestPasswordReset ne THROW jamais (anti-enumeration), même si Supabase échoue', async () => {
  const { svc, restore } = load({ resetError: { message: 'no such user' } })
  try {
    await svc.requestPasswordReset({ email: 'unknown@x.com' })
    // ne lève pas
  } finally {
    restore()
  }
})

test('confirmPasswordReset rejette un password trop court', async () => {
  const { svc, restore } = load()
  try {
    await assert.rejects(
      () => svc.confirmPasswordReset({ accessToken: 'tok', newPassword: 'short' }),
      (err) => err.code === 'WEAK_PASSWORD',
    )
  } finally {
    restore()
  }
})

test('confirmPasswordReset rejette si token ou password manquant', async () => {
  const { svc, restore } = load()
  try {
    await assert.rejects(
      () => svc.confirmPasswordReset({ accessToken: '', newPassword: 'aaaaaaaaaaaa' }),
      (err) => err.code === 'MISSING_FIELDS',
    )
  } finally {
    restore()
  }
})

test('confirmPasswordReset PUT /auth/v1/user avec Bearer + apikey', async () => {
  const { svc, fetchCalls, restore } = load()
  try {
    await svc.confirmPasswordReset({ accessToken: 'tok-123', newPassword: 'longenoughpassword' })
    assert.equal(fetchCalls.length, 1)
    assert.equal(fetchCalls[0].url, 'https://supabase.example.com/auth/v1/user')
    assert.equal(fetchCalls[0].init.method, 'PUT')
    assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer tok-123')
    assert.equal(fetchCalls[0].init.headers.apikey, 'anon-key')
    const body = JSON.parse(fetchCalls[0].init.body)
    assert.equal(body.password, 'longenoughpassword')
  } finally {
    restore()
  }
})

test('confirmPasswordReset 401 → INVALID_OR_EXPIRED_TOKEN', async () => {
  const { svc, restore } = load({
    fetchResponse: { ok: false, status: 401, json: async () => ({}), text: async () => 'expired' },
  })
  try {
    await assert.rejects(
      () => svc.confirmPasswordReset({ accessToken: 'tok', newPassword: 'longenoughpassword' }),
      (err) => err.code === 'INVALID_OR_EXPIRED_TOKEN',
    )
  } finally {
    restore()
  }
})

test('confirmPasswordReset 500 → PASSWORD_UPDATE_FAILED', async () => {
  const { svc, restore } = load({
    fetchResponse: { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' },
  })
  try {
    await assert.rejects(
      () => svc.confirmPasswordReset({ accessToken: 'tok', newPassword: 'longenoughpassword' }),
      (err) => err.code === 'PASSWORD_UPDATE_FAILED',
    )
  } finally {
    restore()
  }
})
