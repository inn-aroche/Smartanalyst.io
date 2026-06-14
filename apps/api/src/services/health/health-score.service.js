// Score de santé global 0-100 (brief V2 §3.1).
//
// Principe (heuristique v1, à raffiner) :
//   - On part de l'agrégateur d'insights (mêmes chiffres courant vs période
//     précédente, source unique de vérité).
//   - Chaque métrique est classée dans une dimension (paid / organic /
//     conversion / revenue) et a une "bonne direction" (revenu ↑ = bien,
//     churn ↑ = mal…).
//   - Sous-score par dimension = base 55 ajustée par les tendances.
//   - tracking : dérivé de la confiance SmartTag.
//   - Score global = moyenne pondérée des dimensions disponibles.
//
// Volontairement simple et lisible : le but est un repère "ça va / ça va pas",
// pas un modèle statistique. Tout est commenté pour être ajusté facilement.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const aggregator = require('../insights/aggregator.service')
const trackingHealth = require('../tracking/tracking-health.service')

// Métriques où "plus bas = mieux".
const LOWER_IS_BETTER = new Set([
  'bounce_rate_all',
  'churn_rate_subscription',
  'failed_payments_month',
  'cost_per_click_paid',
  'cost_per_click_paid_search',
  'cost_per_acquisition_paid',
  'cost_per_mille_paid',
])

// Pondération des dimensions dans le score global. Renormalisé sur les
// dimensions réellement disponibles.
const DIMENSION_WEIGHTS = {
  revenue: 0.3,
  conversion: 0.25,
  paid: 0.2,
  organic: 0.15,
  tracking: 0.1,
}

/** Classe une metric_key dans une dimension. Ordre de priorité important. */
function classifyDimension(metricKey) {
  const k = metricKey.toLowerCase()
  if (/paid/.test(k)) return 'paid'
  if (/conversion/.test(k)) return 'conversion'
  if (/revenue|customer|churn|lifetime|payment|recurring|annual/.test(k)) return 'revenue'
  return 'organic' // sessions, users, bounce, organic, engagement, impressions…
}

/**
 * Contribution d'une métrique au sous-score [-25, +25].
 * Pas de delta → 0 (neutre, on ne pénalise pas l'absence de baseline).
 */
function metricContribution(metricKey, deltaPercent) {
  if (typeof deltaPercent !== 'number' || !Number.isFinite(deltaPercent)) return 0
  const magnitude = Math.min(Math.abs(deltaPercent) / 20, 1) // cap à 20% = plein poids
  let signed = deltaPercent >= 0 ? 1 : -1
  if (LOWER_IS_BETTER.has(metricKey)) signed *= -1
  return signed * magnitude * 25
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Calcule le score de santé pour un workspace.
 * @returns {Promise<{ score, breakdown, computed_at, has_data } | null>}
 */
async function compute(workspaceId) {
  const context = await aggregator.buildContext(workspaceId)
  const metrics = context?.metrics || []

  // Regroupe les contributions par dimension.
  const dims = { paid: [], organic: [], conversion: [], revenue: [] }
  for (const m of metrics) {
    const dim = classifyDimension(m.metric_key)
    dims[dim].push(metricContribution(m.metric_key, m.delta_percent))
  }

  const breakdown = {}
  for (const [dim, contribs] of Object.entries(dims)) {
    if (contribs.length === 0) {
      breakdown[dim] = null // pas de données → exclu du global
      continue
    }
    const avg = contribs.reduce((s, c) => s + c, 0) / contribs.length
    breakdown[dim] = Math.round(clamp(55 + avg, 0, 100))
  }

  // Dimension tracking depuis la confiance SmartTag.
  try {
    const health = await trackingHealth.getHealth(workspaceId)
    const map = { high: 85, medium: 65, low: 40 }
    breakdown.tracking = map[health.confidence] ?? null
  } catch {
    breakdown.tracking = null
  }

  // Score global = moyenne pondérée des dimensions disponibles.
  let weightSum = 0
  let acc = 0
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    const sub = breakdown[dim]
    if (sub == null) continue
    acc += sub * weight
    weightSum += weight
  }
  const hasData = weightSum > 0
  const score = hasData ? Math.round(acc / weightSum) : 0

  return {
    score,
    breakdown,
    has_data: hasData,
    computed_at: new Date().toISOString(),
  }
}

/**
 * Calcule + persiste le snapshot du jour (upsert) + renvoie le delta vs ~7j.
 * @returns {Promise<{ score, delta, breakdown, has_data, computed_at }>}
 */
async function getScore(workspaceId) {
  const computed = await compute(workspaceId)
  const today = new Date().toISOString().slice(0, 10)
  const supabase = getServiceRoleClient()

  // Snapshot du jour (best-effort, ne bloque pas la réponse).
  if (computed.has_data) {
    const { error } = await supabase.from('health_scores').upsert(
      {
        workspace_id: workspaceId,
        date: today,
        score: computed.score,
        breakdown: computed.breakdown,
      },
      { onConflict: 'workspace_id,date' },
    )
    if (error) {
      logger.warn(
        { event: 'health_score_snapshot_failed', workspaceId, error: error.message },
        'Health score snapshot upsert failed',
      )
    }
  }

  // Delta vs le snapshot le plus proche d'il y a ~7 jours.
  let delta = null
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('health_scores')
      .select('score, date')
      .eq('workspace_id', workspaceId)
      .lte('date', weekAgo)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data && typeof data.score === 'number') delta = computed.score - data.score
  } catch {
    delta = null
  }

  return { ...computed, delta }
}

module.exports = {
  getScore,
  compute,
  classifyDimension,
  metricContribution,
  LOWER_IS_BETTER,
}
