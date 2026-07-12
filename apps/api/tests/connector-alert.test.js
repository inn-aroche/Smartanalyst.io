// Tests pour services/connectors/connector-alert.service.js (K0 —
// notification "reconnecte ta source" quand un connecteur tombe en panne).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const NOTIF_PATH = require.resolve('../src/services/notifications/notification-center.service')
const RESEND_PATH = require.resolve('../src/services/email/resend.service')
const RECIPIENT_PATH = require.resolve('../src/services/notifications/recipient')
const SERVICE_PATH = require.resolve('../src/services/connectors/connector-alert.service')

function load({ existingNotification = null, recipient = { email: 'a@b.com', orgName: 'Acme', locale: 'fr' } } = {}) {
  const created = []
  const emailsSent = []

  const notificationsChain = {
    select() {
      return this
    },
    eq() {
      return this
    },
    contains() {
      return this
    },
    gte() {
      return this
    },
    limit() {
      return this
    },
    maybeSingle: async () => ({ data: existingNotification, error: null }),
  }

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: () => notificationsChain,
      }),
    },
  }
  require.cache[NOTIF_PATH] = {
    id: NOTIF_PATH,
    filename: NOTIF_PATH,
    loaded: true,
    exports: {
      createNotification: async (payload) => {
        created.push(payload)
        return { id: 'notif-1' }
      },
    },
  }
  require.cache[RESEND_PATH] = {
    id: RESEND_PATH,
    filename: RESEND_PATH,
    loaded: true,
    exports: {
      sendEmail: async (payload) => {
        emailsSent.push(payload)
        return { ok: true, id: 'email-1' }
      },
    },
  }
  require.cache[RECIPIENT_PATH] = {
    id: RECIPIENT_PATH,
    filename: RECIPIENT_PATH,
    loaded: true,
    exports: {
      getWorkspaceRecipient: async () => recipient,
    },
  }

  delete require.cache[SERVICE_PATH]
  const svc = require(SERVICE_PATH)
  return { svc, created, emailsSent }
}

test('notifyConnectorDown : crée une notification in-app + envoie un email (FR)', async () => {
  const { svc, created, emailsSent } = load()
  const res = await svc.notifyConnectorDown({
    workspaceId: 'ws-1',
    connectorId: 'conn-1',
    source: 'ga4',
    reason: 'INVALID_CREDENTIALS',
  })
  assert.equal(res.notified, true)
  assert.equal(created.length, 1)
  assert.equal(created[0].type, 'connector_health')
  assert.equal(created[0].meta.connectorId, 'conn-1')
  assert.equal(created[0].meta.source, 'ga4')
  assert.match(created[0].title, /Google Analytics/)
  assert.equal(emailsSent.length, 1)
  assert.equal(emailsSent[0].to, 'a@b.com')
  assert.match(emailsSent[0].subject, /Google Analytics/)
})

test('notifyConnectorDown : localise en anglais quand workspace.locale=en', async () => {
  const { svc, created } = load({
    recipient: { email: 'a@b.com', orgName: 'Acme', locale: 'en' },
  })
  await svc.notifyConnectorDown({
    workspaceId: 'ws-1',
    connectorId: 'conn-1',
    source: 'meta_ads',
    reason: 'INVALID_CREDENTIALS',
  })
  assert.match(created[0].title, /needs to be reconnected/)
})

test('notifyConnectorDown : idempotent — pas de doublon dans la fenêtre de 24h', async () => {
  const { svc, created, emailsSent } = load({ existingNotification: { id: 'notif-existing' } })
  const res = await svc.notifyConnectorDown({
    workspaceId: 'ws-1',
    connectorId: 'conn-1',
    source: 'ga4',
    reason: 'INVALID_CREDENTIALS',
  })
  assert.equal(res.notified, false)
  assert.equal(res.reason, 'throttled')
  assert.equal(created.length, 0)
  assert.equal(emailsSent.length, 0)
})

test('notifyConnectorDown : sans destinataire résolu → notif in-app quand même, pas de crash', async () => {
  const { svc, created, emailsSent } = load({ recipient: null })
  const res = await svc.notifyConnectorDown({
    workspaceId: 'ws-1',
    connectorId: 'conn-1',
    source: 'shopify',
    reason: 'sync_failed',
  })
  assert.equal(res.notified, true)
  assert.equal(created.length, 1)
  assert.equal(emailsSent.length, 0)
})

test('notifyConnectorDown : ne throw jamais, même si tout échoue', async () => {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => {
        throw new Error('boom')
      },
    },
  }
  delete require.cache[SERVICE_PATH]
  const svc = require(SERVICE_PATH)
  const res = await svc.notifyConnectorDown({
    workspaceId: 'ws-1',
    connectorId: 'conn-1',
    source: 'ga4',
    reason: 'x',
  })
  assert.equal(res.notified, false)
  assert.equal(res.reason, 'error')
})

test('sourceLabel : mappe les sources connues, fallback sur la clé brute', () => {
  const { svc } = load()
  assert.equal(svc.sourceLabel('ga4'), 'Google Analytics')
  assert.equal(svc.sourceLabel('unknown_source'), 'unknown_source')
})
