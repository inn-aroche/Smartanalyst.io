// Tests du SEO analyzer (M4 Phase D Part 1).
// Pure function : on construit des `scraped` synthétiques et on vérifie les
// findings + le score. Pas de Playwright ni de DB ici.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { analyzeSEO } = require('../src/services/audit/analyzers/seo.analyzer')

// Helper : un scrapped "parfait" baseline qu'on dégrade champ par champ.
function perfectScraped(overrides = {}) {
  return {
    url: 'https://example.com',
    finalUrl: 'https://example.com/',
    httpStatus: 200,
    isHttps: true,
    title: 'SmartAnalyst — votre analyste marketing IA',
    lang: 'fr',
    metaDescription:
      'SmartAnalyst connecte vos outils marketing et explique vos performances en français — comme un analyste senior, mais en chat.',
    metaRobots: 'index, follow',
    metaViewport: 'width=device-width, initial-scale=1',
    canonical: 'https://example.com/',
    og: {
      'og:title': 'SmartAnalyst',
      'og:description': 'Description sociale',
      'og:image': 'https://example.com/og.png',
    },
    twitter: { 'twitter:card': 'summary_large_image' },
    h1: ['Bienvenue sur SmartAnalyst'],
    h2: ['Pourquoi nous'],
    images: { total: 5, missingAlt: 0 },
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'SmartAnalyst' }],
    robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',
    sitemapXml: '<?xml version="1.0"?><urlset></urlset>',
    ...overrides,
  }
}

function getFinding(result, key) {
  return result.findings.find((f) => f.key === key)
}

// ─── Smoke tests ──────────────────────────────────────────────────────────

test('analyzeSEO returns findings array + score number for valid input', () => {
  const res = analyzeSEO(perfectScraped())
  assert.ok(Array.isArray(res.findings))
  assert.ok(res.findings.length >= 12, `expected ≥12 findings, got ${res.findings.length}`)
  assert.equal(typeof res.score, 'number')
  assert.ok(res.score >= 0 && res.score <= 100)
  assert.equal(typeof res.summary, 'object')
})

test('perfect input → score ≥ 95 and zero fails', () => {
  const res = analyzeSEO(perfectScraped())
  assert.ok(res.score >= 95, `expected score ≥95, got ${res.score}`)
  assert.equal(res.summary.fail, 0)
})

test('all-empty input → many fails, score < 40', () => {
  const res = analyzeSEO(
    perfectScraped({
      isHttps: false,
      title: '',
      lang: '',
      metaDescription: '',
      metaRobots: '',
      metaViewport: '',
      canonical: '',
      og: {},
      twitter: {},
      h1: [],
      h2: [],
      images: { total: 5, missingAlt: 5 },
      jsonLd: [],
      robotsTxt: null,
      sitemapXml: null,
    }),
  )
  assert.ok(res.summary.fail >= 4, `expected ≥4 fails, got ${res.summary.fail}`)
  assert.ok(res.score < 40, `expected score < 40 on all-empty, got ${res.score}`)
})

// ─── Per-check tests ─────────────────────────────────────────────────────

test('HTTPS finding: fail when not https, pass otherwise', () => {
  assert.equal(getFinding(analyzeSEO(perfectScraped({ isHttps: false })), 'https').severity, 'fail')
  assert.equal(getFinding(analyzeSEO(perfectScraped({ isHttps: true })), 'https').severity, 'pass')
})

test('title: too short → warn', () => {
  const f = getFinding(analyzeSEO(perfectScraped({ title: 'Short' })), 'title')
  assert.equal(f.severity, 'warn')
  assert.ok(f.recommendation)
})

test('title: too long → warn', () => {
  const f = getFinding(
    analyzeSEO(perfectScraped({ title: 'a'.repeat(120) })),
    'title',
  )
  assert.equal(f.severity, 'warn')
})

test('title: missing → fail with weight 5', () => {
  const f = getFinding(analyzeSEO(perfectScraped({ title: '' })), 'title')
  assert.equal(f.severity, 'fail')
  assert.equal(f.weight, 5)
})

test('meta description: missing → warn', () => {
  const f = getFinding(analyzeSEO(perfectScraped({ metaDescription: '' })), 'meta_description')
  assert.equal(f.severity, 'warn')
})

test('meta robots noindex → fail with weight 5', () => {
  const f = getFinding(
    analyzeSEO(perfectScraped({ metaRobots: 'noindex, follow' })),
    'meta_robots_noindex',
  )
  assert.ok(f, 'noindex finding should exist')
  assert.equal(f.severity, 'fail')
  assert.equal(f.weight, 5)
})

test('meta robots index → no noindex finding emitted', () => {
  const res = analyzeSEO(perfectScraped({ metaRobots: 'index, follow' }))
  assert.equal(getFinding(res, 'meta_robots_noindex'), undefined)
})

test('H1: zero → fail', () => {
  assert.equal(getFinding(analyzeSEO(perfectScraped({ h1: [] })), 'h1').severity, 'fail')
})

test('H1: multiple → warn', () => {
  assert.equal(
    getFinding(analyzeSEO(perfectScraped({ h1: ['A', 'B', 'C'] })), 'h1').severity,
    'warn',
  )
})

test('H1: exactly one → pass', () => {
  assert.equal(
    getFinding(analyzeSEO(perfectScraped({ h1: ['Only one'] })), 'h1').severity,
    'pass',
  )
})

test('Open Graph: all 3 missing → fail', () => {
  assert.equal(getFinding(analyzeSEO(perfectScraped({ og: {} })), 'open_graph').severity, 'fail')
})

test('Open Graph: partially missing → warn', () => {
  const res = analyzeSEO(
    perfectScraped({ og: { 'og:title': 'X' } }), // missing description + image
  )
  assert.equal(getFinding(res, 'open_graph').severity, 'warn')
})

test('Twitter Card: missing → info (not pass nor fail)', () => {
  assert.equal(
    getFinding(analyzeSEO(perfectScraped({ twitter: {} })), 'twitter_card').severity,
    'info',
  )
})

test('Structured data: empty array → warn', () => {
  assert.equal(
    getFinding(analyzeSEO(perfectScraped({ jsonLd: [] })), 'structured_data').severity,
    'warn',
  )
})

test('Structured data: array-wrapped @graph → still detected', () => {
  // Schema.org permet d'imbriquer plusieurs entités via @graph (array de types)
  const res = analyzeSEO(
    perfectScraped({ jsonLd: [[{ '@type': 'Organization' }, { '@type': 'WebSite' }]] }),
  )
  const f = getFinding(res, 'structured_data')
  assert.equal(f.severity, 'pass')
  assert.ok(f.title.includes('Organization'))
  assert.ok(f.title.includes('WebSite'))
})

test('Images alt: >50% missing → fail', () => {
  assert.equal(
    getFinding(
      analyzeSEO(perfectScraped({ images: { total: 10, missingAlt: 6 } })),
      'images_alt',
    ).severity,
    'fail',
  )
})

test('Images alt: 0 images → no finding emitted (skipped)', () => {
  assert.equal(
    getFinding(analyzeSEO(perfectScraped({ images: { total: 0, missingAlt: 0 } })), 'images_alt'),
    undefined,
  )
})

test('Sitemap: declared via robots.txt directive → pass', () => {
  const res = analyzeSEO(
    perfectScraped({
      sitemapXml: null,
      robotsTxt: 'User-agent: *\nSitemap: https://example.com/sitemap.xml',
    }),
  )
  assert.equal(getFinding(res, 'sitemap').severity, 'pass')
})

test('Sitemap: neither robots Sitemap nor /sitemap.xml → warn', () => {
  const res = analyzeSEO(
    perfectScraped({ sitemapXml: null, robotsTxt: 'User-agent: *\nAllow: /' }),
  )
  assert.equal(getFinding(res, 'sitemap').severity, 'warn')
})

test('summary counts match findings severities', () => {
  const res = analyzeSEO(perfectScraped({ isHttps: false, title: '' }))
  const expectedPass = res.findings.filter((f) => f.severity === 'pass').length
  const expectedFail = res.findings.filter((f) => f.severity === 'fail').length
  assert.equal(res.summary.pass, expectedPass)
  assert.equal(res.summary.fail, expectedFail)
})

test('score uses weighted average (heavy fail drops score significantly)', () => {
  const baseline = analyzeSEO(perfectScraped()).score
  const withNoTitle = analyzeSEO(perfectScraped({ title: '' })).score
  // title has weight 5 — score must drop by at least 5 points
  assert.ok(
    baseline - withNoTitle >= 5,
    `expected score drop ≥5 from removing title, got ${baseline - withNoTitle}`,
  )
})

test('info findings are excluded from the score calculation', () => {
  // perfectScraped has Twitter Card → pass. Remove → info. Score should not move much.
  const a = analyzeSEO(perfectScraped()).score
  const b = analyzeSEO(perfectScraped({ twitter: {} })).score
  // Score may move by 1 point due to rounding but no more
  assert.ok(Math.abs(a - b) <= 1, `info finding should not impact score (delta=${a - b})`)
})
