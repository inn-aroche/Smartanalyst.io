// Metrics routes — surface the canonical metrics layer to the SaaS frontend.
// All endpoints scoped to the caller's active workspace.
//
// IMPORTANT : ces routes sont conservées pour backward-compat (SDK externes
// éventuels, tokens d'intégration). Le frontend SaaS utilise désormais
// /api/v1/dashboard/* (cf dashboard.routes.js) — naming neutre côté
// adblockers, qui matchent agressivement les paths /metrics/*.

const express = require('express')
const { query: queryMetrics } = require('../services/metrics/canonical-metrics.service')
const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')

const router = express.Router()

router.use(jwtMiddleware)
router.use(workspaceScope)

// KPIs displayed on the dashboard. We sum/average each canonical metric over
// the requested window and compute the delta vs. the previous window of the
// same length. Returns a stable shape even when there's no data yet, so the
// frontend can render empty-state tiles without special-casing.
const SUMMARY_METRICS = [
  { key: 'sessions_all', label: 'Sessions', kind: 'sum', format: 'integer' },
  { key: 'conversions_all', label: 'Conversions', kind: 'sum', format: 'integer' },
  { key: 'revenue_total', label: 'Revenue', kind: 'sum', format: 'currency' },
  { key: 'spend_paid_total', label: 'Ad spend', kind: 'sum', format: 'currency' },
]

async function summary(req, res, next) {
  try {
    const days = clampInt(req.query.days, 7, 1, 90)
    const today = new Date()
    const endDate = isoDate(today)
    const startDate = isoDate(addDays(today, -days + 1))
    const prevEnd = isoDate(addDays(today, -days))
    const prevStart = isoDate(addDays(today, -2 * days + 1))

    const tiles = await Promise.all(
      SUMMARY_METRICS.map(async (m) => {
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
        const currentValue = sum(current)
        const previousValue = sum(previous)
        return {
          key: m.key,
          label: m.label,
          format: m.format,
          value: currentValue,
          previous_value: previousValue,
          delta_pct: pctChange(previousValue, currentValue),
          has_data: current.length > 0,
        }
      }),
    )

    res.json({
      window: { days, start_date: startDate, end_date: endDate },
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

function sum(rows) {
  if (!rows || rows.length === 0) return 0
  return rows.reduce((acc, r) => acc + Number(r.metric_value || 0), 0)
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
