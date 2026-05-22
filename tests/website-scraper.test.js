// Tests pour website-scraper: détection d'outils (regex pure) + validation URL.
// Le scraping Playwright réel est testé en intégration (requiert chromium installé).

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { detectTools, isPublicHttpUrl } = require('../src/services/onboarding/website-scraper.service')

test('detectTools: Shopify CDN reference', () => {
  const html = '<script src="https://cdn.shopify.com/s/foo.js"></script>'
  assert.equal(detectTools(html).shopify, true)
})

test('detectTools: GA4 via gtag config', () => {
  const html = `<script>gtag('config', 'G-XXXXXX');</script>`
  assert.equal(detectTools(html).ga4, true)
})

test('detectTools: GTM container ID', () => {
  const html = '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCDEF"></script>'
  assert.equal(detectTools(html).gtm, true)
})

test('detectTools: Meta pixel fbq init', () => {
  const html = `<script>fbq('init', '1234567890');</script>`
  assert.equal(detectTools(html).meta_pixel, true)
})

test('detectTools: WooCommerce plugin path', () => {
  const html = '<link href="/wp-content/plugins/woocommerce/style.css">'
  const result = detectTools(html)
  assert.equal(result.woocommerce, true)
  assert.equal(result.wordpress, true)
})

test('detectTools: multiple tools simultaneously', () => {
  const html = `
    <script src="https://cdn.shopify.com/foo.js"></script>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>
    <script>gtag('config', 'G-X');</script>
    <script src="https://js.stripe.com/v3/"></script>
    <script>fbq('init', '1')</script>
  `
  const result = detectTools(html)
  assert.equal(result.shopify, true)
  assert.equal(result.ga4, true)
  assert.equal(result.stripe, true)
  assert.equal(result.meta_pixel, true)
})

test('detectTools: empty html returns empty object', () => {
  assert.deepEqual(detectTools(''), {})
  assert.deepEqual(detectTools(null), {})
})

test('detectTools: clean site → empty', () => {
  const html = '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>'
  assert.deepEqual(detectTools(html), {})
})

test('isPublicHttpUrl: accepts https://example.com', () => {
  assert.equal(isPublicHttpUrl('https://example.com'), true)
})

test('isPublicHttpUrl: accepts http://example.com/path?q=1', () => {
  assert.equal(isPublicHttpUrl('http://example.com/path?q=1'), true)
})

test('isPublicHttpUrl: rejects non-http(s) schemes', () => {
  assert.equal(isPublicHttpUrl('ftp://example.com'), false)
  assert.equal(isPublicHttpUrl('file:///etc/passwd'), false)
  assert.equal(isPublicHttpUrl('javascript:alert(1)'), false)
})

test('isPublicHttpUrl: rejects localhost / loopback / private IPs', () => {
  assert.equal(isPublicHttpUrl('http://localhost'), false)
  assert.equal(isPublicHttpUrl('http://127.0.0.1'), false)
  assert.equal(isPublicHttpUrl('http://0.0.0.0'), false)
  assert.equal(isPublicHttpUrl('http://10.0.0.1'), false)
  assert.equal(isPublicHttpUrl('http://192.168.1.1'), false)
  assert.equal(isPublicHttpUrl('http://172.20.0.1'), false)
  assert.equal(isPublicHttpUrl('http://foo.local'), false)
  assert.equal(isPublicHttpUrl('http://srv.internal'), false)
})

test('isPublicHttpUrl: rejects malformed URLs', () => {
  assert.equal(isPublicHttpUrl(''), false)
  assert.equal(isPublicHttpUrl('not a url'), false)
  assert.equal(isPublicHttpUrl(null), false)
})
