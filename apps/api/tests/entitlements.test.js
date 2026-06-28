// Tests entitlements.service — normalisation des plans + feature flags.
// Garde-fou critique : un changement de PLAN_FEATURES ou LEGACY_TO_MVP doit
// casser ces tests si la regle business derape (fuite de revenus = bug bloquant).

const test = require('node:test')
const assert = require('node:assert/strict')

const { canUseFeature, PLAN_FEATURES } = require('../src/services/billing/entitlements.service')

test('PLAN_FEATURES expose 3 plans : free, starter, pro', () => {
  assert.deepEqual(Object.keys(PLAN_FEATURES).sort(), ['free', 'pro', 'starter'])
})

test('free : aucune feature premium', () => {
  assert.equal(canUseFeature('free', 'reports'), false)
  assert.equal(canUseFeature('free', 'deep_chat'), false)
  assert.equal(canUseFeature('free', 'pin_to_dashboard'), false)
  assert.equal(canUseFeature('free', 'generate_slides'), false)
})

test('starter : rapports OUI, le reste NON (cf. pricing public 29€)', () => {
  assert.equal(canUseFeature('starter', 'reports'), true)
  assert.equal(canUseFeature('starter', 'deep_chat'), false)
  assert.equal(canUseFeature('starter', 'pin_to_dashboard'), false)
  assert.equal(canUseFeature('starter', 'generate_slides'), false)
})

test('pro : toutes features ON', () => {
  assert.equal(canUseFeature('pro', 'reports'), true)
  assert.equal(canUseFeature('pro', 'deep_chat'), true)
  assert.equal(canUseFeature('pro', 'pin_to_dashboard'), true)
  assert.equal(canUseFeature('pro', 'generate_slides'), true)
})

test('LEGACY : agency mappe sur pro (clients heritage 199€ ne regressent pas)', () => {
  assert.equal(canUseFeature('agency', 'pin_to_dashboard'), true)
  assert.equal(canUseFeature('agency', 'generate_slides'), true)
})

test('LEGACY : trial mappe sur free (bug critique : sinon nouveaux users gratuits)', () => {
  // auth.service cree un compte avec status='trial' à l'inscription. Sans le
  // mapping trial → free, l'user aurait acces Pro complet sans payer.
  assert.equal(canUseFeature('trial', 'deep_chat'), false)
  assert.equal(canUseFeature('trial', 'pin_to_dashboard'), false)
  assert.equal(canUseFeature('trial', 'generate_slides'), false)
  assert.equal(canUseFeature('trial', 'reports'), false)
})

test('LEGACY : starter NE doit PLUS etre mappe sur pro (regression V2.3)', () => {
  // Avant V2.3, LEGACY_TO_MVP = { starter: 'pro', agency: 'pro', trial: 'free' }
  // → un Starter 29€ avait acces a TOUTES les features Pro 59€ (fuite revenus).
  // Maintenant Starter est un tier reel avec ses propres quotas.
  assert.equal(canUseFeature('starter', 'pin_to_dashboard'), false)
  assert.equal(canUseFeature('starter', 'generate_slides'), false)
  assert.equal(canUseFeature('starter', 'deep_chat'), false)
})

test('plan inconnu / null → fallback free (fail-secure)', () => {
  assert.equal(canUseFeature(null, 'reports'), false)
  assert.equal(canUseFeature('haxor', 'pin_to_dashboard'), false)
  assert.equal(canUseFeature(undefined, 'deep_chat'), false)
})

test('feature inconnue → false', () => {
  assert.equal(canUseFeature('pro', 'haxor_feature'), false)
})

test('quotas : free=1 connector, starter=3, pro=Infinity', () => {
  assert.equal(PLAN_FEATURES.free.maxConnectors, 1)
  assert.equal(PLAN_FEATURES.starter.maxConnectors, 3)
  assert.equal(PLAN_FEATURES.pro.maxConnectors, Infinity)
})

test('quotas insights : free=3/mois, starter=100/mois, pro=Infinity', () => {
  assert.equal(PLAN_FEATURES.free.maxInsightsPerMonth, 3)
  assert.equal(PLAN_FEATURES.starter.maxInsightsPerMonth, 100)
  assert.equal(PLAN_FEATURES.pro.maxInsightsPerMonth, Infinity)
})

test('quotas AI tokens : free=50K, starter=500K, pro=Infinity', () => {
  assert.equal(PLAN_FEATURES.free.maxAiTokensPerMonth, 50_000)
  assert.equal(PLAN_FEATURES.starter.maxAiTokensPerMonth, 500_000)
  assert.equal(PLAN_FEATURES.pro.maxAiTokensPerMonth, Infinity)
})

// ─── normalizePlan ──────────────────────────────────────────────────────
const { normalizePlan } = require('../src/services/billing/entitlements.service')

test('normalizePlan : plans connus retournés tels quels', () => {
  assert.equal(normalizePlan('free'), 'free')
  assert.equal(normalizePlan('starter'), 'starter')
  assert.equal(normalizePlan('pro'), 'pro')
})

test('normalizePlan : legacy mapping (agency→pro, trial→free)', () => {
  assert.equal(normalizePlan('agency'), 'pro')
  assert.equal(normalizePlan('trial'), 'free')
})

test('normalizePlan : null/undefined/unknown → free', () => {
  assert.equal(normalizePlan(null), 'free')
  assert.equal(normalizePlan(undefined), 'free')
  assert.equal(normalizePlan('unknown'), 'free')
})

test('normalizePlan : case-insensitive', () => {
  assert.equal(normalizePlan('PRO'), 'pro')
  assert.equal(normalizePlan('Free'), 'free')
  assert.equal(normalizePlan('TRIAL'), 'free')
})
