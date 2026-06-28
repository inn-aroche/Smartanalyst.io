// Tests digest.service : compose weekly + critical, send (recipient + insights).

const test = require('node:test')
const assert = require('node:assert/strict')

const RESEND_PATH = require.resolve('../src/services/email/resend.service')
const INSIGHTS_PATH = require.resolve('../src/services/insights/insights.service')
const RECIPIENT_PATH = require.resolve('../src/services/notifications/recipient')
const SETTINGS_PATH = require.resolve('../src/services/notifications/settings.service')
const NOTIF_CENTER_PATH = require.resolve('../src/services/notifications/notification-center.service')
const SERVICE_PATH = require.resolve('../src/services/notifications/digest.service')

function load({ recipient = { email: 'me@acme.com', orgName: 'Acme' }, insights = [], emailResult = { ok: true, id: 'm1' } } = {}) {
  const sent = []
  require.cache[RESEND_PATH] = {
    id: RESEND_PATH, filename: RESEND_PATH, loaded: true,
    exports: { sendEmail: async (a) => { sent.push(a); return emailResult } },
  }
  require.cache[INSIGHTS_PATH] = {
    id: INSIGHTS_PATH, filename: INSIGHTS_PATH, loaded: true,
    exports: { listInsights: async () => insights },
  }
  require.cache[RECIPIENT_PATH] = {
    id: RECIPIENT_PATH, filename: RECIPIENT_PATH, loaded: true,
    exports: { getWorkspaceRecipient: async () => recipient },
  }
  require.cache[SETTINGS_PATH] = {
    id: SETTINGS_PATH, filename: SETTINGS_PATH, loaded: true,
    exports: {
      getSettings: async () => ({ weekly_digest: true, critical_alerts: true, email_override: null }),
    },
  }
  require.cache[NOTIF_CENTER_PATH] = {
    id: NOTIF_CENTER_PATH, filename: NOTIF_CENTER_PATH, loaded: true,
    exports: { createNotification: async () => ({}) },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), sent }
}

const INSIGHT = { id: 'i1', title: 'Trafic en chute', summary: 'Sessions -30%.', severity: 'critical' }

test('composeWeeklyDigest : null si aucun insight', () => {
  const { svc } = load()
  assert.equal(svc.composeWeeklyDigest([], {}), null)
})

test('composeWeeklyDigest : subject + items', () => {
  const { svc } = load()
  const c = svc.composeWeeklyDigest([INSIGHT, { ...INSIGHT, id: 'i2', title: 'Autre' }], { orgName: 'Acme' })
  assert.match(c.subject, /2 points/)
  assert.match(c.html, /Trafic en chute/)
  assert.match(c.html, /Acme/)
  assert.match(c.text, /Sessions -30%/)
})

test('composeWeeklyDigest : échappe le HTML', () => {
  const { svc } = load()
  const c = svc.composeWeeklyDigest([{ ...INSIGHT, title: '<b>x</b>' }], {})
  assert.ok(!c.html.includes('<b>x</b>'))
  assert.match(c.html, /&lt;b&gt;/)
})

test('sendWeeklyDigest : pas de destinataire → no-op', async () => {
  const { svc, sent } = load({ recipient: null })
  const r = await svc.sendWeeklyDigest('ws-1')
  assert.equal(r.sent, false)
  assert.equal(r.reason, 'no_recipient')
  assert.equal(sent.length, 0)
})

test('sendWeeklyDigest : pas d\'insight → no-op', async () => {
  const { svc, sent } = load({ insights: [] })
  const r = await svc.sendWeeklyDigest('ws-1')
  assert.equal(r.sent, false)
  assert.equal(r.reason, 'no_insights')
  assert.equal(sent.length, 0)
})

test('sendWeeklyDigest : insights présents → email envoyé', async () => {
  const { svc, sent } = load({ insights: [INSIGHT] })
  const r = await svc.sendWeeklyDigest('ws-1')
  assert.equal(r.sent, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'me@acme.com')
})

test('sendCriticalAlert : compose + envoie', async () => {
  const { svc, sent } = load()
  const r = await svc.sendCriticalAlert('ws-1', INSIGHT)
  assert.equal(r.sent, true)
  assert.match(sent[0].subject, /Alerte/)
  assert.match(sent[0].subject, /Trafic en chute/)
})

test('sendCriticalAlert : email KO → sent false', async () => {
  const { svc } = load({ emailResult: { ok: false, error: 'down' } })
  const r = await svc.sendCriticalAlert('ws-1', INSIGHT)
  assert.equal(r.sent, false)
})
