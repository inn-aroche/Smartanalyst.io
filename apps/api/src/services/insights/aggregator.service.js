// Agrégateur de contexte pour l'Insight Engine.
//
// Construit un objet JSON compact "voici l'état du workspace" en comparant
// une période courante vs une période de référence :
//   - canonical_metrics : delta par metric_key × source (flux sommés,
//     snapshots = dernière valeur).
//   - smarttag_daily : volumes observés terrain par type/nom d'event.
//
// Ce contexte est passé au LLM. Le LLM RAISONNE dessus, il n'invente rien :
// tous les chiffres viennent d'ici.

const canonicalMetrics = require('../metrics/canonical-metrics.service')
const connectorService = require('../connectors/connector.service')
const connectorHealth = require('../connectors/connector-health.service')
const tracking = require('../tracking/ingestion.service')

// Métriques "snapshot" (état à un instant) vs "flux" (cumulables). Pour un
// snapshot on prend la dernière valeur de la période ; pour un flux on somme.
const SNAPSHOT_METRICS = new Set([
  'revenue_recurring_monthly',
  'revenue_annual_recurring',
  'customers_active',
  'lifetime_value_customer',
  'churn_rate_subscription',
  'bounce_rate_all',
  'click_through_rate_paid',
  'return_on_investment_paid',
])

function fmtDate(d) {
  return d.toISOString().slice(0, 10)
}

/**
 * Réduit des rows (date, metric_key, metric_value, source) en une valeur par
 * (metric_key, source) : somme pour les flux, dernière valeur pour snapshots.
 */
function reduceRows(rows) {
  const byKey = new Map() // `${metric_key}|${source}` → { metric_key, source, entries: [] }
  for (const r of rows) {
    const k = `${r.metric_key}|${r.source}`
    if (!byKey.has(k)) byKey.set(k, { metric_key: r.metric_key, source: r.source, entries: [] })
    byKey.get(k).entries.push(r)
  }
  const out = new Map()
  for (const [k, { metric_key, source, entries }] of byKey) {
    entries.sort((a, b) => (a.date < b.date ? 1 : -1)) // desc
    let value
    if (SNAPSHOT_METRICS.has(metric_key)) {
      value = Number(entries[0].metric_value)
    } else {
      value = entries.reduce((s, e) => s + Number(e.metric_value), 0)
    }
    out.set(k, { metric_key, source, value })
  }
  return out
}

function deltaPercent(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
}

/**
 * Construit le contexte d'analyse pour un workspace.
 *
 * @param {string} workspaceId
 * @param {Object} [opts]
 * @param {number} [opts.windowDays=30] - taille de la fenêtre courante
 * @returns {Promise<Object|null>} null si aucune donnée exploitable
 */
async function buildContext(workspaceId, { windowDays = 30 } = {}) {
  const now = new Date()
  const curEnd = now
  const curStart = new Date(now.getTime() - windowDays * 86400_000)
  const prevEnd = new Date(curStart.getTime() - 86400_000)
  const prevStart = new Date(prevEnd.getTime() - windowDays * 86400_000)

  const period = {
    start: fmtDate(curStart),
    end: fmtDate(curEnd),
    comparison_start: fmtDate(prevStart),
    comparison_end: fmtDate(prevEnd),
  }

  // ── canonical_metrics : courant vs précédent ──
  let curRows = []
  let prevRows = []
  try {
    ;[curRows, prevRows] = await Promise.all([
      canonicalMetrics.query({
        workspaceId,
        startDate: period.start,
        endDate: period.end,
        limit: 2000,
      }),
      canonicalMetrics.query({
        workspaceId,
        startDate: period.comparison_start,
        endDate: period.comparison_end,
        limit: 2000,
      }),
    ])
  } catch {
    return null
  }

  const cur = reduceRows(curRows)
  const prev = reduceRows(prevRows)

  const metrics = []
  for (const [k, { metric_key, source, value }] of cur) {
    const previous = prev.has(k) ? prev.get(k).value : null
    metrics.push({
      metric_key,
      source,
      value: Math.round(value * 100) / 100,
      previous_value: previous != null ? Math.round(previous * 100) / 100 : null,
      delta_percent: previous != null ? deltaPercent(value, previous) : null,
    })
  }

  // ── smarttag_daily : volumes terrain courant vs précédent ──
  let tagCur = []
  let tagPrev = []
  try {
    ;[tagCur, tagPrev] = await Promise.all([
      tracking.getDailyAggregates(workspaceId, { startDate: period.start, endDate: period.end }),
      tracking.getDailyAggregates(workspaceId, {
        startDate: period.comparison_start,
        endDate: period.comparison_end,
      }),
    ])
  } catch {
    tagCur = []
    tagPrev = []
  }

  const sumTag = (rows) => {
    const m = new Map()
    for (const r of rows) {
      const k = `${r.event_type}|${r.event_name}`
      m.set(k, (m.get(k) || 0) + Number(r.event_count))
    }
    return m
  }
  const tagCurM = sumTag(tagCur)
  const tagPrevM = sumTag(tagPrev)
  const smarttag = []
  for (const [k, count] of tagCurM) {
    const [event_type, event_name] = k.split('|')
    const previous = tagPrevM.has(k) ? tagPrevM.get(k) : null
    smarttag.push({
      event_type,
      event_name: event_name || null,
      count,
      previous_count: previous,
      delta_percent: previous != null ? deltaPercent(count, previous) : null,
    })
  }

  // ── Source states (cahier §3 Lot 0 — jamais de chiffre nu suspect) ──
  // On distingue explicitement : producing_data / connected_no_data /
  // failing / expired / not_connected. Le LLM doit savoir si un "0 €" est
  // un vrai zéro ou une absence de connecteur.
  let sourceStates = []
  try {
    const connectors = await connectorService.list(workspaceId)
    const enriched = connectorHealth.enrichWithHealth(connectors)
    const sourcesWithData = new Set(metrics.map((m) => m.source))
    sourceStates = enriched.map((c) => {
      const state = sourcesWithData.has(c.source)
        ? 'producing_data'
        : c.health_state.state === 'expired'
          ? 'expired'
          : c.health_state.state === 'failing' || c.health_state.silent_failure
            ? 'failing'
            : 'connected_no_data'
      return {
        source: c.source,
        state,
        health: c.health_state.state,
        reason: c.health_state.reason,
        last_synced_at: c.last_synced_at || null,
      }
    })
  } catch (err) {
    // Best-effort : si on ne peut pas lire la table connectors, on continue
    // sans source_states — le LLM perdra le contexte de causalité mais
    // aura toujours les métriques. On loggue silencieusement.
    sourceStates = []
  }

  // Aucune donnée nulle part → rien à analyser.
  if (metrics.length === 0 && smarttag.length === 0) return null

  return {
    period,
    connected_sources: Array.from(new Set(metrics.map((m) => m.source))),
    source_states: sourceStates,
    smarttag_active: smarttag.length > 0,
    metrics,
    smarttag,
  }
}

module.exports = { buildContext, reduceRows, deltaPercent, SNAPSHOT_METRICS }
