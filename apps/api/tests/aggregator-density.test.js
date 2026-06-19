// Tests pour la logique de signifiance / densité de données de
// l'aggregator (cahier §3 Lot 0 — seuil de signifiance avant insight).
// Run: node --test tests/aggregator-density.test.js

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  computeDataDensity,
  MIN_DAYS_OF_DATA,
} = require('../src/services/insights/aggregator.service')

test('MIN_DAYS_OF_DATA est calé sur 7 (cahier §3 Lot 0)', () => {
  assert.equal(MIN_DAYS_OF_DATA, 7)
})

test('computeDataDensity : compte les jours distincts dans une fenêtre', () => {
  const rows = [
    { date: '2026-06-01', metric_value: 10 },
    { date: '2026-06-01', metric_value: 5 }, // doublon de jour
    { date: '2026-06-02', metric_value: 7 },
    { date: '2026-06-03', metric_value: 9 },
  ]
  const d = computeDataDensity(rows, 30)
  assert.equal(d.days_with_data, 3)
  assert.equal(d.days_in_window, 30)
  assert.equal(d.min_days_required, MIN_DAYS_OF_DATA)
  assert.equal(d.sufficient, false)
})

test('computeDataDensity : sufficient=true dès MIN_DAYS_OF_DATA jours distincts', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-06-0${i + 1}`,
    metric_value: 1,
  }))
  const d = computeDataDensity(rows, 30)
  assert.equal(d.days_with_data, 7)
  assert.equal(d.sufficient, true)
})

test('computeDataDensity : tolère un input vide ou nullish', () => {
  assert.equal(computeDataDensity([], 30).sufficient, false)
  assert.equal(computeDataDensity(null, 30).days_with_data, 0)
  assert.equal(computeDataDensity(undefined, 30).days_with_data, 0)
})

test('computeDataDensity : tronque les timestamps avec time component', () => {
  const rows = [
    { date: '2026-06-01T12:34:56Z' },
    { date: '2026-06-01T20:00:00Z' },
  ]
  const d = computeDataDensity(rows, 30)
  // Même jour calendaire malgré les deux entrées
  assert.equal(d.days_with_data, 1)
})

test('computeDataDensity : ignore les rows malformés', () => {
  const rows = [
    { date: '2026-06-01' },
    { foo: 'bar' },
    null,
    { date: 42 },
    { date: '2026-06-02' },
  ]
  const d = computeDataDensity(rows, 30)
  assert.equal(d.days_with_data, 2)
})
