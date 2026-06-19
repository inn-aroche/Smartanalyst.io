// Tests les helpers pures de personnalisation reports : previousRange +
// computeDeltaPct.

const test = require('node:test')
const assert = require('node:assert/strict')

const { previousRange, computeDeltaPct } = require('../src/services/reports/report-generator.service')

test('previousRange : mois complet → mois calendaire précédent', () => {
  const r = previousRange('2026-06-01', '2026-06-30')
  // Période = 30j (du 01 au 30 inclus). Précédente = 30j avant → 02 → 31 mai.
  assert.equal(r.start, '2026-05-02')
  assert.equal(r.end, '2026-05-31')
})

test('previousRange : 7 jours → 7 jours avant', () => {
  const r = previousRange('2026-06-15', '2026-06-21')
  // 7 jours (15→21). Précédente = 7 jours avant la 15, fin = 14, début = 8.
  assert.equal(r.start, '2026-06-08')
  assert.equal(r.end, '2026-06-14')
})

test('previousRange : 1 jour → 1 jour avant', () => {
  const r = previousRange('2026-06-15', '2026-06-15')
  assert.equal(r.start, '2026-06-14')
  assert.equal(r.end, '2026-06-14')
})

test('previousRange : janvier 31j → décembre 31j', () => {
  const r = previousRange('2026-01-01', '2026-01-31')
  // 31 jours inclusifs → 30 jours de diff → fenêtre précédente = 31 jours
  // se terminant le 31/12 et commençant le 01/12.
  assert.equal(r.start, '2025-12-01')
  assert.equal(r.end, '2025-12-31')
})

test('computeDeltaPct : delta positif', () => {
  assert.equal(computeDeltaPct(110, 100), 10)
})

test('computeDeltaPct : delta négatif', () => {
  assert.equal(computeDeltaPct(90, 100), -10)
})

test('computeDeltaPct : prev = 0 → null (pas de division par zéro)', () => {
  assert.equal(computeDeltaPct(100, 0), null)
})

test('computeDeltaPct : prev = null → null', () => {
  assert.equal(computeDeltaPct(100, null), null)
})

test('computeDeltaPct : curr = null → null', () => {
  assert.equal(computeDeltaPct(null, 100), null)
})

test('computeDeltaPct : prev négatif → utilise Math.abs (delta vs magnitude)', () => {
  // CPA passé de -100 à -50 = amélioration de 50% (en moins)
  assert.equal(computeDeltaPct(-50, -100), 50)
})
