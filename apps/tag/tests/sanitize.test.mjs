// Tests des helpers de sanitization du tag StandardTag.
// Importe le module compilé via `npm run test` (qui appelle esbuild --tests
// pour produire dist/sanitize.mjs avant l'exécution).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectorFor, safeUrl, safeReferrer, safeProps } from '../dist/sanitize.mjs'

// ─── safeUrl ──────────────────────────────────────────────────────────────

test('safeUrl: returns path + sorted query keys (no values)', () => {
  assert.equal(safeUrl('https://x.com/page?b=hello&a=world'), '/page?a&b')
})

test('safeUrl: strips values that could leak PII (email in query)', () => {
  const out = safeUrl('https://x.com/signup?email=alice@example.com&ref=ad')
  assert.equal(out, '/signup?email&ref')
  assert.ok(!out.includes('alice'))
  assert.ok(!out.includes('example.com'))
})

test('safeUrl: keeps just the path when no query', () => {
  assert.equal(safeUrl('https://x.com/about'), '/about')
})

test('safeUrl: truncates result to 300 chars', () => {
  const long = 'https://x.com/' + 'a'.repeat(500)
  assert.equal(safeUrl(long).length, 300)
})

test('safeUrl: never throws and always returns a string', () => {
  // safeUrl utilise un base 'http://x' donc accepte presque tout. On valide
  // surtout l'invariant: pas de crash, retourne toujours une string.
  for (const input of ['', '/', 'foo', 'https://x.com', '://broken']) {
    const out = safeUrl(input)
    assert.equal(typeof out, 'string')
  }
})

// ─── safeReferrer ─────────────────────────────────────────────────────────

test('safeReferrer: returns origin only, drops path/query', () => {
  assert.equal(safeReferrer('https://google.com/search?q=secret'), 'https://google.com')
})

test('safeReferrer: returns empty string on malformed input', () => {
  assert.equal(safeReferrer(''), '')
  assert.equal(safeReferrer('not-a-url'), '')
})

test('safeReferrer: truncates to 100 chars', () => {
  const subdomain = 'a'.repeat(200) + '.example.com'
  assert.ok(safeReferrer(`https://${subdomain}/`).length <= 100)
})

// ─── safeProps ────────────────────────────────────────────────────────────

test('safeProps: returns undefined for undefined input', () => {
  assert.equal(safeProps(undefined), undefined)
})

test('safeProps: keeps valid primitives (string/number/boolean)', () => {
  const out = safeProps({ plan: 'pro', count: 42, active: true })
  assert.deepEqual(out, { plan: 'pro', count: 42, active: true })
})

test('safeProps: drops keys with invalid characters (spaces, dots, etc.)', () => {
  const out = safeProps({ 'bad key': 'x', 'with.dot': 'y', ok_key: 'z' })
  assert.deepEqual(out, { ok_key: 'z' })
})

test('safeProps: drops values that look like email addresses (PII)', () => {
  const out = safeProps({ contact: 'alice@example.com', plan: 'pro' })
  assert.deepEqual(out, { plan: 'pro' })
})

test('safeProps: drops values that look like phone numbers (PII)', () => {
  const out = safeProps({ phone: '+33 6 12 34 56 78', plan: 'pro' })
  assert.deepEqual(out, { plan: 'pro' })
})

test('safeProps: truncates string values to 200 chars', () => {
  const out = safeProps({ note: 'x'.repeat(500) })
  assert.equal(out.note.length, 200)
})

test('safeProps: drops non-finite numbers (Infinity, NaN)', () => {
  const out = safeProps({ a: Infinity, b: NaN, c: 1 })
  assert.deepEqual(out, { c: 1 })
})

test('safeProps: caps at 20 properties (drops the rest)', () => {
  const big = {}
  for (let i = 0; i < 50; i++) big['k' + i] = i
  const out = safeProps(big)
  assert.equal(Object.keys(out).length, 20)
})

// ─── selectorFor ──────────────────────────────────────────────────────────

// Mock Element minimal — selectorFor ne fait que lire tagName/id/getAttribute,
// pas besoin de JSDOM pour ces tests.
function mockEl({ tag = 'DIV', id = '', cls = null, track = null } = {}) {
  return {
    tagName: tag,
    id,
    getAttribute(name) {
      if (name === 'class') return cls
      if (name === 'data-track') return track
      return null
    },
  }
}

test('selectorFor: returns lowercase tag name when nothing else', () => {
  assert.equal(selectorFor(mockEl({ tag: 'BUTTON' })), 'button')
})

test('selectorFor: includes #id when present', () => {
  assert.equal(selectorFor(mockEl({ tag: 'A', id: 'cta-signup' })), 'a#cta-signup')
})

test('selectorFor: includes only the first class', () => {
  assert.equal(
    selectorFor(mockEl({ tag: 'BUTTON', cls: 'btn primary large' })),
    'button.btn',
  )
})

test('selectorFor: includes [data-track=...] when present, sanitized + truncated', () => {
  const sel = selectorFor(mockEl({ tag: 'A', track: 'pricing/cta_buy_now' }))
  // slashes get replaced with _
  assert.equal(sel, 'a[data-track=pricing_cta_buy_now]')
})

test('selectorFor: strips weird chars from id (no quotes, no spaces)', () => {
  const sel = selectorFor(mockEl({ tag: 'DIV', id: 'foo bar"baz' }))
  assert.equal(sel, 'div#foobarbaz')
})

test('selectorFor: truncates final selector to 80 chars', () => {
  const sel = selectorFor(mockEl({ tag: 'DIV', id: 'a'.repeat(200) }))
  assert.ok(sel.length <= 80)
})
