// Tests : inviteSignup (welcome email beta + bascule status).
//
// Couverture :
//   - signup déjà invited / converted → no-op, pas d'email
//   - signup pending + envoi OK → update status='invited', notified_at, sent=true
//   - signup pending + envoi KO → status non modifié, sent=false (retry possible)
//   - signup inexistant → 404 via err.statusCode

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const RESEND_PATH = require.resolve('../src/services/email/resend.service')
const SERVICE_PATH = require.resolve('../src/services/waitlist/waitlist.service')

function load({ existing, emailResult = { ok: true, id: 'msg-1' }, updateError = null } = {}) {
  const sentEmails = []
  const updateCalls = []

  const queryChain = {
    select() { return this },
    eq() { return this },
    maybeSingle: async () => ({ data: existing, error: null }),
    update(values) {
      updateCalls.push(values)
      return this
    },
    then(resolve) {
      // Pour le await sur le .eq() final de l'UPDATE chain.
      return Promise.resolve({ data: null, error: updateError }).then(resolve)
    },
  }

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: {
      getServiceRoleClient: () => ({ from: () => queryChain }),
      getAnonClient: () => ({}),
      getUserScopedClient: () => ({}),
    },
  }
  require.cache[RESEND_PATH] = {
    id: RESEND_PATH, filename: RESEND_PATH, loaded: true,
    exports: {
      sendEmail: async (args) => {
        sentEmails.push(args)
        return emailResult
      },
    },
  }
  delete require.cache[SERVICE_PATH]
  const svc = require(SERVICE_PATH)
  return { svc, sentEmails, updateCalls }
}

test('inviteSignup d\'un signup déjà invited → no-op, pas d\'email', async () => {
  const { svc, sentEmails, updateCalls } = load({
    existing: { id: 'sg-1', email: 'a@b.com', status: 'invited' },
  })
  const r = await svc.inviteSignup('sg-1')
  assert.equal(r.sent, false)
  assert.equal(r.status, 'invited')
  assert.equal(r.error, 'already_invited')
  assert.equal(sentEmails.length, 0)
  assert.equal(updateCalls.length, 0)
})

test('inviteSignup d\'un signup converted → no-op', async () => {
  const { svc, sentEmails } = load({
    existing: { id: 'sg-1', email: 'a@b.com', status: 'converted' },
  })
  const r = await svc.inviteSignup('sg-1')
  assert.equal(r.sent, false)
  assert.equal(sentEmails.length, 0)
})

test('inviteSignup pending + email OK → envoi + update status', async () => {
  const { svc, sentEmails, updateCalls } = load({
    existing: { id: 'sg-1', email: 'a@b.com', name: 'Alice Dupont', status: 'pending' },
  })
  const r = await svc.inviteSignup('sg-1')
  assert.equal(r.sent, true)
  assert.equal(r.status, 'invited')
  assert.equal(sentEmails.length, 1)
  assert.equal(sentEmails[0].to, 'a@b.com')
  assert.match(sentEmails[0].subject, /beta/i)
  assert.match(sentEmails[0].text, /Alice/)
  assert.equal(updateCalls.length, 1)
  assert.equal(updateCalls[0].status, 'invited')
  assert.ok(updateCalls[0].notified_at)
})

test('inviteSignup pending + email KO → status non modifié, retry possible', async () => {
  const { svc, sentEmails, updateCalls } = load({
    existing: { id: 'sg-1', email: 'a@b.com', status: 'pending' },
    emailResult: { ok: false, error: 'resend_500' },
  })
  const r = await svc.inviteSignup('sg-1')
  assert.equal(r.sent, false)
  assert.equal(r.status, 'pending')
  assert.equal(r.error, 'resend_500')
  assert.equal(sentEmails.length, 1)
  assert.equal(updateCalls.length, 0)
})

test('inviteSignup d\'un id inexistant → 404', async () => {
  const { svc } = load({ existing: null })
  await assert.rejects(() => svc.inviteSignup('sg-x'), (err) => err.statusCode === 404)
})
