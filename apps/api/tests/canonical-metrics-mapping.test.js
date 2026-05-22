// Tests pour canonical-metrics-mapping.js
// Run: node --test tests/canonical-metrics-mapping.test.js

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  CANONICAL_METRICS_MAPPING,
  mapToCanonical,
  listSources,
  listCanonicalKeys,
} = require('../src/connectors/canonical-metrics-mapping')

test('mapToCanonical resolves GA4 sessions to sessions_all', () => {
  const result = mapToCanonical('ga4', 'sessions')
  assert.ok(result)
  assert.equal(result.canonicalKey, 'sessions_all')
  assert.equal(result.confidenceDefault, 100)
})

test('mapToCanonical resolves Meta Ads roas to canonical paid ROI', () => {
  const result = mapToCanonical('meta_ads', 'roas')
  assert.equal(result.canonicalKey, 'return_on_investment_paid')
})

test('mapToCanonical resolves Stripe mrr to canonical recurring revenue', () => {
  const result = mapToCanonical('stripe', 'mrr')
  assert.equal(result.canonicalKey, 'revenue_recurring_monthly')
})

test('mapToCanonical returns null for unknown source', () => {
  assert.equal(mapToCanonical('unknown_source', 'sessions'), null)
})

test('mapToCanonical returns null for unknown key within known source', () => {
  assert.equal(mapToCanonical('ga4', 'this_does_not_exist'), null)
})

test('listSources contains all P1 connectors', () => {
  const sources = listSources()
  assert.ok(sources.includes('ga4'))
  assert.ok(sources.includes('meta_ads'))
  assert.ok(sources.includes('google_ads'))
  assert.ok(sources.includes('stripe'))
  assert.ok(sources.includes('search_console'))
})

test('listCanonicalKeys returns unique, sorted set', () => {
  const keys = listCanonicalKeys()
  const sorted = [...keys].sort()
  assert.deepEqual(keys, sorted)
  assert.equal(new Set(keys).size, keys.length, 'keys must be unique')
})

test('every mapping has canonicalKey and confidenceDefault in 0-100', () => {
  for (const [source, mappings] of Object.entries(CANONICAL_METRICS_MAPPING)) {
    for (const [sourceKey, mapping] of Object.entries(mappings)) {
      assert.ok(
        typeof mapping.canonicalKey === 'string' && mapping.canonicalKey.length > 0,
        `${source}.${sourceKey} missing canonicalKey`,
      )
      assert.ok(
        Number.isInteger(mapping.confidenceDefault) &&
          mapping.confidenceDefault >= 0 &&
          mapping.confidenceDefault <= 100,
        `${source}.${sourceKey} confidenceDefault must be 0-100 int`,
      )
    }
  }
})

test('canonicalKey naming convention: snake_case lowercase', () => {
  const re = /^[a-z][a-z0-9_]*$/
  for (const mappings of Object.values(CANONICAL_METRICS_MAPPING)) {
    for (const mapping of Object.values(mappings)) {
      assert.match(mapping.canonicalKey, re, `Invalid canonical key: ${mapping.canonicalKey}`)
    }
  }
})
