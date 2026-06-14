// Tests task-email.service : composition du brief + envoi via Resend.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const RESEND_PATH = require.resolve('../src/services/email/resend.service')
const SERVICE_PATH = require.resolve('../src/services/insights/task-email.service')

function load({ emailResult = { ok: true, id: 'msg-1' } } = {}) {
  const sentEmails = []
  const auditInserts = []

  const queryChain = {
    insert(row) {
      auditInserts.push(row)
      return Promise.resolve({ data: null, error: null })
    },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({ from: () => queryChain }),
      getAnonClient: () => ({}),
      getUserScopedClient: () => ({}),
    },
  }
  require.cache[RESEND_PATH] = {
    id: RESEND_PATH,
    filename: RESEND_PATH,
    loaded: true,
    exports: {
      sendEmail: async (args) => {
        sentEmails.push(args)
        return emailResult
      },
    },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), sentEmails, auditInserts }
}

const TASK = {
  id: 't-1',
  title: 'Réduire le budget de Prospecting Broad',
  description: 'Le CPA de cette campagne est 31% au-dessus de la moyenne.',
  priority: 'high',
  impact: 'medium',
  effort: 'low',
  confidence: 'medium',
}

test('composeBrief produit un subject + body HTML + body text avec les champs clés', () => {
  const { svc } = load()
  const { subject, html, text } = svc.composeBrief(TASK, { senderName: 'Alice' })
  assert.match(subject, /Brief/)
  assert.match(subject, /Prospecting Broad/)
  assert.match(html, /Prospecting Broad/)
  assert.match(html, /high/) // priorité
  assert.match(html, /medium/) // impact
  assert.match(html, /Alice/) // signature
  assert.match(text, /Prospecting Broad/)
  assert.match(text, /Priorité : high/)
})

test('composeBrief intègre une note personnelle si fournie', () => {
  const { svc } = load()
  const { html, text } = svc.composeBrief(TASK, { note: 'Merci de regarder ASAP.' })
  assert.match(html, /Merci de regarder ASAP/)
  assert.match(text, /Merci de regarder ASAP/)
})

test('composeBrief échappe le HTML des champs (anti-XSS)', () => {
  const { svc } = load()
  const malicious = { ...TASK, title: '<script>alert(1)</script>X' }
  const { html } = svc.composeBrief(malicious)
  assert.ok(!html.includes('<script>alert'))
  assert.match(html, /&lt;script&gt;/)
})

test('sendTaskBrief : recipient invalide → rejette avec INVALID_RECIPIENT', async () => {
  const { svc } = load()
  await assert.rejects(
    () =>
      svc.sendTaskBrief({
        workspaceId: 'ws-1',
        userId: 'u-1',
        task: TASK,
        recipient: 'not-an-email',
      }),
    (err) => err.code === 'INVALID_RECIPIENT' && err.statusCode === 400,
  )
})

test('sendTaskBrief : email OK → audit log "task_brief_sent" inséré', async () => {
  const { svc, sentEmails, auditInserts } = load()
  const r = await svc.sendTaskBrief({
    workspaceId: 'ws-1',
    userId: 'u-1',
    task: TASK,
    recipient: 'ops@acme.com',
  })
  assert.equal(r.ok, true)
  assert.equal(sentEmails.length, 1)
  assert.equal(sentEmails[0].to, 'ops@acme.com')
  // Audit log inséré (best-effort, fire-and-forget : on attend la promesse)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(auditInserts.length, 1)
  assert.equal(auditInserts[0].action, 'task_brief_sent')
  assert.equal(auditInserts[0].resource_id, 't-1')
  assert.equal(auditInserts[0].changes.recipient, 'ops@acme.com')
})

test('sendTaskBrief : email KO → renvoie { ok:false }, pas d\'audit', async () => {
  const { svc, auditInserts } = load({ emailResult: { ok: false, error: 'resend_down' } })
  const r = await svc.sendTaskBrief({
    workspaceId: 'ws-1',
    userId: 'u-1',
    task: TASK,
    recipient: 'ops@acme.com',
  })
  assert.equal(r.ok, false)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(auditInserts.length, 0)
})
