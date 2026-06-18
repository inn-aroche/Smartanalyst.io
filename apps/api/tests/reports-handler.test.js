// Tests des helpers de reports.handler — focus timezone correctness.
// Pas de mocks : on appelle directement les fonctions pures.

const test = require('node:test')
const assert = require('node:assert/strict')

const { dayOfMonthInTz, previousMonthRange } = require('../src/queue-jobs/handlers/reports.handler')

test('dayOfMonthInTz: tz Paris à 23h UTC voit le jour suivant', () => {
  // 2026-06-30 23:30 UTC = 2026-07-01 01:30 Europe/Paris (CEST UTC+2)
  const d = new Date('2026-06-30T23:30:00Z')
  assert.equal(dayOfMonthInTz(d, 'Europe/Paris'), 1)
})

test('dayOfMonthInTz: tz US/Eastern à 03h UTC est encore la veille', () => {
  // 2026-07-01 03:00 UTC = 2026-06-30 23:00 America/New_York (EDT UTC-4)
  const d = new Date('2026-07-01T03:00:00Z')
  assert.equal(dayOfMonthInTz(d, 'America/New_York'), 30)
})

test('dayOfMonthInTz: tz manquante → fallback UTC', () => {
  const d = new Date('2026-07-01T03:00:00Z')
  assert.equal(dayOfMonthInTz(d, null), 1)
  assert.equal(dayOfMonthInTz(d, undefined), 1)
})

test('dayOfMonthInTz: tz invalide → fallback UTC sans throw', () => {
  const d = new Date('2026-07-01T03:00:00Z')
  assert.equal(dayOfMonthInTz(d, 'Not/A_Real_Tz'), 1)
})

test('previousMonthRange: 2026-07-01 (Paris) → tout juin', () => {
  const today = new Date('2026-07-01T07:00:00Z')
  const r = previousMonthRange(today, 'Europe/Paris')
  assert.equal(r.periodStart, '2026-06-01')
  assert.equal(r.periodEnd, '2026-06-30')
})

test('previousMonthRange: rollover 1er janvier → décembre N-1', () => {
  const today = new Date('2026-01-01T12:00:00Z')
  const r = previousMonthRange(today, 'UTC')
  assert.equal(r.periodStart, '2025-12-01')
  assert.equal(r.periodEnd, '2025-12-31')
})

test('previousMonthRange: 1er mars → février (28 jours, année non-bissextile)', () => {
  const today = new Date('2026-03-01T12:00:00Z')
  const r = previousMonthRange(today, 'UTC')
  assert.equal(r.periodStart, '2026-02-01')
  assert.equal(r.periodEnd, '2026-02-28')
})

test('previousMonthRange: 1er mars sur année bissextile → 29 jours', () => {
  const today = new Date('2028-03-01T12:00:00Z')
  const r = previousMonthRange(today, 'UTC')
  assert.equal(r.periodStart, '2028-02-01')
  assert.equal(r.periodEnd, '2028-02-29')
})
