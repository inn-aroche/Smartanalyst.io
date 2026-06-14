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
const canonicalMetrics = require('../metrics/canonical-metrics.service')
const insightsService = require('../insights/insights.service')
const healthScore = require('../health/health-score.service')

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

/**
 * Pull les données utilisées par le rapport sur la période [start, end].
 */
async function gatherData(workspaceId, periodStart, periodEnd) {
  // 1. Workspace
  const supabase = getServiceRoleClient()
  const { data: ws } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle()

  // 2. Score actuel
  let score = null
  try {
    score = await healthScore.getScore(workspaceId)
  } catch (err) {
    logger.warn(
      { event: 'report_score_failed', error: err.message },
      'Score unavailable for report',
    )
  }

  // 3. Top insights de la période (open + resolved)
  let topInsights = []
  try {
    const openList = await insightsService.listInsights(workspaceId, { status: 'open', limit: 5 })
    topInsights = openList || []
  } catch (err) {
    logger.warn({ event: 'report_insights_failed', error: err.message }, 'Insights unavailable')
  }

  // 4. KPIs principaux (somme sur la période ou snapshot dernière valeur)
  const KPI_KEYS = [
    'revenue_ecommerce',
    'orders_count',
    'order_value_average',
    'sessions_all',
    'conversions_total',
    'return_on_investment_paid',
  ]
  const kpis = []
  try {
    const rows = await canonicalMetrics.query({
      workspaceId,
      metricKey: KPI_KEYS,
      startDate: periodStart,
      endDate: periodEnd,
      limit: 1000,
    })
    const byKey = new Map()
    for (const r of rows) {
      if (!byKey.has(r.metric_key)) byKey.set(r.metric_key, [])
      byKey.get(r.metric_key).push(r)
    }
    for (const key of KPI_KEYS) {
      const entries = byKey.get(key) || []
      if (entries.length === 0) {
        kpis.push({ key, value: null, kind: 'empty' })
        continue
      }
      // snapshot pour AOV/ROAS ; somme pour les flow
      const isSnapshot = /average|return_on_investment|rate|recurring/.test(key)
      if (isSnapshot) {
        entries.sort((a, b) => (a.date < b.date ? 1 : -1))
        kpis.push({ key, value: Number(entries[0].metric_value), kind: 'snapshot' })
      } else {
        const sum = entries.reduce((s, e) => s + Number(e.metric_value), 0)
        kpis.push({ key, value: sum, kind: 'sum' })
      }
    }
  } catch (err) {
    logger.warn({ event: 'report_kpis_failed', error: err.message }, 'KPIs unavailable')
  }

  // 5. Série revenue pour le mini-chart en bas du rapport
  let revenueSeries = []
  try {
    const rows = await canonicalMetrics.query({
      workspaceId,
      metricKey: 'revenue_ecommerce',
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

  return { workspace: ws, score, topInsights, kpis, revenueSeries }
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
  revenueSeries,
  period,
  analystNote,
  whiteLabel,
}) {
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
        <p class="analyst">${escapeHtml(analystNote || defaultAnalystNote(scoreNum, topInsights.length))}</p>
      </div>
    </div>
  </div>

  <!-- ─── KPIs ─── -->
  <div class="section">
    <h2>KPIs sur la période</h2>
    <div class="kpis">
      ${kpis
        .map((k) => {
          const label = KPI_LABELS[k.key] || k.key
          const unit = KPI_UNITS[k.key] || ''
          const value = k.value == null ? '—' : fmtNumber(k.value) + unit
          return `
            <div class="kpi">
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
            </div>
          `
        })
        .join('')}
    </div>
    ${revenueSeries.length >= 2 ? `<div class="chart"><div style="font-size:11px;color:#5C5C78;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Évolution du chiffre d’affaires</div>${renderSparkline(revenueSeries, 700, 90)}</div>` : ''}
  </div>

  <!-- ─── Insights / points d'attention ─── -->
  ${
    topInsights.length > 0
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

  <div class="footer">
    Généré par SmartAnalyst le ${fmtDate(new Date().toISOString())}
  </div>
</div>
</body>
</html>`
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
}) {
  const supabase = getServiceRoleClient()

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
    })
    .select('*')
    .single()
  if (insErr) throw insErr

  try {
    const data = await gatherData(workspaceId, periodStart, periodEnd)
    const html = renderHtml({
      title: row.title,
      workspace: data.workspace,
      score: data.score,
      topInsights: data.topInsights,
      kpis: data.kpis,
      revenueSeries: data.revenueSeries,
      period: { start: periodStart, end: periodEnd },
      analystNote: row.analyst_note,
      whiteLabel: row.white_label,
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
      'id, period_start, period_end, kind, status, title, white_label, generated_at, sent_at, created_at',
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
}
