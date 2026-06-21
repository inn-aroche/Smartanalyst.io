// Service export XLSX pour les reponses chat (cahier 22b §3.4 + §4.3).
//
// Pour eviter de creer un bucket Supabase Storage + RLS + CRON de cleanup,
// on streame le fichier directement en reponse HTTP — l'user telecharge,
// rien n'est persiste cote serveur. Cap 50K cellules (cahier 22b §4.3) :
// au-dela on refuse et on suggere d'affiner la periode.

const ExcelJS = require('exceljs')

const MAX_CELLS = 50_000

class XlsxCellLimitExceeded extends Error {
  constructor(cells) {
    super(`XLSX export refuse : ${cells} cellules > limite ${MAX_CELLS}.`)
    this.code = 'XLSX_CELL_LIMIT'
    this.cells = cells
  }
}

/**
 * Construit un Workbook a partir des blocks (text + highlights) d'une reponse
 * chat. 1 feuille de cover ("Reponse") avec le texte, puis 1 feuille par
 * highlight serie/table.
 *
 * @param {object} args
 * @param {string} args.text             Texte de la reponse assistant (markdown).
 * @param {Array}  args.highlights       Liste de Highlight (cf chat-highlights).
 * @param {string} args.conversationId   Pour le nom de fichier.
 * @param {string} args.messageId        Pour le nom de fichier.
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
async function buildXlsx({ text, highlights = [], conversationId, messageId }) {
  // Pre-check cellules : sum(rows × cols) sur tous les blocs.
  let cells = countCells(text, highlights)
  if (cells > MAX_CELLS) throw new XlsxCellLimitExceeded(cells)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'SmartAnalyst'
  wb.created = new Date()

  // ─── Feuille cover : texte de la reponse ─────────────────────────────
  const cover = wb.addWorksheet('Reponse', {
    properties: { tabColor: { argb: 'FF5C8FFF' } },
    pageSetup: { paperSize: 9, orientation: 'portrait' },
  })
  cover.columns = [{ header: 'SmartAnalyst — Reponse', key: 'text', width: 100 }]
  cover.getRow(1).font = { bold: true, size: 13 }
  let row = 2
  for (const line of String(text || '').split('\n')) {
    cover.getCell(`A${row}`).value = line
    cover.getCell(`A${row}`).alignment = { wrapText: true, vertical: 'top' }
    row++
  }

  // ─── 1 feuille par highlight exportable ───────────────────────────────
  let chartIdx = 1
  let tableIdx = 1
  let compareIdx = 1
  for (const h of highlights) {
    if (h.type === 'chart' && Array.isArray(h.series) && h.series.length > 0) {
      const name = sanitizeSheetName(h.title || `Chart ${chartIdx++}`)
      const ws = wb.addWorksheet(name)
      ws.columns = [
        { header: 'date', key: 'date', width: 14 },
        { header: 'value', key: 'value', width: 16 },
      ]
      ws.getRow(1).font = { bold: true }
      for (const p of h.series) ws.addRow({ date: p.date, value: p.value })
    } else if (h.type === 'table' && Array.isArray(h.rows) && Array.isArray(h.columns)) {
      const name = sanitizeSheetName(h.title || `Tableau ${tableIdx++}`)
      const ws = wb.addWorksheet(name)
      ws.columns = h.columns.map((c) => ({ header: c, key: c, width: 18 }))
      ws.getRow(1).font = { bold: true }
      for (const r of h.rows) ws.addRow(r)
    } else if (h.type === 'compare' && h.left?.series && h.right?.series) {
      const name = sanitizeSheetName(h.title || `Comparaison ${compareIdx++}`)
      const ws = wb.addWorksheet(name)
      ws.columns = [
        { header: 'date', key: 'date', width: 14 },
        { header: h.left.source || 'A', key: 'left', width: 16 },
        { header: h.right.source || 'B', key: 'right', width: 16 },
      ]
      ws.getRow(1).font = { bold: true }
      // Merge par date pour mettre les 2 valeurs sur la meme ligne.
      const byDate = new Map()
      for (const p of h.left.series)
        byDate.set(p.date, { date: p.date, left: p.value, right: null })
      for (const p of h.right.series) {
        const existing = byDate.get(p.date) || { date: p.date, left: null, right: null }
        existing.right = p.value
        byDate.set(p.date, existing)
      }
      const rows = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
      for (const r of rows) ws.addRow(r)
    } else if (h.type === 'kpi' && h.title && h.value != null) {
      // KPI tout seul → 1 ligne dans une feuille agregee "KPIs".
      let ws = wb.getWorksheet('KPIs')
      if (!ws) {
        ws = wb.addWorksheet('KPIs')
        ws.columns = [
          { header: 'KPI', key: 'kpi', width: 30 },
          { header: 'Valeur', key: 'value', width: 18 },
          { header: 'Delta', key: 'delta', width: 12 },
        ]
        ws.getRow(1).font = { bold: true }
      }
      ws.addRow({ kpi: h.title, value: h.value, delta: h.delta || null })
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = buildFilename(conversationId, messageId)
  return { buffer: Buffer.from(buffer), filename }
}

function buildFilename(conversationId, messageId) {
  const slug = (conversationId || messageId || 'export').slice(0, 12)
  const date = new Date().toISOString().slice(0, 10)
  return `smartanalyst-chat-${slug}-${date}.xlsx`
}

/**
 * Compte les cellules d'avance pour pre-rejeter un export trop gros sans
 * generer un buffer xlsx inutilement.
 */
function countCells(text, highlights) {
  let cells = String(text || '').split('\n').length // cover sheet
  for (const h of highlights || []) {
    if (h?.type === 'chart' && Array.isArray(h.series)) cells += h.series.length * 2 + 1
    else if (h?.type === 'table' && Array.isArray(h.rows) && Array.isArray(h.columns)) {
      cells += (h.rows.length + 1) * h.columns.length
    } else if (h?.type === 'compare' && h?.left?.series && h?.right?.series) {
      // Set des dates union, * 3 colonnes.
      const dates = new Set()
      for (const p of h.left.series) dates.add(p.date)
      for (const p of h.right.series) dates.add(p.date)
      cells += (dates.size + 1) * 3
    } else if (h?.type === 'kpi') cells += 3
  }
  return cells
}

/** Nom de feuille Excel : max 31 chars, sans `[]:*?/\`. */
function sanitizeSheetName(raw) {
  let s = String(raw || '')
    .replace(/[\\/?*[\]:]/g, '')
    .trim()
  if (!s) s = 'Sheet'
  return s.length > 31 ? s.slice(0, 31) : s
}

module.exports = { buildXlsx, XlsxCellLimitExceeded, MAX_CELLS }
