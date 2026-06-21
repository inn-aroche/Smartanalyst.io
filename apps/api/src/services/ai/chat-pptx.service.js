// Service export PPTX pour les reponses chat (cahier 22b §4.4).
//
// Genere un .pptx via pptxgenjs (zero Office), 1 slide cover + 1 slide par
// highlight significatif (kpi / chart / table / compare / funnel /
// dashboard). Theme = brand colors workspace si white-label, sinon brand
// SmartAnalyst par defaut. Cap 10 slides max.
//
// Comme l'export XLSX, on streame le buffer directement — aucun stockage.

const PptxGenJS = require('pptxgenjs')

const MAX_SLIDES = 10

class PptxSlideLimitExceeded extends Error {
  constructor(count) {
    super(`PPTX export refuse : ${count} slides > limite ${MAX_SLIDES}.`)
    this.code = 'PPTX_SLIDE_LIMIT'
    this.count = count
  }
}

// Theme par defaut SmartAnalyst (cohérent avec la palette web).
const DEFAULT_THEME = {
  primary: '5C8FFF', // brand-blue-deep
  accent: '2DD9EE', // brand-cyan
  text: '14142A',
  muted: '5C5C78',
  bg: 'F5F5F9',
}

/**
 * Construit un PPTX a partir des highlights d'une reponse chat.
 *
 * @param {object} args
 * @param {string} args.title             Titre du deck (ex : "Analyse du mois — workspace X")
 * @param {string} args.subtitle          Sous-titre (ex : "Genere depuis SmartAnalyst — 22 juin 2026")
 * @param {Array}  args.highlights        Liste de Highlight a transformer en slides.
 * @param {object} [args.theme]           Override couleurs ; sinon DEFAULT_THEME.
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
async function buildPptx({ title, subtitle, highlights = [], theme = DEFAULT_THEME }) {
  // Pre-check : 1 cover + nb highlights significatifs ; refuse si > MAX_SLIDES.
  const renderable = highlights.filter(isRenderable)
  const slideCount = 1 + renderable.length
  if (slideCount > MAX_SLIDES) throw new PptxSlideLimitExceeded(slideCount)

  const pptx = new PptxGenJS()
  pptx.author = 'SmartAnalyst'
  pptx.company = 'SmartAnalyst'
  pptx.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 inch

  // ─── Slide 1 : cover ────────────────────────────────────────────────────
  const cover = pptx.addSlide()
  cover.background = { color: theme.text }
  cover.addText(title || 'SmartAnalyst', {
    x: 0.6,
    y: 2.4,
    w: 12,
    h: 1.2,
    fontSize: 44,
    bold: true,
    color: 'FFFFFF',
    fontFace: 'Helvetica',
  })
  if (subtitle) {
    cover.addText(subtitle, {
      x: 0.6,
      y: 3.8,
      w: 12,
      h: 0.5,
      fontSize: 18,
      color: theme.accent,
      fontFace: 'Helvetica',
    })
  }
  // Barre gradient bas — touche brand discrete.
  cover.addShape('rect', {
    x: 0.6,
    y: 6.7,
    w: 12,
    h: 0.08,
    fill: { color: theme.accent },
  })

  // ─── 1 slide par highlight ──────────────────────────────────────────────
  for (const h of renderable) {
    const slide = pptx.addSlide()
    slide.background = { color: 'FFFFFF' }

    // Header commun (titre + petite bande de couleur).
    slide.addText(String(h.title || 'Insight').slice(0, 100), {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 0.5,
      fontSize: 22,
      bold: true,
      color: theme.text,
      fontFace: 'Helvetica',
    })
    if (h.summary) {
      slide.addText(String(h.summary).slice(0, 200), {
        x: 0.6,
        y: 0.95,
        w: 12,
        h: 0.4,
        fontSize: 13,
        color: theme.muted,
        italic: true,
        fontFace: 'Helvetica',
      })
    }

    if (h.type === 'kpi') {
      renderKpiSlide(slide, h, theme)
    } else if (h.type === 'chart' && Array.isArray(h.series)) {
      renderChartSlide(slide, h, theme)
    } else if (h.type === 'table' && Array.isArray(h.rows) && Array.isArray(h.columns)) {
      renderTableSlide(slide, h, theme)
    } else if (h.type === 'compare' && h.left && h.right) {
      renderCompareSlide(slide, h, theme)
    } else if (h.type === 'funnel' && Array.isArray(h.steps)) {
      renderFunnelSlide(slide, h, theme)
    } else if (h.type === 'dashboard' && Array.isArray(h.cards)) {
      renderDashboardSlide(slide, h, theme)
    }
  }

  // pptxgenjs renvoie un Buffer (Node) ou Blob (browser) selon l'environnement.
  const buffer = await pptx.write({ outputType: 'nodebuffer' })
  const filename = buildFilename()
  return { buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), filename }
}

function buildFilename() {
  const date = new Date().toISOString().slice(0, 10)
  return `smartanalyst-deck-${date}.pptx`
}

function isRenderable(h) {
  if (!h || typeof h !== 'object') return false
  if (h.type === 'kpi') return h.value != null
  if (h.type === 'chart') return Array.isArray(h.series) && h.series.length >= 2
  if (h.type === 'table')
    return Array.isArray(h.columns) && Array.isArray(h.rows) && h.rows.length > 0
  if (h.type === 'compare') return h.left?.series?.length >= 2 && h.right?.series?.length >= 2
  if (h.type === 'funnel') return Array.isArray(h.steps) && h.steps.length >= 2
  if (h.type === 'dashboard') return Array.isArray(h.cards) && h.cards.length > 0
  return false
}

function renderKpiSlide(slide, h, theme) {
  slide.addText(String(h.value), {
    x: 0.6,
    y: 2.4,
    w: 12,
    h: 2.5,
    fontSize: 110,
    bold: true,
    color: theme.primary,
    align: 'center',
    fontFace: 'Helvetica',
  })
  if (h.delta) {
    const isUp = !String(h.delta).trimStart().startsWith('-')
    slide.addText(String(h.delta), {
      x: 0.6,
      y: 5.2,
      w: 12,
      h: 0.6,
      fontSize: 28,
      color: isUp ? '1FA873' : 'E0495C',
      align: 'center',
      fontFace: 'Helvetica',
    })
  }
}

function renderChartSlide(slide, h, theme) {
  const data = [
    {
      name: String(h.title || 'Serie'),
      labels: h.series.map((p) => formatDateShort(p.date)),
      values: h.series.map((p) => p.value),
    },
  ]
  slide.addChart(pptxChartType('bar'), data, {
    x: 0.6,
    y: 1.6,
    w: 12,
    h: 5.4,
    chartColors: [theme.primary],
    showTitle: false,
    showLegend: false,
    catAxisLabelColor: theme.muted,
    valAxisLabelColor: theme.muted,
    dataLabelColor: theme.text,
    valGridLine: { style: 'none' },
  })
}

function renderTableSlide(slide, h, theme) {
  // pptxgenjs attend des [[{text, options}, ...]] pour les tables.
  const header = h.columns.map((c) => ({
    text: String(c),
    options: { bold: true, color: 'FFFFFF', fill: { color: theme.primary }, align: 'left' },
  }))
  const rows = h.rows.slice(0, 10).map((r, i) =>
    h.columns.map((c) => ({
      text: r[c] == null ? '—' : String(r[c]),
      options: {
        align: typeof r[c] === 'number' ? 'right' : 'left',
        color: theme.text,
        fill: { color: i % 2 === 0 ? 'FFFFFF' : theme.bg },
      },
    })),
  )
  slide.addTable([header, ...rows], {
    x: 0.6,
    y: 1.6,
    w: 12,
    fontSize: 13,
    fontFace: 'Helvetica',
    border: { type: 'solid', color: 'E5E5EA', pt: 0.5 },
  })
}

function renderCompareSlide(slide, h, theme) {
  const data = [
    {
      name: h.left.source || 'A',
      labels: h.left.series.map((p) => formatDateShort(p.date)),
      values: h.left.series.map((p) => p.value),
    },
    {
      name: h.right.source || 'B',
      labels: h.right.series.map((p) => formatDateShort(p.date)),
      values: h.right.series.map((p) => p.value),
    },
  ]
  slide.addChart(pptxChartType('line'), data, {
    x: 0.6,
    y: 1.6,
    w: 12,
    h: 5.4,
    chartColors: [theme.primary, theme.accent],
    showTitle: false,
    showLegend: true,
    legendPos: 'b',
    catAxisLabelColor: theme.muted,
    valAxisLabelColor: theme.muted,
  })
}

function renderFunnelSlide(slide, h, theme) {
  // Funnel = bar chart decroissante. On ajoute aussi les % retention en
  // dataLabels (pptxgenjs ne supporte pas un vrai funnel chart, ce visuel
  // donne le meme insight).
  const data = [
    {
      name: 'Funnel',
      labels: h.steps.map((s) => formatStepLabel(s.label)),
      values: h.steps.map((s) => s.value),
    },
  ]
  slide.addChart(pptxChartType('bar'), data, {
    x: 0.6,
    y: 1.6,
    w: 12,
    h: 4.6,
    chartColors: [theme.primary],
    showTitle: false,
    showLegend: false,
    catAxisLabelColor: theme.muted,
    valAxisLabelColor: theme.muted,
    barDir: 'col',
  })
  // Tableau % retention sous le chart.
  const retentionRow = [
    {
      text: 'Étape',
      options: { bold: true, color: 'FFFFFF', fill: { color: theme.muted } },
    },
    ...h.steps.map((s) => ({
      text: formatStepLabel(s.label),
      options: { bold: true, color: 'FFFFFF', fill: { color: theme.muted }, align: 'center' },
    })),
  ]
  const valuesRow = [
    { text: 'Volume', options: { color: theme.text, bold: true } },
    ...h.steps.map((s) => ({
      text: formatNumber(s.value),
      options: { color: theme.text, align: 'center' },
    })),
  ]
  const retRow = [
    { text: 'Rétention', options: { color: theme.muted, bold: true } },
    ...h.steps.map((s) => ({
      text: s.retentionPct != null ? `${s.retentionPct}%` : '—',
      options: { color: theme.primary, align: 'center' },
    })),
  ]
  slide.addTable([retentionRow, valuesRow, retRow], {
    x: 0.6,
    y: 6.35,
    w: 12,
    fontSize: 11,
    fontFace: 'Helvetica',
  })
}

function renderDashboardSlide(slide, h, theme) {
  // Grille 2x3 (ou 2x2 si seulement 4 cards).
  const cols = h.cards.length <= 4 ? 2 : 3
  const rows = Math.ceil(h.cards.length / cols)
  const startY = 1.6
  const cellW = 12 / cols
  const cellH = (7 - startY) / rows
  h.cards.forEach((c, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = 0.6 + col * cellW
    const y = startY + row * cellH
    // Cadre.
    slide.addShape('rect', {
      x,
      y,
      w: cellW - 0.15,
      h: cellH - 0.2,
      fill: { color: theme.bg },
      line: { color: 'E5E5EA', width: 0.5 },
    })
    // Label.
    slide.addText(formatStepLabel(c.metricKey || ''), {
      x: x + 0.2,
      y: y + 0.2,
      w: cellW - 0.55,
      h: 0.4,
      fontSize: 11,
      color: theme.muted,
      bold: true,
      fontFace: 'Helvetica',
    })
    // Valeur.
    slide.addText(formatNumber(c.value || 0), {
      x: x + 0.2,
      y: y + 0.65,
      w: cellW - 0.55,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: theme.text,
      fontFace: 'Helvetica',
    })
    // Delta.
    if (c.deltaPct != null) {
      const isUp = c.deltaPct >= 0
      slide.addText(`${isUp ? '+' : ''}${c.deltaPct}% vs N-1`, {
        x: x + 0.2,
        y: y + 1.55,
        w: cellW - 0.55,
        h: 0.4,
        fontSize: 12,
        color: isUp ? '1FA873' : 'E0495C',
        fontFace: 'Helvetica',
      })
    }
  })
}

// ─── helpers ────────────────────────────────────────────────────────────

function formatStepLabel(raw) {
  if (!raw) return '—'
  // metric_key technique → "Add To Cart"
  return String(raw)
    .replace(/_/g, ' ')
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1))
    .slice(0, 32)
}

function formatNumber(v) {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000)
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
  return String(Math.round(v * 100) / 100)
}

function formatDateShort(iso) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${parseInt(m[2], 10)}/${parseInt(m[1], 10)}`
}

/**
 * Helper pour traduire un nom court ('bar', 'line') vers la constante pptxgenjs.
 * Permet de mocker pptxgenjs facilement cote tests.
 */
function pptxChartType(kind) {
  if (kind === 'line') return PptxGenJS.ChartType?.line || 'line'
  return PptxGenJS.ChartType?.bar || 'bar'
}

module.exports = { buildPptx, PptxSlideLimitExceeded, MAX_SLIDES }
