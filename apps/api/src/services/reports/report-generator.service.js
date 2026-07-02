// Générateur de rapports (brief V2 §3.6).
//
// Approche : on assemble les vraies données (score, top insights, KPIs) puis
// on render un HTML template (string template + escapeHtml) qu'on stocke en
// base. Le frontend l'affiche dans un <iframe srcdoc> et "Imprimer en PDF"
// se fait via window.print() — zéro dépendance Chromium, zéro Puppeteer.
//
// Aucune logique IA dans cette V1 : on prend les insights existants et on
// les compose. Un commentaire "mot de l'analyste" peut être ajouté via un
// appel Gemini structuré dans une V2.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError } = require('../../lib/error-handler')
const canonicalMetrics = require('../metrics/canonical-metrics.service')
const insightsService = require('../insights/insights.service')
const healthScore = require('../health/health-score.service')
const gemini = require('../ai/gemini.service')
const claude = require('../ai/claude.service')
const entitlements = require('../billing/entitlements.service')

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtNumber(n) {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
  }
  return Number(n)
    .toFixed(Math.abs(n) >= 10 ? 1 : 2)
    .replace('.', ',')
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// KPIs sortis par défaut. Si plus tard on veut un sélecteur par rapport,
// c'est ici qu'on étendra (le frontend pourrait passer une whitelist).
const KPI_KEYS = [
  'revenue_ecommerce',
  'orders_count',
  'order_value_average',
  'sessions_all',
  'conversions_total',
  'return_on_investment_paid',
]

const SNAPSHOT_KPI_RE = /average|return_on_investment|rate|recurring/

/**
 * Calcule la liste des KPIs (clé → value + kind) sur une plage [start, end],
 * éventuellement filtrée par un sous-ensemble de sources (GA4 / Meta / etc.).
 * Si segmentBy='source', renvoie aussi le breakdown par source (mini-table).
 *
 * @param {object} args
 * @param {string} args.workspaceId
 * @param {string} args.start  YYYY-MM-DD
 * @param {string} args.end    YYYY-MM-DD
 * @param {string[]} [args.sources]  filtre — si vide ou undefined, tout
 * @param {'source'|null} [args.segmentBy]  ventiler le total par source
 */
async function computeKpisForRange({ workspaceId, start, end, sources, segmentBy }) {
  const rows = await canonicalMetrics.query({
    workspaceId,
    metricKey: KPI_KEYS,
    source: sources && sources.length > 0 ? sources : undefined,
    startDate: start,
    endDate: end,
    limit: 5000,
  })

  const byKey = new Map()
  for (const r of rows) {
    if (!byKey.has(r.metric_key)) byKey.set(r.metric_key, [])
    byKey.get(r.metric_key).push(r)
  }

  const kpis = []
  for (const key of KPI_KEYS) {
    const entries = byKey.get(key) || []
    if (entries.length === 0) {
      kpis.push({ key, value: null, kind: 'empty', breakdown: [] })
      continue
    }
    const isSnapshot = SNAPSHOT_KPI_RE.test(key)
    let value
    if (isSnapshot) {
      entries.sort((a, b) => (a.date < b.date ? 1 : -1))
      value = Number(entries[0].metric_value)
    } else {
      value = entries.reduce((s, e) => s + Number(e.metric_value), 0)
    }

    // Breakdown par source : utile pour segmentation. On l'inclut toujours
    // (coût marginal nul), le template décide d'afficher ou pas.
    let breakdown = []
    if (segmentBy === 'source') {
      const bySrc = new Map()
      for (const r of entries) {
        const cur = bySrc.get(r.source) || []
        cur.push(r)
        bySrc.set(r.source, cur)
      }
      breakdown = Array.from(bySrc.entries()).map(([src, srcRows]) => {
        if (isSnapshot) {
          srcRows.sort((a, b) => (a.date < b.date ? 1 : -1))
          return { source: src, value: Number(srcRows[0].metric_value) }
        }
        return {
          source: src,
          value: srcRows.reduce((s, e) => s + Number(e.metric_value), 0),
        }
      })
      breakdown.sort((a, b) => b.value - a.value)
    }
    kpis.push({ key, value, kind: isSnapshot ? 'snapshot' : 'sum', breakdown })
  }
  return kpis
}

/**
 * Calcule la période précédente de même durée que [start, end].
 * Ex: 2026-06-01 → 2026-06-30 (30j) renvoie 2026-05-02 → 2026-05-31.
 */
function previousRange(start, end) {
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const lenMs = endMs - startMs
  const prevEndMs = startMs - 86_400_000 // jour précédent
  const prevStartMs = prevEndMs - lenMs
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10)
  return { start: fmt(prevStartMs), end: fmt(prevEndMs) }
}

/**
 * Pull les données utilisées par le rapport sur la période [start, end].
 *
 * @param {string} workspaceId
 * @param {string} periodStart YYYY-MM-DD
 * @param {string} periodEnd   YYYY-MM-DD
 * @param {object} [opts]
 * @param {string[]} [opts.sources]
 *   Sous-ensemble de connecteurs à inclure (ga4, meta_ads, …). [] / undefined = tout.
 * @param {'source'|null} [opts.segmentBy]
 *   Active la table de breakdown sous chaque KPI.
 * @param {boolean} [opts.compareToPreviousPeriod]
 *   Si true, calcule les KPIs sur la période précédente de même durée
 *   et expose `kpisPrev` + le delta % côté template.
 */
async function gatherData(
  workspaceId,
  periodStart,
  periodEnd,
  { sources, segmentBy = null, compareToPreviousPeriod = false } = {},
) {
  const supabase = getServiceRoleClient()
  const { data: ws } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle()

  let score = null
  try {
    score = await healthScore.getScore(workspaceId)
  } catch (err) {
    logger.warn(
      { event: 'report_score_failed', error: err.message },
      'Score unavailable for report',
    )
  }

  let topInsights = []
  try {
    const openList = await insightsService.listInsights(workspaceId, { status: 'open', limit: 5 })
    topInsights = openList || []
  } catch (err) {
    logger.warn({ event: 'report_insights_failed', error: err.message }, 'Insights unavailable')
  }

  // KPIs période courante + (optionnel) période précédente pour le delta.
  let kpis = []
  let kpisPrev = null
  try {
    kpis = await computeKpisForRange({
      workspaceId,
      start: periodStart,
      end: periodEnd,
      sources,
      segmentBy,
    })
    if (compareToPreviousPeriod) {
      const prev = previousRange(periodStart, periodEnd)
      kpisPrev = await computeKpisForRange({
        workspaceId,
        start: prev.start,
        end: prev.end,
        sources,
        segmentBy: null, // pas de breakdown sur la période précédente
      })
    }
  } catch (err) {
    logger.warn({ event: 'report_kpis_failed', error: err.message }, 'KPIs unavailable')
  }

  // Série revenue pour le mini-chart en bas du rapport
  let revenueSeries = []
  try {
    const rows = await canonicalMetrics.query({
      workspaceId,
      metricKey: 'revenue_ecommerce',
      source: sources && sources.length > 0 ? sources : undefined,
      startDate: periodStart,
      endDate: periodEnd,
      limit: 200,
    })
    const byDate = new Map()
    for (const r of rows) {
      byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.metric_value))
    }
    revenueSeries = Array.from(byDate.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  } catch {
    // silencieux
  }

  return {
    workspace: ws,
    score,
    topInsights,
    kpis,
    kpisPrev,
    revenueSeries,
    selectedSources: sources && sources.length > 0 ? sources : null,
    segmentBy,
  }
}

const KPI_LABELS = {
  revenue_ecommerce: 'Chiffre d’affaires',
  orders_count: 'Commandes',
  order_value_average: 'Panier moyen',
  sessions_all: 'Sessions',
  conversions_total: 'Conversions',
  return_on_investment_paid: 'ROAS paid',
}

const KPI_UNITS = {
  revenue_ecommerce: ' €',
  orders_count: '',
  order_value_average: ' €',
  sessions_all: '',
  conversions_total: '',
  return_on_investment_paid: '',
}

/**
 * Délta % entre deux valeurs. null si la précédente est 0 ou null (évite
 * la division par zéro + un "+∞%" inutile).
 */
function computeDeltaPct(curr, prev) {
  if (prev == null || prev === 0 || curr == null) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

/**
 * Rend une carte KPI : label + valeur + (optionnel) delta vs période N-1 +
 * (optionnel) breakdown par source en mini-table.
 */
function renderKpiCard(k, kpisPrev, segmentBy) {
  const label = KPI_LABELS[k.key] || k.key
  const unit = KPI_UNITS[k.key] || ''
  const value = k.value == null ? '—' : fmtNumber(k.value) + unit

  // Delta vs période précédente si dispo.
  let deltaHtml = ''
  if (kpisPrev && Array.isArray(kpisPrev)) {
    const prev = kpisPrev.find((p) => p.key === k.key)
    const pct = prev ? computeDeltaPct(k.value, prev.value) : null
    if (pct != null && Number.isFinite(pct)) {
      // Heuristique simple : ratio "lowerIsBetter" pour bounce / churn / failed.
      const lowerIsBetter = /bounce|churn|failed_/.test(k.key)
      const isPositive = pct >= 0
      const isGood = isPositive !== lowerIsBetter
      const color = isGood ? '#1FA873' : '#E0495C'
      const sign = isPositive ? '+' : ''
      deltaHtml = `<div style="font-size:11.5px;font-weight:600;color:${color};margin-top:4px">${sign}${pct.toFixed(1)} % vs préc.</div>`
    } else if (prev && prev.value != null) {
      deltaHtml = `<div style="font-size:11.5px;color:#9C9CB4;margin-top:4px">—</div>`
    }
  }

  // Mini-table de breakdown par source (segmentation).
  let breakdownHtml = ''
  if (segmentBy === 'source' && k.breakdown && k.breakdown.length > 0) {
    breakdownHtml = `<table style="margin-top:8px;width:100%;border-collapse:collapse;font-size:11px">${k.breakdown
      .map(
        (b) => `<tr>
          <td style="padding:3px 0;color:#5C5C78">${escapeHtml(b.source)}</td>
          <td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;color:#14142A">${escapeHtml(fmtNumber(b.value) + unit)}</td>
        </tr>`,
      )
      .join('')}</table>`
  }

  return `
    <div class="kpi">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
      ${deltaHtml}
      ${breakdownHtml}
    </div>
  `
}

/**
 * Petit tag "Sources : GA4, Meta" affiché au-dessus des KPIs quand l'user
 * a filtré le rapport sur un sous-ensemble — sinon on ne montre rien.
 */
function renderSourceFilterTag(selectedSources) {
  if (!selectedSources || selectedSources.length === 0) return ''
  const list = selectedSources.map((s) => escapeHtml(s)).join(', ')
  return `<div style="font-family:ui-monospace,'DM Mono',monospace;font-size:10.5px;color:#5C5C78;text-transform:uppercase;letter-spacing:0.08em;margin:-4px 0 12px">Filtré : ${list}</div>`
}

/**
 * Render le SVG sparkline natif (réutilise la même technique que le composant
 * React Sparkline côté frontend).
 */
function renderSparkline(series, w = 240, h = 60) {
  if (!series || series.length < 2) return ''
  const values = series.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rng = max - min || 1
  const pts = series.map((p, i) => {
    const x = (i / (series.length - 1)) * w
    const y = h - 4 - ((p.value - min) / rng) * (h - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p).join(' ')
  const last = pts[pts.length - 1].split(',')
  return `
    <svg width="${w}" height="${h}" style="display:block">
      <path d="${line} L ${w} ${h} L 0 ${h} Z" fill="rgba(92,143,255,0.18)" />
      <path d="${line}" fill="none" stroke="#5C8FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="#2DD9EE" />
    </svg>
  `
}

const SEV_COLORS = {
  critical: '#E0495C',
  high: '#E0495C',
  medium: '#C2820E',
  low: '#3D6BE0',
}

function renderHtml({
  title,
  workspace,
  score,
  topInsights,
  kpis,
  kpisPrev,
  revenueSeries,
  period,
  analystNote,
  // Synthèse structurée IA (wizard V2) — si présente, elle prime sur
  // analystNote pour le mot de l'analyste et ajoute lecture des chiffres +
  // recommandations.
  aiSections = null,
  whiteLabel,
  selectedSources,
  segmentBy,
  template = 'standard',
}) {
  // Templates :
  //   - executive : focus mot analyste + score + top alertes (pas de KPI table, pas de chart)
  //   - detail    : tout, avec segmentation + comparaison vs N-1
  //   - agency    : tout + white-label (deja propage en amont)
  //   - standard  : behavior historique
  const showKpis = template !== 'executive'
  const showRevenueChart = template !== 'executive'
  const showInsights = true
  const wsName = escapeHtml(workspace?.name ?? '—')
  const scoreNum = score?.has_data && typeof score.score === 'number' ? score.score : null
  const scoreDelta = score?.delta
  const scoreColor =
    scoreNum == null
      ? '#9C9CB4'
      : scoreNum >= 75
        ? '#1FA873'
        : scoreNum >= 55
          ? '#C2820E'
          : '#E0495C'

  const coverBg = whiteLabel
    ? `background:#14142A;color:#fff;`
    : `background:linear-gradient(135deg,#5C8FFF 0%,#2DD9EE 100%);color:#fff;`

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Plus Jakarta Sans', system-ui, sans-serif; color: #14142A; background: #F2F2F7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 760px; margin: 0 auto; padding: 0; }
  .cover { ${coverBg} padding: 60px 50px; border-radius: 18px; margin: 32px 0; }
  .cover .kicker { font-family: ui-monospace, 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; opacity: 0.8; text-transform: uppercase; }
  .cover h1 { font-size: 36px; font-weight: 800; letter-spacing: -0.025em; margin-top: 14px; line-height: 1.1; }
  .cover .period { margin-top: 12px; font-size: 15px; opacity: 0.9; }
  .cover .ws { margin-top: 28px; font-size: 13px; opacity: 0.85; }
  .section { background: #fff; border: 1px solid rgba(18,18,38,0.09); border-radius: 16px; padding: 28px 32px; margin: 16px 0; box-shadow: 0 1px 2px rgba(18,18,38,.05), 0 4px 14px rgba(18,18,38,.06); }
  .section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #5C5C78; margin-bottom: 14px; font-weight: 600; }
  .section h3 { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 10px; }
  .score-row { display: flex; align-items: center; gap: 24px; }
  .score-ring { width: 96px; height: 96px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${scoreColor}; font-weight: 800; font-size: 32px; border: 6px solid ${scoreColor}; flex-shrink: 0; }
  .analyst { font-style: italic; color: #5C5C78; line-height: 1.6; font-size: 15px; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .kpi { padding: 16px 18px; border-radius: 12px; background: #F5F5F9; }
  .kpi .label { font-family: ui-monospace, 'DM Mono', monospace; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #5C5C78; }
  .kpi .value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-top: 6px; }
  .insights { display: flex; flex-direction: column; gap: 10px; }
  .insight { display: flex; gap: 14px; padding: 16px; border: 1px solid rgba(18,18,38,0.07); border-radius: 12px; background: #fff; }
  .insight .sev { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; }
  .insight .body strong { display: block; margin-bottom: 4px; font-size: 14.5px; }
  .insight .body p { font-size: 13.5px; color: #5C5C78; line-height: 1.5; }
  .chart { padding: 18px 22px; background: #F5F5F9; border-radius: 12px; margin-top: 14px; }
  .footer { text-align: center; margin: 28px 0 40px; color: #9C9CB4; font-size: 12px; font-family: ui-monospace, 'DM Mono', monospace; }
  @media print {
    body { background: #fff; }
    .cover, .section { box-shadow: none; }
    .page { max-width: 100%; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- ─── Cover ─── -->
  <div class="cover">
    <div class="kicker">${whiteLabel ? 'Rapport' : 'SmartAnalyst — Point périodique'}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="period">Période : ${fmtDate(period.start)} → ${fmtDate(period.end)}</div>
    <div class="ws">Pour ${wsName}</div>
  </div>

  <!-- ─── Mot de l'analyste + score ─── -->
  <div class="section">
    <h2>Le mot de l’analyste</h2>
    <div class="score-row">
      <div class="score-ring">${scoreNum == null ? '—' : scoreNum}</div>
      <div style="flex:1">
        ${scoreDelta != null ? `<div style="font-size:13px;color:${scoreDelta >= 0 ? '#1FA873' : '#E0495C'};margin-bottom:6px;font-weight:500">${scoreDelta >= 0 ? '+' : ''}${scoreDelta} pts vs période précédente</div>` : ''}
        <p class="analyst">${escapeHtml(aiSections?.executiveSummary || analystNote || defaultAnalystNote(scoreNum, topInsights.length))}</p>
      </div>
    </div>
  </div>

  <!-- ─── KPIs (gates par template) ─── -->
  ${
    showKpis
      ? `<div class="section">
    <h2>KPIs sur la période</h2>
    ${renderSourceFilterTag(selectedSources)}
    <div class="kpis">
      ${kpis.map((k) => renderKpiCard(k, kpisPrev, segmentBy)).join('')}
    </div>
    ${renderKpiComments(aiSections)}
    ${showRevenueChart && revenueSeries.length >= 2 ? `<div class="chart"><div style="font-size:11px;color:#5C5C78;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Évolution du chiffre d’affaires</div>${renderSparkline(revenueSeries, 700, 90)}</div>` : ''}
  </div>`
      : ''
  }

  <!-- ─── Insights / points d'attention ─── -->
  ${
    showInsights && topInsights.length > 0
      ? `<div class="section">
    <h2>Ce qui a compté</h2>
    <div class="insights">
      ${topInsights
        .map((ins) => {
          const sev = ins.severity || 'medium'
          const col = SEV_COLORS[sev] || SEV_COLORS.medium
          return `
            <div class="insight">
              <div class="sev" style="background:${col}22;color:${col}">${sev === 'critical' || sev === 'high' || sev === 'medium' ? '!' : '↗'}</div>
              <div class="body">
                <strong>${escapeHtml(ins.title)}</strong>
                <p>${escapeHtml(ins.summary || '')}</p>
              </div>
            </div>
          `
        })
        .join('')}
    </div>
  </div>`
      : ''
  }

  ${renderRecommendations(aiSections)}

  <div class="footer">
    Généré par SmartAnalyst le ${fmtDate(new Date().toISOString())}
  </div>
</div>
</body>
</html>`
}

/**
 * « Lecture des chiffres » — commentaires IA par KPI, rendus sous la grille.
 */
function renderKpiComments(aiSections) {
  const comments = aiSections?.kpiComments
  if (!Array.isArray(comments) || comments.length === 0) return ''
  const items = comments
    .map((c) => {
      const label = KPI_LABELS[c.key] || c.key
      return `<li style="margin:6px 0;font-size:13.5px;line-height:1.55;color:#5C5C78"><strong style="color:#14142A;font-weight:600">${escapeHtml(label)}</strong> — ${escapeHtml(c.comment)}</li>`
    })
    .join('')
  return `<div style="margin-top:16px">
    <div style="font-size:11px;color:#5C5C78;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Lecture des chiffres</div>
    <ul style="list-style:none;padding:0;margin:0">${items}</ul>
  </div>`
}

/**
 * Section « Recommandations » — liste numérotée des actions proposées par l'IA.
 */
function renderRecommendations(aiSections) {
  const recos = aiSections?.recommendations
  if (!Array.isArray(recos) || recos.length === 0) return ''
  const items = recos
    .map(
      (
        r,
        i,
      ) => `<li style="display:flex;gap:12px;padding:12px 0;border-top:${i === 0 ? 'none' : '1px solid rgba(18,18,38,0.07)'}">
        <span style="flex-shrink:0;width:24px;height:24px;border-radius:8px;background:#5C8FFF22;color:#3D6BE0;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center">${i + 1}</span>
        <span style="font-size:13.5px;line-height:1.55;color:#14142A">${escapeHtml(r)}</span>
      </li>`,
    )
    .join('')
  return `<div class="section">
    <h2>Recommandations</h2>
    <ul style="list-style:none;padding:0;margin:0">${items}</ul>
  </div>`
}

/**
 * Genere un "mot de l'analyste" via Gemini structured output.
 * Renvoie un texte court (2-4 phrases) commentant la periode. Si Gemini
 * n'est pas configure ou echoue, on laisse l'appelant fallback sur
 * defaultAnalystNote (statique, deterministe).
 *
 * On extrait deliberement un sous-ensemble des donnees pour limiter le
 * contexte (cout + latence) : score, top 3 KPIs, top 3 insights, et le
 * delta vs periode precedente si dispo.
 */
async function generateAnalystNote({ workspaceName, period, score, kpis, kpisPrev, topInsights }) {
  // Resume compact, lisible cote prompt.
  const kpiLines = (kpis || [])
    .slice(0, 6)
    .map((k) => {
      const prev = (kpisPrev || []).find((p) => p.key === k.key)
      const delta = prev ? computeDeltaPct(k.value, prev.value) : null
      const deltaStr =
        delta != null && Number.isFinite(delta)
          ? ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs N-1)`
          : ''
      return `- ${k.key}: ${k.value == null ? 'n/a' : fmtNumber(k.value)}${deltaStr}`
    })
    .join('\n')
  const insightLines = (topInsights || [])
    .slice(0, 3)
    .map((i) => `- [${i.severity || 'medium'}] ${i.title}`)
    .join('\n')
  const scoreStr =
    score?.has_data && typeof score.score === 'number' ? `${score.score}/100` : 'non calcule'

  const systemPrompt = `Tu es un analyste marketing concis. Tu rediges en francais un commentaire de 3 phrases maximum, max 80 mots, sans emojis, sans liste a puces, sans titre. Ton: factuel, conseil sans baratin, pas de promesses. Tu cites un chiffre marquant si dispo. Tu termines par une recommandation actionnable.`
  const userMessage = `Workspace: ${workspaceName}
Periode: ${period.start} -> ${period.end}
Score global: ${scoreStr}
KPIs:
${kpiLines || '- aucun'}
Alertes ouvertes:
${insightLines || '- aucune'}

Ecris le mot de l'analyste pour le rapport mensuel.`

  const responseSchema = {
    type: 'object',
    properties: { note: { type: 'string' } },
    required: ['note'],
  }

  const { json } = await gemini.generateStructured({
    systemPrompt,
    userMessage,
    responseSchema,
    temperature: 0.4,
    maxOutputTokens: 200,
  })
  return typeof json?.note === 'string' && json.note.trim().length > 0 ? json.note.trim() : null
}

/**
 * Synthèse structurée multi-sections (wizard V2) — remplace la note de 80
 * mots quand l'IA est activée. Routing provider selon le mode choisi :
 * 'deep' → Claude (Sonnet, via claude.service), sinon Gemini. Le provider
 * n'est JAMAIS exposé à l'utilisateur (toggle Rapide/Approfondi, ADR-04).
 *
 * Le `context` (texte libre du wizard) est injecté dans le prompt : l'IA
 * doit relier les événements business déclarés (promo, lancement…) aux
 * variations observées dans les chiffres.
 *
 * @returns {Promise<null | {
 *   executiveSummary: string,
 *   kpiComments: Array<{ key: string, comment: string }>,
 *   recommendations: string[],
 * }>}
 */
async function generateAnalystSections({
  workspaceName,
  period,
  score,
  kpis,
  kpisPrev,
  topInsights,
  context,
  mode = 'fast',
}) {
  const kpiLines = (kpis || [])
    .slice(0, 6)
    .map((k) => {
      const prev = (kpisPrev || []).find((p) => p.key === k.key)
      const delta = prev ? computeDeltaPct(k.value, prev.value) : null
      const deltaStr =
        delta != null && Number.isFinite(delta)
          ? ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs N-1)`
          : ''
      return `- ${k.key}: ${k.value == null ? 'n/a' : fmtNumber(k.value)}${deltaStr}`
    })
    .join('\n')
  const insightLines = (topInsights || [])
    .slice(0, 5)
    .map((i) => `- [${i.severity || 'medium'}] ${i.title}`)
    .join('\n')
  const scoreStr =
    score?.has_data && typeof score.score === 'number' ? `${score.score}/100` : 'non calcule'

  const systemPrompt = `Tu es un analyste marketing senior. Tu rédiges en français, ton factuel et direct, sans emojis ni baratin. Tu t'appuies UNIQUEMENT sur les chiffres fournis — n'invente jamais de donnée. Si un contexte business est fourni (promo, lancement, saisonnalité…), relie-le explicitement aux variations observées. Les recommandations doivent être actionnables et spécifiques, pas génériques.`
  const userMessage = `Workspace : ${workspaceName}
Période : ${period.start} -> ${period.end}
Score global : ${scoreStr}
KPIs :
${kpiLines || '- aucun'}
Alertes ouvertes :
${insightLines || '- aucune'}
${context && context.trim() ? `\nContexte business fourni par l'utilisateur :\n"""\n${context.trim()}\n"""\n` : ''}
Rédige la synthèse du rapport : executive summary (3-5 phrases), un commentaire par KPI notable (utilise exactement la clé du KPI, max 6, ignore les KPIs sans donnée), et 2 à 4 recommandations.`

  const responseSchema = {
    type: 'object',
    properties: {
      executiveSummary: {
        type: 'string',
        description: 'Synthèse de 3 à 5 phrases, chiffre marquant cité si disponible.',
      },
      kpiComments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Clé exacte du KPI (ex: revenue_ecommerce).' },
            comment: { type: 'string', description: '1-2 phrases sur ce KPI.' },
          },
          required: ['key', 'comment'],
        },
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: '2 à 4 recommandations actionnables.',
      },
    },
    required: ['executiveSummary', 'recommendations'],
  }

  const useClaude = mode === 'deep' && Boolean(process.env.ANTHROPIC_API_KEY)
  const provider = useClaude ? claude : gemini
  const { json } = await provider.generateStructured({
    systemPrompt,
    userMessage,
    responseSchema,
    temperature: 0.4,
    maxOutputTokens: 1000,
  })

  if (!json || typeof json.executiveSummary !== 'string' || !json.executiveSummary.trim()) {
    return null
  }
  const knownKeys = new Set((kpis || []).map((k) => k.key))
  return {
    executiveSummary: json.executiveSummary.trim(),
    kpiComments: Array.isArray(json.kpiComments)
      ? json.kpiComments
          .filter(
            (c) =>
              c &&
              typeof c.key === 'string' &&
              knownKeys.has(c.key) &&
              typeof c.comment === 'string' &&
              c.comment.trim(),
          )
          .slice(0, 6)
      : [],
    recommendations: Array.isArray(json.recommendations)
      ? json.recommendations.filter((r) => typeof r === 'string' && r.trim()).slice(0, 4)
      : [],
  }
}

function defaultAnalystNote(score, insightCount) {
  if (score == null) {
    return 'Pas encore assez de données pour un commentaire chiffré — je prendrai la parole dès que les sources auront un mois de recul.'
  }
  if (score >= 75) {
    return `Bonne dynamique d’ensemble. ${insightCount > 0 ? `${insightCount} point${insightCount > 1 ? 's' : ''} d’attention détecté${insightCount > 1 ? 's' : ''} à regarder de près, sans urgence.` : 'Aucun point critique sur la période.'}`
  }
  if (score >= 55) {
    return `Signaux mitigés sur la période. ${insightCount > 0 ? `${insightCount} alerte${insightCount > 1 ? 's' : ''} à traiter en priorité — détails ci-dessous.` : 'Pas d’alerte majeure mais des marges de progression à explorer.'}`
  }
  return `À surveiller de près. ${insightCount > 0 ? `${insightCount} alerte${insightCount > 1 ? 's' : ''} critique${insightCount > 1 ? 's' : ''} sur la période — on regarde ensemble par où commencer.` : 'Le score est en zone basse, je creuse pour identifier la cause.'}`
}

/**
 * Génère un rapport pour un workspace sur une période. Persiste le row.
 *
 * @returns {Promise<{ id: string, html: string }>}
 */
async function generate({
  workspaceId,
  periodStart,
  periodEnd,
  kind = 'monthly',
  title,
  userId,
  whiteLabel = false,
  sources,
  segmentBy = null,
  compareToPreviousPeriod = false,
  template = 'standard',
  aiNote = false,
  // Wizard V2 : contexte business libre + mode Rapide/Approfondi.
  context = null,
  mode = 'fast',
}) {
  // Les templates "agency" et "detail" surchargent certaines options par
  // commodite : agency = white_label forcé, detail = compare + segmentBy auto.
  if (template === 'agency') whiteLabel = true
  if (template === 'detail') {
    if (segmentBy == null) segmentBy = 'source'
    if (!compareToPreviousPeriod) compareToPreviousPeriod = true
  }
  const supabase = getServiceRoleClient()

  // Validation des sources contre les connecteurs réels du workspace —
  // évite qu'un client passe des strings libres qui videraient le rapport.
  if (Array.isArray(sources) && sources.length > 0) {
    const { data: conns } = await supabase
      .from('connectors')
      .select('source')
      .eq('workspace_id', workspaceId)
    const known = new Set((conns || []).map((c) => c.source))
    const filtered = sources.filter((s) => known.has(s))
    if (filtered.length === 0) {
      throw new UserFacingError('Aucune des sources demandées n’est connectée à ce workspace.', {
        statusCode: 400,
        code: 'REPORT_SOURCES_INVALID',
      })
    }
    sources = filtered
  }

  // Mode Approfondi gated par le plan (même feature que le chat deep) —
  // downgrade silencieux vers Rapide, comme côté chat.
  let effectiveMode = mode
  if (mode === 'deep') {
    try {
      const plan = await entitlements.getWorkspacePlan(workspaceId)
      if (!entitlements.canUseFeature(plan, 'deep_chat')) effectiveMode = 'fast'
    } catch {
      effectiveMode = 'fast'
    }
  }

  // Contexte fourni → l'IA est activée d'office (c'est sa raison d'être).
  const cleanContext = typeof context === 'string' && context.trim() ? context.trim() : null
  const effectiveAiNote = !!aiNote || Boolean(cleanContext)

  // Paramètres complets — persistés pour idempotence + régénération.
  const generationParams = {
    sources: Array.isArray(sources) && sources.length > 0 ? [...sources].sort() : null,
    segmentBy,
    compareToPreviousPeriod: !!compareToPreviousPeriod,
    template,
    aiNote: effectiveAiNote,
    mode: effectiveMode,
    context: cleanContext,
  }

  // Idempotence on-demand (DoD écritures sensibles) : un rapport identique
  // (période + kind + params) encore en génération, ou prêt depuis < 10 min,
  // est réutilisé au lieu d'être régénéré (double-clic, re-submit).
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('reports')
      .select('id, status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('kind', kind)
      .eq('generation_params', JSON.stringify(generationParams))
      .in('status', ['generating', 'ready'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      logger.info(
        { event: 'report_reused', workspaceId, reportId: existing.id },
        'Identical recent report reused (idempotence)',
      )
      return { id: existing.id, html: null, reused: true }
    }
  } catch (err) {
    // Best-effort : une erreur d'idempotence ne doit pas bloquer la génération.
    logger.warn({ event: 'report_idempotence_check_failed', error: err.message }, 'Skipping')
  }

  // Crée le row en status='generating' pour avoir un id immédiatement.
  const { data: row, error: insErr } = await supabase
    .from('reports')
    .insert({
      workspace_id: workspaceId,
      period_start: periodStart,
      period_end: periodEnd,
      kind,
      status: 'generating',
      title: title || defaultTitle(periodStart, periodEnd, kind),
      white_label: !!whiteLabel,
      created_by: userId || null,
      context: cleanContext,
      generation_params: generationParams,
    })
    .select('*')
    .single()
  if (insErr) throw insErr

  try {
    const data = await gatherData(workspaceId, periodStart, periodEnd, {
      sources,
      segmentBy,
      compareToPreviousPeriod,
    })

    // Synthèse IA — best-effort en cascade :
    //   1. sections structurées (executive summary + lecture KPIs + recos),
    //      provider routé Rapide/Approfondi selon effectiveMode ;
    //   2. fallback note courte Gemini (comportement historique) ;
    //   3. fallback statique defaultAnalystNote (rendu par renderHtml).
    let analystNote = row.analyst_note
    let aiSections = null
    if (effectiveAiNote) {
      try {
        aiSections = await generateAnalystSections({
          workspaceName: data.workspace?.name || 'votre business',
          period: { start: periodStart, end: periodEnd },
          score: data.score,
          kpis: data.kpis,
          kpisPrev: data.kpisPrev,
          topInsights: data.topInsights,
          context: cleanContext,
          mode: effectiveMode,
        })
      } catch (err) {
        logger.warn(
          { event: 'report_ai_sections_failed', reportId: row.id, error: err.message },
          'AI sections generation failed — falling back to short note',
        )
      }
      if (aiSections) {
        analystNote = aiSections.executiveSummary
        await supabase.from('reports').update({ analyst_note: analystNote }).eq('id', row.id)
      } else if (!analystNote) {
        try {
          analystNote = await generateAnalystNote({
            workspaceName: data.workspace?.name || 'votre business',
            period: { start: periodStart, end: periodEnd },
            score: data.score,
            kpis: data.kpis,
            kpisPrev: data.kpisPrev,
            topInsights: data.topInsights,
          })
          if (analystNote) {
            await supabase.from('reports').update({ analyst_note: analystNote }).eq('id', row.id)
          }
        } catch (err) {
          logger.warn(
            { event: 'report_analyst_note_failed', reportId: row.id, error: err.message },
            'AI analyst note generation failed — falling back to static',
          )
        }
      }
    }

    const html = renderHtml({
      title: row.title,
      workspace: data.workspace,
      score: data.score,
      topInsights: data.topInsights,
      kpis: data.kpis,
      kpisPrev: data.kpisPrev,
      revenueSeries: data.revenueSeries,
      period: { start: periodStart, end: periodEnd },
      analystNote,
      aiSections,
      whiteLabel: row.white_label,
      selectedSources: data.selectedSources,
      segmentBy: data.segmentBy,
      template,
    })

    const { data: updated, error: updErr } = await supabase
      .from('reports')
      .update({
        status: 'ready',
        html_content: html,
        generated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single()
    if (updErr) throw updErr

    logger.info({ event: 'report_generated', workspaceId, reportId: row.id }, 'Report generated')
    return { id: updated.id, html }
  } catch (err) {
    await supabase
      .from('reports')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', row.id)
    logger.error(
      { event: 'report_generation_failed', workspaceId, error: err.message },
      'Report failed',
    )
    throw err
  }
}

function defaultTitle(periodStart, periodEnd, kind) {
  const d = new Date(periodStart)
  const month = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  if (kind === 'quarterly') return `Bilan trimestriel — ${month}`
  if (kind === 'custom') return `Rapport — ${fmtDate(periodStart)} → ${fmtDate(periodEnd)}`
  return `Point du mois — ${month}`
}

async function listReports(workspaceId, limit = 20) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, period_start, period_end, kind, status, title, white_label, generated_at, sent_at, created_at, generation_params',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

async function getReportHtml(workspaceId, reportId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('reports')
    .select('id, html_content, status, title')
    .eq('workspace_id', workspaceId)
    .eq('id', reportId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function deleteReport(workspaceId, reportId) {
  const supabase = getServiceRoleClient()
  const { error, count } = await supabase
    .from('reports')
    .delete({ count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('id', reportId)
  if (error) throw error
  return { deleted: count > 0 }
}

module.exports = {
  generate,
  listReports,
  getReportHtml,
  deleteReport,
  // Internal helpers exposés pour tests :
  defaultAnalystNote,
  defaultTitle,
  renderHtml,
  escapeHtml,
  previousRange,
  computeDeltaPct,
  generateAnalystSections,
}
