// Tests email-template.service — shell HTML branded reutilisable.
// Verifie qu'on produit un HTML valide + un fallback text non-vide pour la
// deliverability.

const test = require('node:test')
const assert = require('node:assert/strict')

const { renderEmail, escapeHtml } = require('../src/services/email/email-template.service')

test('renderEmail : minimal (title seul) → html + text non vides', () => {
  const { html, text } = renderEmail({ title: 'Bonjour' })
  assert.match(html, /<!doctype html>/i)
  assert.match(html, /Bonjour/)
  assert.match(html, /SmartAnalyst/)
  assert.ok(text.length > 0)
  assert.match(text, /Bonjour/)
})

test('renderEmail : avec CTA → bouton + URL dans text', () => {
  const { html, text } = renderEmail({
    title: 'Tu as un message',
    cta: { label: 'Voir', href: 'https://example.com/x' },
  })
  assert.match(html, /https:\/\/example\.com\/x/)
  assert.match(html, /Voir/)
  assert.match(text, /Voir : https:\/\/example\.com\/x/)
})

test('renderEmail : preview text invisible inclus pour Gmail/Outlook', () => {
  const { html } = renderEmail({
    preview: 'Pre-affichage inbox',
    title: 'Salut',
  })
  // Le preview est dans un div avec display:none, max-height:0, opacity:0.
  assert.match(html, /Pre-affichage inbox/)
  assert.match(html, /display:none/)
})

test('renderEmail : intro echappee (anti-XSS)', () => {
  const { html } = renderEmail({
    title: 'Test',
    intro: '<script>alert(1)</script>',
  })
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.match(html, /&lt;script&gt;/)
})

test('renderEmail : body est laisse en HTML brut (responsabilite appelant)', () => {
  // L'appelant assume la responsabilite d'echapper son body HTML libre.
  const { html } = renderEmail({
    title: 'Test',
    body: '<p style="color:red">Custom HTML</p>',
  })
  assert.match(html, /<p style="color:red">Custom HTML<\/p>/)
})

test('renderEmail : footer escape correctement', () => {
  const { html } = renderEmail({
    title: 'Test',
    footer: 'Lien expire dans <7> jours',
  })
  assert.match(html, /&lt;7&gt; jours/)
})

test('renderEmail : header inclut le logo brand + tagline', () => {
  const { html } = renderEmail({ title: 'X' })
  assert.match(html, /SmartAnalyst/)
  assert.match(html, /copilote marketing/)
})

test('renderEmail : footer mentionne hebergement EU + lien preferences', () => {
  const { html } = renderEmail({ title: 'X' })
  assert.match(html, /hebergement europeen|hébergement européen/)
  assert.match(html, /\/settings/)
})

test('renderEmail : text fallback contient titre, intro, CTA URL', () => {
  const { text } = renderEmail({
    title: 'Mon titre',
    intro: 'Mon intro.',
    cta: { label: 'Action', href: 'https://x.test' },
    footer: 'Note finale.',
  })
  assert.match(text, /Mon titre/)
  assert.match(text, /Mon intro/)
  assert.match(text, /Action : https:\/\/x\.test/)
  assert.match(text, /Note finale/)
})

test('renderEmail : body HTML strip dans text fallback', () => {
  const { text } = renderEmail({
    title: 'X',
    body: '<p>Para 1</p><p>Para 2</p>',
  })
  assert.match(text, /Para 1/)
  assert.match(text, /Para 2/)
  assert.doesNotMatch(text, /<p>/)
})

test('escapeHtml : caracteres dangereux', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;')
  assert.equal(escapeHtml(`a"b'c&d`), 'a&quot;b&#39;c&amp;d')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})
