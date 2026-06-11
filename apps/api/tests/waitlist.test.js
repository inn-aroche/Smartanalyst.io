// Tests waitlist : service (addSignup, listSignups) + route POST public.
//
// Mocks :
//   - Supabase service role client → upsert/select/range chainable
//   - Resend service (sendEmail) → renvoie {ok:true} ou {ok:false}
//
// Couverture :
//   - addSignup d'un nouveau email → insert + sendEmail appelé
//   - addSignup d'un email existant → upsert sans sendEmail (anti-spam)
//   - addSignup avec Supabase en erreur → throw UserFacingError 500
//   - addSignup avec Resend en erreur → success quand même (best-effort)
//   - listSignups : pagination + filtre status
//   - Route POST /waitlist : validation email + status 201

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const RESEND_PATH = require.resolve('../src/services/email/resend.service')
const SERVICE_PATH = require.resolve('../src/services/waitlist/waitlist.service')
const ROUTES_PATH = require.resolve('../src/routes/waitlist.routes')

function setupMocks({
  existing = null,
  insertResult = { data: { id: 'sg-1', email: 'foo@bar.com' }, error: null },
  listResult = { data: [], count: 0, error: null },
  emailResult = { ok: true, id: 'msg-1' },
} = {}) {
  const sentEmails = []

  // Mock Supabase
  const queryChain = {
    select() { return this },
    eq() { return this },
    maybeSingle: async () => ({ data: existing, error: null }),
    upsert() { return this },
    single: async () => insertResult,
    order() { return this },
    range: async () => listResult,
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: () => queryChain,
      }),
      getAnonClient: () => ({}),
      getUserScopedClient: () => ({}),
    },
  }

  // Mock Resend
  require.cache[RESEND_PATH] = {
    id: RESEND_PATH,
    filename: RESEND_PATH,
    loaded: true,
    exports: {
      sendEmail: async (payload) => {
        sentEmails.push(payload)
        return emailResult
      },
      getClient: () => ({}),
      getFromAddress: () => 'test@smartanalyst.io',
    },
  }

  delete require.cache[SERVICE_PATH]
  delete require.cache[ROUTES_PATH]
  return { sentEmails }
}

// ───────── Tests du service ─────────

test('addSignup new email → insert + envoie email de confirmation', async () => {
  const { sentEmails } = setupMocks({ existing: null })
  const service = require(SERVICE_PATH)
  const result = await service.addSignup({
    email: 'Test@Example.com',
    name: 'Test User',
    company: 'Acme',
    useCase: 'analyse mes ads',
  })
  assert.equal(result.id, 'sg-1')
  assert.equal(result.isNew, true)
  assert.equal(sentEmails.length, 1)
  assert.equal(sentEmails[0].to, 'test@example.com')
  assert.match(sentEmails[0].subject, /waitlist/i)
  assert.match(sentEmails[0].html, /Salut Test User/)
})

test('addSignup existing email → upsert mais PAS d\'email (anti-spam)', async () => {
  const { sentEmails } = setupMocks({ existing: { id: 'existing-1' } })
  const service = require(SERVICE_PATH)
  const result = await service.addSignup({
    email: 'foo@bar.com',
    name: 'Updated Name',
  })
  assert.equal(result.isNew, false)
  assert.equal(sentEmails.length, 0)
})

test('addSignup avec Resend KO → success quand même (best-effort)', async () => {
  const { sentEmails } = setupMocks({
    existing: null,
    emailResult: { ok: false, error: 'resend down' },
  })
  const service = require(SERVICE_PATH)
  const result = await service.addSignup({ email: 'foo@bar.com' })
  assert.equal(result.id, 'sg-1')
  assert.equal(sentEmails.length, 1) // tenté
})

test('addSignup avec Supabase en erreur → throw UserFacingError 500', async () => {
  setupMocks({
    existing: null,
    insertResult: { data: null, error: { message: 'unique violation' } },
  })
  const service = require(SERVICE_PATH)
  try {
    await service.addSignup({ email: 'foo@bar.com' })
    assert.fail('should have thrown')
  } catch (err) {
    assert.equal(err.statusCode, 500)
    assert.equal(err.code, 'WAITLIST_INSERT_FAILED')
  }
})

test('addSignup normalise email en lowercase', async () => {
  const { sentEmails } = setupMocks({ existing: null })
  const service = require(SERVICE_PATH)
  await service.addSignup({ email: 'CAPS@Example.COM' })
  assert.equal(sentEmails[0].to, 'caps@example.com')
})

test('listSignups renvoie {signups, total, limit, offset}', async () => {
  setupMocks({
    listResult: {
      data: [{ id: 'a', email: 'a@b.com' }, { id: 'b', email: 'c@d.com' }],
      count: 42,
      error: null,
    },
  })
  const service = require(SERVICE_PATH)
  const result = await service.listSignups({ limit: 10, offset: 0 })
  assert.equal(result.signups.length, 2)
  assert.equal(result.total, 42)
  assert.equal(result.limit, 10)
  assert.equal(result.offset, 0)
})

test('listSignups throw si Supabase error', async () => {
  setupMocks({
    listResult: { data: null, count: null, error: { message: 'db down' } },
  })
  const service = require(SERVICE_PATH)
  await assert.rejects(() => service.listSignups({}), /waitlist_list_failed/)
})

// ───────── Tests de la route POST /waitlist ─────────

async function withRouteServer(opts, fn) {
  setupMocks(opts)
  const router = require(ROUTES_PATH)
  const app = express()
  app.use(express.json())
  app.use('/api/v1/waitlist', router)

  const server = http.createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  try {
    await fn(port)
  } finally {
    await new Promise((r) => server.close(r))
  }
}

async function post(port, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

test('POST /waitlist 201 sur new signup valide', async () => {
  await withRouteServer({ existing: null }, async (port) => {
    const res = await post(port, {
      email: 'foo@bar.com',
      name: 'Foo',
      company: 'Bar Corp',
      useCase: 'analyse mes campagnes Ads',
    })
    assert.equal(res.status, 201)
    assert.match(res.body.message, /Inscription confirmée/i)
    assert.equal(res.body.id, 'sg-1')
  })
})

test('POST /waitlist 201 sur signup update (message différent)', async () => {
  await withRouteServer({ existing: { id: 'existing-1' } }, async (port) => {
    const res = await post(port, { email: 'foo@bar.com', name: 'Updated' })
    assert.equal(res.status, 201)
    assert.match(res.body.message, /mises à jour/i)
  })
})

test('POST /waitlist 400 sur email invalide', async () => {
  await withRouteServer({}, async (port) => {
    const res = await post(port, { email: 'not-an-email' })
    assert.equal(res.status, 400)
  })
})

test('POST /waitlist 400 si useCase > 500 chars', async () => {
  await withRouteServer({}, async (port) => {
    const res = await post(port, {
      email: 'foo@bar.com',
      useCase: 'x'.repeat(501),
    })
    assert.equal(res.status, 400)
  })
})

test('POST /waitlist 400 si email manquant', async () => {
  await withRouteServer({}, async (port) => {
    const res = await post(port, {})
    assert.equal(res.status, 400)
  })
})
