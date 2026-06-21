// Tests : chat-export.service (cahier 22b §4.3 — XLSX reel via exceljs).

const test = require('node:test')
const assert = require('node:assert/strict')

const ExcelJS = require('exceljs')
const { buildXlsx, MAX_CELLS } = require('../src/services/ai/chat-export.service')

async function workbookFromBuffer(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

test('buildXlsx : minimal — texte seul → 1 feuille Reponse', async () => {
  const { buffer, filename } = await buildXlsx({
    text: 'Bonjour.\nDeuxieme ligne.',
    highlights: [],
    conversationId: 'conv-1',
    messageId: 'msg-1',
  })
  assert.ok(buffer.length > 0)
  assert.match(filename, /\.xlsx$/)
  const wb = await workbookFromBuffer(buffer)
  const cover = wb.getWorksheet('Reponse')
  assert.ok(cover)
  // Ligne 1 = header, lignes 2-3 = les 2 lignes de texte.
  assert.equal(cover.getCell('A2').value, 'Bonjour.')
  assert.equal(cover.getCell('A3').value, 'Deuxieme ligne.')
})

test('buildXlsx : highlight chart → feuille avec date,value', async () => {
  const { buffer } = await buildXlsx({
    text: '',
    highlights: [
      {
        type: 'chart',
        title: 'CA — 7j',
        series: [
          { date: '2026-06-01', value: 100 },
          { date: '2026-06-02', value: 200 },
        ],
      },
    ],
    conversationId: 'c1',
    messageId: 'm1',
  })
  const wb = await workbookFromBuffer(buffer)
  const ws = wb.getWorksheet('CA — 7j')
  assert.ok(ws)
  assert.equal(ws.getCell('A1').value, 'date')
  assert.equal(ws.getCell('B1').value, 'value')
  assert.equal(ws.getCell('A2').value, '2026-06-01')
  assert.equal(ws.getCell('B2').value, 100)
})

test('buildXlsx : highlight table → feuille avec columns + rows', async () => {
  const { buffer } = await buildXlsx({
    text: '',
    highlights: [
      {
        type: 'table',
        title: 'Top canaux',
        columns: ['source', 'sessions_all'],
        rows: [
          { source: 'meta_ads', sessions_all: 300 },
          { source: 'ga4', sessions_all: 150 },
        ],
      },
    ],
    conversationId: 'c1',
    messageId: 'm1',
  })
  const wb = await workbookFromBuffer(buffer)
  const ws = wb.getWorksheet('Top canaux')
  assert.ok(ws)
  assert.equal(ws.getCell('A1').value, 'source')
  assert.equal(ws.getCell('B1').value, 'sessions_all')
  assert.equal(ws.getCell('A2').value, 'meta_ads')
  assert.equal(ws.getCell('B2').value, 300)
})

test('buildXlsx : highlight compare → feuille avec 3 colonnes (date + left + right)', async () => {
  const { buffer } = await buildXlsx({
    text: '',
    highlights: [
      {
        type: 'compare',
        title: 'Sessions GA4 vs Meta',
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
    conversationId: 'c1',
    messageId: 'm1',
  })
  const wb = await workbookFromBuffer(buffer)
  const ws = wb.getWorksheet('Sessions GA4 vs Meta')
  assert.ok(ws)
  assert.equal(ws.getCell('A1').value, 'date')
  assert.equal(ws.getCell('B1').value, 'ga4')
  assert.equal(ws.getCell('C1').value, 'meta_ads')
  // Lignes mergeees par date.
  assert.equal(ws.getCell('A2').value, '2026-06-01')
  assert.equal(ws.getCell('B2').value, 100)
  assert.equal(ws.getCell('C2').value, 50)
})

test('buildXlsx : kpi agreges dans une feuille "KPIs"', async () => {
  const { buffer } = await buildXlsx({
    text: '',
    highlights: [
      { type: 'kpi', title: 'MRR', value: 4200, delta: '+8%' },
      { type: 'kpi', title: 'Sessions', value: 10500, delta: '-2%' },
    ],
    conversationId: 'c1',
    messageId: 'm1',
  })
  const wb = await workbookFromBuffer(buffer)
  const kpis = wb.getWorksheet('KPIs')
  assert.ok(kpis)
  assert.equal(kpis.getCell('A1').value, 'KPI')
  assert.equal(kpis.getCell('A2').value, 'MRR')
  assert.equal(kpis.getCell('B2').value, 4200)
  assert.equal(kpis.getCell('A3').value, 'Sessions')
})

test('buildXlsx : > MAX_CELLS → throw XLSX_CELL_LIMIT', async () => {
  // Un highlight table avec 25000 lignes * 3 cols = 75000 cellules > 50K.
  const rows = []
  for (let i = 0; i < 25000; i++) rows.push({ a: i, b: i, c: i })
  await assert.rejects(
    () =>
      buildXlsx({
        text: '',
        highlights: [{ type: 'table', title: 'Big', columns: ['a', 'b', 'c'], rows }],
        conversationId: 'c1',
        messageId: 'm1',
      }),
    (e) => e.code === 'XLSX_CELL_LIMIT' && e.cells > MAX_CELLS,
  )
})

test('buildXlsx : sanitize nom de feuille (caracteres interdits Excel)', async () => {
  const { buffer } = await buildXlsx({
    text: '',
    highlights: [
      {
        type: 'chart',
        title: 'CA [important*]/test',
        series: [
          { date: '2026-06-01', value: 1 },
          { date: '2026-06-02', value: 2 },
        ],
      },
    ],
    conversationId: 'c1',
    messageId: 'm1',
  })
  const wb = await workbookFromBuffer(buffer)
  // Doit avoir au moins une feuille, sans crash sur l'ecriture.
  assert.ok(wb.worksheets.length >= 2) // Reponse + chart
  // Aucune feuille ne doit contenir des chars interdits.
  for (const ws of wb.worksheets) {
    assert.doesNotMatch(ws.name, /[\\/?*[\]:]/)
  }
})
