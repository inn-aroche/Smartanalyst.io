// Metrics routes — surface the canonical metrics layer to the SaaS frontend.
// All endpoints scoped to the caller's active workspace.
//
// IMPORTANT : ces routes sont conservées pour backward-compat (SDK externes
// éventuels, tokens d'intégration). Le frontend SaaS utilise désormais
// /api/v1/dashboard/* (cf dashboard.routes.js) — naming neutre côté
// adblockers, qui matchent agressivement les paths /metrics/*.

const express = require('express')
const { query: queryMetrics } = require('../services/metrics/canonical-metrics.service')
const { getServiceRoleClient } = require('../lib/supabase')
const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')

const router = express.Router()

router.use(jwtMiddleware)
router.use(workspaceScope)

// Tiles disponibles par source connectée. Le dashboard summary sélectionne
// 4 tiles parmi celles-ci en fonction des connecteurs actifs du workspace
// → un user qui connecte Stripe voit MRR + customers tout de suite, pas
// 4 tiles "—" parce que sessions_all et revenue_total ne sont émis par rien.
//
// Ordre de priorité dans chaque liste : la 1ère tile est la plus parlante
// pour cette source. Si plusieurs sources, on prend les top tiles en
// remplissage jusqu'à 4.
//
// `kind: 'sum'` → on additionne la valeur sur la fenêtre.
// `kind: 'snapshot'` → on prend la dernière valeur (MRR, customers actifs…)
const TILES_BY_SOURCE = {
  stripe: [
    { key: 'revenue_recurring_monthly', label: 'MRR', kind: 'snapshot', format: 'currency' },
    { key: 'customers_active', label: 'Active customers', kind: 'snapshot', format: 'integer' },
    { key: 'customers_new', label: 'New customers', kind: 'sum', format: 'integer' },
    { key: 'failed_payments_month', label: 'Failed payments', kind: 'sum', format: 'integer' },
  ],
  ga4: [
    { key: 'sessions_all', label: 'Sessions', kind: 'sum', format: 'integer' },
    { key: 'conversions_total', label: 'Conversions', kind: 'sum', format: 'integer' },
    { key: 'users_active', label: 'Active users', kind: 'sum', format: 'integer' },
    { key: 'bounce_rate_all', label: 'Bounce rate', kind: 'snapshot', format: 'ratio' },
  ],
  meta_ads: [
    { key: 'spend_paid_social', label: 'Meta spend', kind: 'sum', format: 'currency' },
    { key: 'clicks_paid_social', label: 'Meta clicks', kind: 'sum', format: 'integer' },
    { key: 'conversions_paid_social', label: 'Meta conversions', kind: 'sum', format: 'integer' },
    { key: 'return_on_investment_paid', label: 'Meta ROAS', kind: 'snapshot', format: 'ratio' },
  ],
  google_ads: [
    { key: 'spend_paid_search', label: 'Google Ads spend', kind: 'sum', format: 'currency' },
    { key: 'clicks_paid_search', label: 'Google Ads clicks', kind: 'sum', format: 'integer' },
    {
      key: 'conversions_paid_search',
      label: 'Google Ads conversions',
      kind: 'sum',
      format: 'integer',
    },
    { key: 'click_through_rate_paid', label: 'Google Ads CTR', kind: 'snapshot', format: 'ratio' },
  ],
  shopify: [
    { key: 'revenue_ecommerce', label: 'Revenue (Shopify)', kind: 'sum', format: 'currency' },
    { key: 'orders_count', label: 'Orders', kind: 'sum', format: 'integer' },
    { key: 'order_value_average', label: 'AOV', kind: 'snapshot', format: 'currency' },
    { key: 'customers_new', label: 'New customers', kind: 'sum', format: 'integer' },
  ],
  search_console: [
    { key: 'clicks_organic_search', label: 'Organic clicks', kind: 'sum', format: 'integer' },
    {
      key: 'impressions_organic_search',
      label: 'Organic impressions',
      kind: 'sum',
      format: 'integer',
    },
    { key: 'click_through_rate_organic', label: 'Organic CTR', kind: 'snapshot', format: 'ratio' },
    { key: 'average_position_organic', label: 'Avg position', kind: 'snapshot', format: 'integer' },
  ],
}

// Tiles par défaut affichées quand AUCUN connecteur n'est encore actif.
// Donne au new user une idée des KPIs disponibles (toutes à 0 / no-data).
const DEFAULT_TILES = [
  { key: 'revenue_recurring_monthly', label: 'MRR', kind: 'snapshot', format: 'currency' },
  { key: 'sessions_all', label: 'Sessions', kind: 'sum', format: 'integer' },
  { key: 'conversions_total', label: 'Conversions', kind: 'sum', format: 'integer' },
  { key: 'spend_paid_social', label: 'Ad spend', kind: 'sum', format: 'currency' },
]

/**
 * Sélectionne jusqu'à 4 tiles à afficher en fonction des sources actives
 * du workspace. Round-robin entre les sources pour donner de la place à
 * chaque connecteur, puis priorité aux 1ères tiles de chaque liste.
 */
function selectTiles(activeSources) {
  if (activeSources.length === 0) return DEFAULT_TILES

  const tilesBySource = activeSources
    .filter((s) => TILES_BY_SOURCE[s])
    .map((s) => ({ source: s, list: TILES_BY_SOURCE[s] }))

  if (tilesBySource.length === 0) return DEFAULT_TILES

  // Round-robin : on prend la N-ième tile de chaque source dans l'ordre,
  // jusqu'à atteindre 4. Comme ça même avec 4 connecteurs, chacun a 1 tile.
  // Dédupe par key pour éviter doublons (ex: customers_new vient de Stripe ET Shopify).
  const selected = []
  const seenKeys = new Set()
  for (let i = 0; selected.length < 4 && i < 4; i++) {
    for (const { list } of tilesBySource) {
      if (selected.length >= 4) break
      const tile = list[i]
      if (!tile || seenKeys.has(tile.key)) continue
      selected.push(tile)
      seenKeys.add(tile.key)
    }
  }
  return selected
}

async function listActiveSources(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('connectors')
    .select('source')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
  if (error) {
    // Non-fatal — on retombe sur les DEFAULT_TILES.
    return []
  }
  return Array.from(new Set((data || []).map((c) => c.source)))
}

async function summary(req, res, next) {
  try {
    const days = clampInt(req.query.days, 7, 1, 90)
    const today = new Date()
    const endDate = isoDate(today)
    const startDate = isoDate(addDays(today, -days + 1))
    const prevEnd = isoDate(addDays(today, -days))
    const prevStart = isoDate(addDays(today, -2 * days + 1))

    const activeSources = await listActiveSources(req.workspaceId)
    const selectedTiles = selectTiles(activeSources)

    const tiles = await Promise.all(
      selectedTiles.map(async (m) => {
        const [current, previous] = await Promise.all([
          queryMetrics({
            workspaceId: req.workspaceId,
            metricKey: m.key,
            startDate,
            endDate,
          }),
          queryMetrics({
            workspaceId: req.workspaceId,
            metricKey: m.key,
            startDate: prevStart,
            endDate: prevEnd,
          }),
        ])
        const currentValue = m.kind === 'snapshot' ? lastValue(current) : sum(current)
        const previousValue = m.kind === 'snapshot' ? lastValue(previous) : sum(previous)
        // Sparkline : valeur quotidienne sur la fenêtre courante, triée par date.
        const spark = buildSparkline(current, m.kind)
        return {
          key: m.key,
          label: m.label,
          format: m.format,
          value: currentValue,
          previous_value: previousValue,
          delta_pct: pctChange(previousValue, currentValue),
          has_data: current.length > 0,
          spark,
        }
      }),
    )

    res.json({
      window: { days, start_date: startDate, end_date: endDate },
      active_sources: activeSources,
      tiles,
    })
  } catch (err) {
    next(err)
  }
}

async function timeseries(req, res, next) {
  try {
    const metricKey = String(req.query.metric || '').trim()
    if (!metricKey) {
      return res.status(400).json({ error: 'metric query param is required' })
    }
    const days = clampInt(req.query.days, 30, 1, 365)
    const today = new Date()
    const endDate = isoDate(today)
    const startDate = isoDate(addDays(today, -days + 1))

    const rows = await queryMetrics({
      workspaceId: req.workspaceId,
      metricKey,
      startDate,
      endDate,
    })

    res.json({
      metric: metricKey,
      window: { days, start_date: startDate, end_date: endDate },
      points: rows.map((r) => ({ date: r.date, value: Number(r.metric_value) })),
    })
  } catch (err) {
    next(err)
  }
}

router.get('/summary', summary)
router.get('/timeseries', timeseries)

/**
 * Construit un tableau de valeurs quotidiennes pour le sparkline.
 * Pour les métriques 'sum', on additionne les lignes du même jour (multi-source).
 * Pour les métriques 'snapshot', on prend la dernière valeur par jour.
 */
function buildSparkline(rows, kind) {
  if (!rows || rows.length === 0) return []
  const byDay = new Map()
  for (const r of rows) {
    const d = (r.date || '').slice(0, 10)
    if (!d) continue
    const v = Number(r.metric_value || 0)
    if (kind === 'snapshot') {
      byDay.set(d, v)
    } else {
      byDay.set(d, (byDay.get(d) || 0) + v)
    }
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, v]) => v)
}

function sum(rows) {
  if (!rows || rows.length === 0) return 0
  return rows.reduce((acc, r) => acc + Number(r.metric_value || 0), 0)
}

function lastValue(rows) {
  if (!rows || rows.length === 0) return 0
  // queryMetrics renvoie les rows triées par date asc; la dernière = la plus récente.
  return Number(rows[rows.length - 1].metric_value || 0)
}

function pctChange(previous, current) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(d, n) {
  const next = new Date(d)
  next.setUTCDate(next.getUTCDate() + n)
  return next
}

// Exporte les handlers pour que dashboard.routes.js puisse les réutiliser
// (mêmes routes sous un naming non-trackable).
module.exports = router
module.exports.handlers = { summary, timeseries }
// Exposé pour tests unitaires (sélection des tiles selon connecteurs actifs).
module.exports.selectTiles = selectTiles
module.exports.TILES_BY_SOURCE = TILES_BY_SOURCE
module.exports.DEFAULT_TILES = DEFAULT_TILES
