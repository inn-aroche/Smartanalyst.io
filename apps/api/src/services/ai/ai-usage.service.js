// Tracking d'usage IA : enregistre chaque appel LLM, agrège par mois,
// vérifie le budget du workspace avant les appels critiques.
//
// Plus simple qu'un middleware Express : on appelle recordUsage() depuis
// les services qui font les appels Gemini (chat, insight-engine, watch-
// validator…). Best-effort : si l'INSERT échoue, on log et on continue —
// pas question de bloquer une réponse user pour un échec de logging.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const entitlements = require('../billing/entitlements.service')

// Prix USD par 1M tokens (à jour juin 2026 — relire si on change de modèle).
const PRICING = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.075, output: 0.3 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-4-8': { input: 15, output: 75 },
}

function computeCostUsd(model, inputTokens, outputTokens) {
  const p = PRICING[model]
  if (!p) return 0
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

/**
 * Enregistre un appel LLM. Best-effort : ne throw jamais — un échec ici
 * ne doit pas casser la réponse user.
 *
 * @param {object} args
 * @param {string} args.workspaceId  — null acceptable (appels non-scope).
 * @param {string} [args.userId]
 * @param {string} args.model
 * @param {string} args.requestType  — 'chat' / 'insight_engine' / 'watch_validator' / etc.
 * @param {number} args.inputTokens
 * @param {number} args.outputTokens
 * @param {number} [args.durationMs]
 */
async function recordUsage({
  workspaceId,
  userId,
  model,
  requestType,
  inputTokens = 0,
  outputTokens = 0,
  durationMs,
}) {
  if (!workspaceId) return // pas de workspace = pas de tracking (cas rare)
  try {
    const costUsd = computeCostUsd(model, inputTokens, outputTokens)
    const supabase = getServiceRoleClient()
    const { error } = await supabase.from('ai_usage').insert({
      workspace_id: workspaceId,
      user_id: userId || null,
      model,
      request_type: requestType,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      duration_ms: durationMs ?? null,
    })
    if (error) throw error
  } catch (err) {
    logger.warn(
      { event: 'ai_usage_record_failed', model, requestType, error: err.message },
      'Failed to record AI usage',
    )
  }
}

/**
 * Récupère l'usage du mois en cours pour un workspace.
 *
 * @returns {Promise<{
 *   month: string,
 *   total_tokens: number,
 *   total_cost_usd: number,
 *   limit: number|null,
 *   by_type: Array<{ request_type, tokens, cost_usd, calls }>
 * }>}
 */
async function getMonthlyUsage(workspaceId) {
  const supabase = getServiceRoleClient()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthIso = monthStart.toISOString().slice(0, 10)

  const [{ data: rows, error: usageErr }, { data: ws, error: wsErr }] = await Promise.all([
    supabase
      .from('ai_usage')
      .select('request_type, input_tokens, output_tokens, cost_usd')
      .eq('workspace_id', workspaceId)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('workspaces')
      .select('ai_monthly_token_limit')
      .eq('id', workspaceId)
      .maybeSingle(),
  ])
  if (usageErr) throw usageErr
  if (wsErr) throw wsErr

  const byType = new Map()
  let totalTokens = 0
  let totalCostUsd = 0
  for (const r of rows || []) {
    const tokens = (r.input_tokens || 0) + (r.output_tokens || 0)
    totalTokens += tokens
    totalCostUsd += Number(r.cost_usd) || 0
    const existing = byType.get(r.request_type) || { tokens: 0, cost_usd: 0, calls: 0 }
    byType.set(r.request_type, {
      tokens: existing.tokens + tokens,
      cost_usd: existing.cost_usd + (Number(r.cost_usd) || 0),
      calls: existing.calls + 1,
    })
  }

  return {
    month: monthIso,
    total_tokens: totalTokens,
    total_cost_usd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    limit: ws?.ai_monthly_token_limit ?? null,
    by_type: Array.from(byType.entries()).map(([request_type, v]) => ({
      request_type,
      ...v,
    })),
  }
}

/**
 * Vérifie qu'un workspace n'a pas dépassé son budget. Renvoie un objet
 * exploitable par les services pour décider de bloquer ou continuer.
 */
async function checkBudget(workspaceId) {
  if (!workspaceId) return { allowed: true, exceeded: false }
  try {
    const usage = await getMonthlyUsage(workspaceId)
    let limit = usage.limit
    // Si la colonne DB est NULL, on résout la limite depuis le plan
    // (PLAN_FEATURES.maxAiTokensPerMonth). Sans ça, Free = NULL = pas de limite.
    if (limit == null) {
      const plan = await entitlements.getWorkspacePlan(workspaceId)
      const planLimit = entitlements.PLAN_FEATURES[plan]?.maxAiTokensPerMonth
      limit = Number.isFinite(planLimit) ? planLimit : null
    }
    if (limit == null) {
      return { allowed: true, exceeded: false, used: usage.total_tokens, limit: null }
    }
    const exceeded = usage.total_tokens >= limit
    return {
      allowed: !exceeded,
      exceeded,
      used: usage.total_tokens,
      limit,
    }
  } catch (err) {
    // En cas d'erreur de check, on laisse passer (fail open).
    logger.warn(
      { event: 'ai_budget_check_failed', workspaceId, error: err.message },
      'Budget check failed — allowing call by default',
    )
    return { allowed: true, exceeded: false }
  }
}

module.exports = { recordUsage, getMonthlyUsage, checkBudget, computeCostUsd, PRICING }
