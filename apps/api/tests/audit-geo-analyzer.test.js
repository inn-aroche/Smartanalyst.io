// Tests du GEO analyzer (M4 Phase D Part 2).
// Pure function : on construit des `scraped` synthétiques et on vérifie les
// findings + le score.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  analyzeGEO,
  analyzeRobotsForAiBots,
  AI_BOTS,
} = require('../src/services/audit/analyzers/geo.analyzer')

function geoScraped(overrides = {}) {
  return {
    url: 'https://example.com',
    finalUrl: 'https://example.com/',
    title: 'Comment optimiser ton SEO pour Claude ?',
    lang: 'fr',
    metaDescription:
      'Guide complet pour rendre ton contenu citable par les modèles IA — checklist, exemples, outils. Mise à jour 2026.',
    h1: ['SEO + GEO'],
    h2: ['Introduction', 'AI bots', 'Schema.org', 'llms.txt', 'Mesure'],
    jsonLd: [
      { '@type': 'Article', headline: 'SEO Guide' },
      { '@type': 'FAQPage' },
      { '@type': 'Organization', name: 'SmartAnalyst' },
    ],
    robotsTxt: 'User-agent: *\nAllow: /',
    sitemapXml:
      '<?xml version="1.0"?><urlset><url><loc>/</loc><lastmod>2026-05-30</lastmod></url></urlset>',
    llmsTxt: '# SmartAnalyst\n\n> A senior marketing analyst, but typed.',
    ...overrides,
  }
}

function getFinding(result, key) {
  return result.findings.find((f) => f.key === key)
}

// ─── analyzeRobotsForAiBots (unit) ────────────────────────────────────────

test('analyzeRobotsForAiBots: null robots.txt → all bots allowed', () => {
  const res = analyzeRobotsForAiBots(null)
  assert.equal(res.allowed.length, AI_BOTS.length)
  assert.equal(res.blocked.length, 0)
})

test('analyzeRobotsForAiBots: User-agent * Disallow: / blocks all bots without explicit override', () => {
  const robots = 'User-agent: *\nDisallow: /'
  const res = analyzeRobotsForAiBots(robots)
  assert.equal(res.allowed.length, 0)
  assert.equal(res.blocked.length, AI_BOTS.length)
})

test('analyzeRobotsForAiBots: explicit Allow for GPTBot overrides wildcard block', () => {
  const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /'
  const res = analyzeRobotsForAiBots(robots)
  assert.ok(res.allowed.includes('GPTBot'))
  assert.ok(res.blocked.includes('ClaudeBot')) // pas d'override → suit le wildcard
})

test('analyzeRobotsForAiBots: explicit Disallow for ClaudeBot blocks it specifically', () => {
  const robots = 'User-agent: *\nAllow: /\n\nUser-agent: ClaudeBot\nDisallow: /'
  const res = analyzeRobotsForAiBots(robots)
  assert.ok(res.blocked.includes('ClaudeBot'))
  assert.ok(res.allowed.includes('GPTBot')) // pas d'override → wildcard allow
})

test('analyzeRobotsForAiBots: case-insensitive user-agent match', () => {
  const robots = 'User-agent: gptbot\nDisallow: /'
  const res = analyzeRobotsForAiBots(robots)
  assert.ok(res.blocked.includes('GPTBot'))
})

test('analyzeRobotsForAiBots: strips comments before parsing', () => {
  const robots = 'User-agent: GPTBot # crawler OpenAI\nDisallow: / # block all'
  const res = analyzeRobotsForAiBots(robots)
  assert.ok(res.blocked.includes('GPTBot'))
})

// ─── analyzeGEO smoke ────────────────────────────────────────────────────

test('analyzeGEO: returns findings + score for valid input', () => {
  const res = analyzeGEO(geoScraped())
  assert.ok(Array.isArray(res.findings))
  assert.ok(res.findings.length >= 7)
  assert.ok(res.score === null || (res.score >= 0 && res.score <= 100))
})

test('analyzeGEO: perfect input → score ≥ 90', () => {
  const res = analyzeGEO(geoScraped())
  assert.ok(res.score >= 90, `expected ≥90, got ${res.score}`)
})

test('analyzeGEO: AI bots blocked → fail with weight 5', () => {
  const res = analyzeGEO(
    geoScraped({ robotsTxt: 'User-agent: *\nDisallow: /' }),
  )
  const f = getFinding(res, 'ai_bots_allowed')
  assert.equal(f.severity, 'fail')
  assert.equal(f.weight, 5)
  assert.ok(f.recommendation)
})

test('analyzeGEO: half of AI bots blocked → warn', () => {
  // Block 3 bots explicitly, leave the rest unspecified (= allowed via wildcard)
  const robots =
    'User-agent: *\nAllow: /\n\n' +
    AI_BOTS.slice(0, 3)
      .map((b) => `User-agent: ${b}\nDisallow: /`)
      .join('\n\n')
  const res = analyzeGEO(geoScraped({ robotsTxt: robots }))
  const f = getFinding(res, 'ai_bots_allowed')
  assert.equal(f.severity, 'warn')
})

test('analyzeGEO: llms.txt present → pass', () => {
  const res = analyzeGEO(geoScraped({ llmsTxt: '# Site\nQuelque chose' }))
  assert.equal(getFinding(res, 'llms_txt').severity, 'pass')
})

test('analyzeGEO: llms.txt absent → info (n\'impacte pas le score)', () => {
  const res = analyzeGEO(geoScraped({ llmsTxt: null }))
  assert.equal(getFinding(res, 'llms_txt').severity, 'info')
})

test('analyzeGEO: 0 valuable Schema types → fail', () => {
  const res = analyzeGEO(geoScraped({ jsonLd: [] }))
  assert.equal(getFinding(res, 'schema_richness').severity, 'fail')
})

test('analyzeGEO: 1 valuable Schema type → warn', () => {
  const res = analyzeGEO(geoScraped({ jsonLd: [{ '@type': 'Article' }] }))
  assert.equal(getFinding(res, 'schema_richness').severity, 'warn')
})

test('analyzeGEO: @graph imbriqué → types correctement collectés', () => {
  const res = analyzeGEO(
    geoScraped({
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'Organization' },
            { '@type': 'WebSite' },
            { '@type': 'BreadcrumbList' },
          ],
        },
      ],
    }),
  )
  const f = getFinding(res, 'schema_richness')
  assert.equal(f.severity, 'pass')
  assert.ok(f.title.includes('Organization'))
  assert.ok(f.title.includes('BreadcrumbList'))
})

test('analyzeGEO: title format question → pass', () => {
  assert.equal(getFinding(analyzeGEO(geoScraped({ title: 'How to do X?' })), 'title_question_format').severity, 'pass')
  assert.equal(getFinding(analyzeGEO(geoScraped({ title: 'Pourquoi choisir Y' })), 'title_question_format').severity, 'pass')
})

test('analyzeGEO: title déclaratif → info (n\'impacte pas le score)', () => {
  const f = getFinding(analyzeGEO(geoScraped({ title: 'Notre solution.' })), 'title_question_format')
  assert.equal(f.severity, 'info')
})

test('analyzeGEO: meta description courte → fail', () => {
  assert.equal(
    getFinding(analyzeGEO(geoScraped({ metaDescription: 'Bref.' })), 'meta_description_geo').severity,
    'fail',
  )
})

test('analyzeGEO: ≥5 H2 → contenu bien structuré (pass)', () => {
  assert.equal(getFinding(analyzeGEO(geoScraped()), 'content_structure').severity, 'pass')
})

test('analyzeGEO: < 2 H2 → fail', () => {
  assert.equal(getFinding(analyzeGEO(geoScraped({ h2: ['One'] })), 'content_structure').severity, 'fail')
})

test('analyzeGEO: sitemap avec <lastmod> → pass', () => {
  assert.equal(getFinding(analyzeGEO(geoScraped()), 'sitemap_freshness').severity, 'pass')
})

test('analyzeGEO: sitemap sans <lastmod> → warn', () => {
  const res = analyzeGEO(geoScraped({ sitemapXml: '<urlset><url><loc>/</loc></url></urlset>' }))
  assert.equal(getFinding(res, 'sitemap_freshness').severity, 'warn')
})

test('analyzeGEO: sitemap absent → info', () => {
  const res = analyzeGEO(geoScraped({ sitemapXml: null }))
  assert.equal(getFinding(res, 'sitemap_freshness').severity, 'info')
})

test('analyzeGEO: summary counts cohérents', () => {
  const res = analyzeGEO(geoScraped())
  const pass = res.findings.filter((f) => f.severity === 'pass').length
  const fail = res.findings.filter((f) => f.severity === 'fail').length
  assert.equal(res.summary.pass, pass)
  assert.equal(res.summary.fail, fail)
})
