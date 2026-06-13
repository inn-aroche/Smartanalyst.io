// Tests de la logique de selection des tiles du dashboard summary
// selon les connecteurs actifs du workspace.
//
// Pourquoi : avant cette PR, le dashboard affichait 4 KPIs hardcoded
// (sessions, conversions, revenue_total, spend_paid_total) qui ne sont
// émis par AUCUN connecteur dans leur forme actuelle. Un user qui
// connecte Stripe voyait 4 tiles "—" alors que ses metrics étaient bien
// ingérées sous d'autres keys (mrr, customers_active, etc.).
//
// Maintenant les tiles s'adaptent : Stripe → MRR/customers, GA4 →
// sessions/conversions, Meta → ROAS/CPA, etc. Round-robin si plusieurs.

const test = require('node:test')
const assert = require('node:assert/strict')

const { selectTiles, TILES_BY_SOURCE, DEFAULT_TILES } = require('../src/routes/metrics.routes')

test('selectTiles sans connecteur actif → DEFAULT_TILES', () => {
  const tiles = selectTiles([])
  assert.equal(tiles.length, 4)
  assert.deepEqual(tiles, DEFAULT_TILES)
})

test('selectTiles avec source inconnue → fallback DEFAULT_TILES', () => {
  const tiles = selectTiles(['unknown_source'])
  assert.deepEqual(tiles, DEFAULT_TILES)
})

test('selectTiles avec Stripe seul → 4 tiles Stripe', () => {
  const tiles = selectTiles(['stripe'])
  assert.equal(tiles.length, 4)
  assert.equal(tiles[0].key, 'revenue_recurring_monthly')
  assert.equal(tiles[0].kind, 'snapshot') // MRR = snapshot, pas sum
  assert.equal(tiles[1].key, 'customers_active')
  assert.equal(tiles[2].key, 'customers_new')
  assert.equal(tiles[3].key, 'failed_payments_month')
})

test('selectTiles avec GA4 seul → 4 tiles GA4', () => {
  const tiles = selectTiles(['ga4'])
  assert.equal(tiles.length, 4)
  assert.equal(tiles[0].key, 'sessions_all')
  assert.equal(tiles[1].key, 'conversions_total')
})

test('selectTiles avec Stripe + GA4 → round-robin 2 tiles chacun', () => {
  const tiles = selectTiles(['stripe', 'ga4'])
  assert.equal(tiles.length, 4)
  // Pattern attendu :
  //   - tile[0] = stripe[0] = revenue_recurring_monthly (MRR)
  //   - tile[1] = ga4[0]    = sessions_all
  //   - tile[2] = stripe[1] = customers_active
  //   - tile[3] = ga4[1]    = conversions_total
  assert.equal(tiles[0].key, 'revenue_recurring_monthly')
  assert.equal(tiles[1].key, 'sessions_all')
  assert.equal(tiles[2].key, 'customers_active')
  assert.equal(tiles[3].key, 'conversions_total')
})

test('selectTiles avec 4 sources → 1 tile par source', () => {
  const tiles = selectTiles(['stripe', 'ga4', 'meta_ads', 'google_ads'])
  assert.equal(tiles.length, 4)
  // 1ère tile de chaque source
  assert.equal(tiles[0].key, 'revenue_recurring_monthly') // Stripe
  assert.equal(tiles[1].key, 'sessions_all')              // GA4
  assert.equal(tiles[2].key, 'spend_paid_social')         // Meta
  assert.equal(tiles[3].key, 'spend_paid_search')         // Google Ads
})

test('selectTiles : toutes les keys sélectionnées sont uniques (dédup)', () => {
  // Test avec plusieurs combinaisons qui PEUVENT introduire des doublons :
  //   Stripe + Shopify (les 2 ont customers_new)
  //   Meta + Google Ads (positions similaires mais clés différentes)
  for (const sources of [
    ['stripe', 'shopify'],
    ['stripe', 'ga4', 'meta_ads', 'shopify'],
    ['ga4', 'meta_ads', 'google_ads', 'search_console'],
  ]) {
    const tiles = selectTiles(sources)
    const keys = tiles.map((t) => t.key)
    const unique = new Set(keys)
    assert.equal(unique.size, keys.length, `Duplicate keys with sources=${sources.join(',')}: ${keys.join(', ')}`)
  }
})

test('TILES_BY_SOURCE structure : chaque source a >= 1 tile bien formée', () => {
  for (const [source, list] of Object.entries(TILES_BY_SOURCE)) {
    assert.ok(list.length >= 1, `${source} should have ≥ 1 tile`)
    for (const tile of list) {
      assert.ok(tile.key, `${source} tile missing key`)
      assert.ok(tile.label, `${source} tile missing label`)
      assert.ok(['sum', 'snapshot'].includes(tile.kind), `${source} tile bad kind`)
      assert.ok(
        ['currency', 'integer', 'ratio'].includes(tile.format),
        `${source} tile bad format`,
      )
    }
  }
})
