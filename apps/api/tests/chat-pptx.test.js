// Tests chat-pptx.service (cahier 22b §4.4 — slide deck generation).

const test = require('node:test')
const assert = require('node:assert/strict')

const { buildPptx, MAX_SLIDES, PptxSlideLimitExceeded } = require('../src/services/ai/chat-pptx.service')

test('buildPptx : highlights vides → 1 slide cover seul, buffer non-vide', async () => {
  const { buffer, filename } = await buildPptx({
    title: 'SmartAnalyst',
    subtitle: 'Test',
    highlights: [],
  })
  assert.ok(buffer.length > 1000, 'pptx buffer should be > 1 KB')
  assert.match(filename, /\.pptx$/)
  // Un .pptx est un zip → commence par PK (signature ZIP).
  assert.equal(buffer[0], 0x50) // P
  assert.equal(buffer[1], 0x4b) // K
})

test('buildPptx : 1 KPI + 1 chart + 1 table = 1 cover + 3 slides', async () => {
  const { buffer } = await buildPptx({
    title: 'Test',
    highlights: [
      { type: 'kpi', title: 'MRR', value: '4200€', delta: '+8%' },
      {
        type: 'chart',
        title: 'CA — 7j',
        series: [
          { date: '2026-06-01', value: 100 },
          { date: '2026-06-02', value: 150 },
          { date: '2026-06-03', value: 200 },
        ],
      },
      {
        type: 'table',
        title: 'Top canaux',
        columns: ['source', 'sessions_all'],
        rows: [
          { source: 'ga4', sessions_all: 1500 },
          { source: 'meta_ads', sessions_all: 800 },
        ],
      },
    ],
  })
  assert.ok(buffer.length > 5000)
})

test('buildPptx : funnel → slide avec barres + table retention', async () => {
  const { buffer } = await buildPptx({
    title: 'Funnel test',
    highlights: [
      {
        type: 'funnel',
        title: 'Funnel ecommerce',
        steps: [
          { label: 'sessions_all', value: 1000, retentionPct: null },
          { label: 'add_to_cart', value: 250, retentionPct: 25 },
          { label: 'orders_count', value: 50, retentionPct: 20 },
        ],
      },
    ],
  })
  assert.ok(buffer.length > 5000)
})

test('buildPptx : compare → slide avec line chart 2 series', async () => {
  const { buffer } = await buildPptx({
    title: 'Compare test',
    highlights: [
      {
        type: 'compare',
        title: 'GA4 vs Meta',
        left: {
          source: 'ga4',
          total: 300,
          series: [
            { date: '2026-06-01', value: 100 },
            { date: '2026-06-02', value: 200 },
          ],
        },
        right: {
          source: 'meta_ads',
          total: 125,
          series: [
            { date: '2026-06-01', value: 50 },
            { date: '2026-06-02', value: 75 },
          ],
        },
      },
    ],
  })
  assert.ok(buffer.length > 5000)
})

test('buildPptx : dashboard 4 cards → slide en grille 2x2', async () => {
  const { buffer } = await buildPptx({
    title: 'Dashboard',
    highlights: [
      {
        type: 'dashboard',
        title: 'Aperçu 30j',
        cards: [
          { metricKey: 'sessions_all', value: 10000, deltaPct: 12 },
          { metricKey: 'revenue_ecommerce', value: 4500, deltaPct: -3 },
          { metricKey: 'orders_count', value: 120, deltaPct: 0 },
          { metricKey: 'conversions_total', value: 250, deltaPct: 8 },
        ],
      },
    ],
  })
  assert.ok(buffer.length > 5000)
})

test('buildPptx : > MAX_SLIDES → throw PptxSlideLimitExceeded', async () => {
  // 1 cover + N highlights renderables. MAX_SLIDES=10 → besoin 10+ renderables.
  const highlights = []
  for (let i = 0; i < MAX_SLIDES + 2; i++) {
    highlights.push({ type: 'kpi', title: `KPI ${i}`, value: String(i) })
  }
  await assert.rejects(
    () => buildPptx({ title: 'X', highlights }),
    (e) => e.code === 'PPTX_SLIDE_LIMIT' && e instanceof PptxSlideLimitExceeded,
  )
})

test('buildPptx : highlights non-renderables (chart 1 point, kpi sans value) sont skip', async () => {
  // 1 chart valide + 3 non-renderables = 1 cover + 1 slide = 2 total. Pas de throw.
  const { buffer } = await buildPptx({
    title: 'X',
    highlights: [
      { type: 'chart', title: 'OK', series: [{ date: '2026-06-01', value: 1 }, { date: '2026-06-02', value: 2 }] },
      { type: 'chart', title: 'Vide', series: [{ date: '2026-06-01', value: 1 }] }, // 1 point only
      { type: 'kpi', title: 'No value' }, // pas de value
      { type: 'unknown', title: 'Bogus' }, // type inconnu
    ],
  })
  assert.ok(buffer.length > 1000)
})
