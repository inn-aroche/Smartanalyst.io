// Lecture + mise à jour des insights et action_cards (côté API authentifiée).
// La génération vit dans insight-engine.service ; ici c'est le CRUD léger
// consommé par la Home et la page Insights.

const { getServiceRoleClient } = require('../../lib/supabase')
const { NotFoundError, UserFacingError } = require('../../lib/error-handler')
const canonicalMetrics = require('../metrics/canonical-metrics.service')

const INSIGHT_STATUSES = new Set(['open', 'snoozed', 'resolved', 'dismissed'])

// Rang de sévérité pour le tri : la colonne est du text, un ORDER BY SQL
// donnerait l'ordre alphabétique (medium > low > high > critical) — faux.
// On trie donc côté serveur applicatif avec ce rang explicite.
const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 }
// Cycle de vie tâches (brief V2 §3.4) :
//   proposed (IA suggère) → todo (user valide) → done | archived
//   proposed → archived (écartée sans validation)
const ACTION_STATUSES = new Set(['proposed', 'todo', 'in_progress', 'done', 'archived'])

/**
 * Ré-ouvre les insights snoozés dont la deadline est passée (cahier 23).
 * Best-effort : une erreur ici ne doit pas bloquer le listing.
 */
async function reopenExpiredSnoozes(workspaceId) {
  const supabase = getServiceRoleClient()
  const { error } = await supabase
    .from('insights')
    .update({
      status: 'open',
      snoozed_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('status', 'snoozed')
    .lte('snoozed_until', new Date().toISOString())
  if (error) {
    // On log mais on continue : le user verra son insight au prochain refresh.
    return { ok: false, reason: error.message }
  }
  return { ok: true }
}

/**
 * Liste les insights d'un workspace (open par défaut) + leurs action_cards.
 * Effet de bord : re-ouvre d'abord les snoozes expirés pour ne pas masquer
 * d'insights critiques que l'user avait juste mis en pause temporairement.
 */
async function listInsights(workspaceId, { status = 'open', limit = 20 } = {}) {
  // Auto-reopen des snoozes expirés avant le listing.
  await reopenExpiredSnoozes(workspaceId)
  const supabase = getServiceRoleClient()
  // On sur-fetch (cap 200) puis on trie par rang de sévérité en JS : le tri
  // SQL sur la colonne text serait alphabétique et éjecterait les critical
  // du top N. Volumes réels par workspace : dizaines, pas milliers.
  const fetchCap = Math.min(Math.max(limit * 5, 50), 200)
  let q = supabase
    .from('insights')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(fetchCap)
  if (status && status !== 'all') q = q.eq('status', status)
  const { data: rows, error } = await q
  if (error) throw error
  if (!rows || rows.length === 0) return []

  const insights = rows
    .sort(
      (a, b) =>
        (SEVERITY_RANK[b.severity] ?? -1) - (SEVERITY_RANK[a.severity] ?? -1) ||
        new Date(b.created_at) - new Date(a.created_at),
    )
    .slice(0, limit)

  const ids = insights.map((i) => i.id)
  const { data: actions, error: aErr } = await supabase
    .from('action_cards')
    .select('*')
    .in('insight_id', ids)
  if (aErr) throw aErr

  const byInsight = new Map()
  for (const a of actions || []) {
    if (!byInsight.has(a.insight_id)) byInsight.set(a.insight_id, [])
    byInsight.get(a.insight_id).push(a)
  }
  return insights.map((i) => ({ ...i, actions: byInsight.get(i.id) || [] }))
}

/**
 * Résout les points du graphe d'un insight depuis canonical_metrics.
 *
 * Rappel archi : le LLM n'émet JAMAIS les `data` du chart (anti-hallucination
 * de chiffres). Il décrit seulement quoi afficher (metric_key, source). Ici le
 * backend va chercher les vraies valeurs journalières sur la période de
 * l'insight et les renvoie au front pour rendu.
 *
 * @returns {Promise<null | { chart_type, title, source, metric_key, points: [{date, value}] }>}
 *   null si l'insight n'a pas de chart_spec exploitable (pas de metric_key, ou
 *   aucune donnée sur la période).
 */
async function getInsightChart(workspaceId, insightId) {
  const supabase = getServiceRoleClient()
  const { data: insight, error } = await supabase
    .from('insights')
    .select('id, workspace_id, chart_spec, period_start, period_end')
    .eq('workspace_id', workspaceId)
    .eq('id', insightId)
    .maybeSingle()
  if (error) throw error
  if (!insight) throw new NotFoundError('Insight introuvable.')

  const spec = insight.chart_spec
  if (!spec || !spec.metric_key) return null

  // Plage : la période de l'insight, sinon 30 derniers jours par défaut.
  const today = new Date()
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fmt = (d) => d.toISOString().slice(0, 10)
  const startDate = insight.period_start || fmt(monthAgo)
  const endDate = insight.period_end || fmt(today)

  let rows = []
  try {
    rows = await canonicalMetrics.query({
      workspaceId,
      metricKey: spec.metric_key,
      source: spec.source || undefined,
      startDate,
      endDate,
      limit: 400,
    })
  } catch {
    return null
  }
  if (!rows.length) return null

  // Une valeur par jour (si plusieurs sources, on somme — le spec.source
  // restreint normalement à une source précise).
  const byDate = new Map()
  for (const r of rows) {
    byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.metric_value))
  }
  const points = Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  return {
    chart_type: ['line', 'bar', 'donut', 'funnel', 'sparkline'].includes(spec.chart_type)
      ? spec.chart_type
      : 'line',
    title: spec.title || null,
    source: spec.source || null,
    metric_key: spec.metric_key,
    points,
  }
}

/**
 * Liste les tâches d'un workspace.
 *
 * Brief V2 §3.4 :
 *   - status='proposed' → "tâches suggérées par l'IA, à valider"
 *   - status='todo' → "à faire aujourd'hui"
 *   - bucket='active' (alias raccourci) → proposed + todo + in_progress
 *   - bucket='inbox' → uniquement proposed (les tâches à curer)
 *   - bucket='today' → uniquement todo (les vraies tâches actives)
 */
async function listActions(workspaceId, { status, bucket, limit = 50 } = {}) {
  const supabase = getServiceRoleClient()
  let q = supabase
    .from('action_cards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status && status !== 'all') {
    q = q.eq('status', status)
  } else if (bucket === 'active') {
    q = q.in('status', ['proposed', 'todo', 'in_progress'])
  } else if (bucket === 'inbox') {
    q = q.eq('status', 'proposed')
  } else if (bucket === 'today') {
    q = q.eq('status', 'todo')
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/** Récupère une tâche par id (workspace-scoped). */
async function getActionById(workspaceId, actionId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('action_cards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', actionId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Tâche introuvable.')
  return data
}

async function updateInsightStatus(workspaceId, insightId, status, { snoozedUntil = null } = {}) {
  if (!INSIGHT_STATUSES.has(status)) {
    throw new UserFacingError(`Statut insight invalide : ${status}`, {
      statusCode: 400,
      code: 'INVALID_STATUS',
    })
  }
  // Cohérence : snoozed_until n'a de sens que pour status='snoozed'. Sur
  // tout autre statut on remet le champ à null pour ne pas trainer une
  // deadline obsolète qui re-ouvrirait un insight resolved/dismissed.
  const update = { status, updated_at: new Date().toISOString() }
  if (status === 'snoozed') {
    if (!snoozedUntil) {
      throw new UserFacingError('snoozed_until requis pour status=snoozed', {
        statusCode: 400,
        code: 'SNOOZE_DEADLINE_REQUIRED',
      })
    }
    const deadline = new Date(snoozedUntil)
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      throw new UserFacingError('snoozed_until doit être une date future valide', {
        statusCode: 400,
        code: 'SNOOZE_DEADLINE_INVALID',
      })
    }
    update.snoozed_until = deadline.toISOString()
  } else {
    update.snoozed_until = null
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('insights')
    .update(update)
    .eq('workspace_id', workspaceId)
    .eq('id', insightId)
    .select('id, status, snoozed_until')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Insight introuvable.')
  return data
}

/**
 * Crée une action manuellement (UI quick-add ou crochet chat).
 *
 * Insertion via service_role : la RLS de `action_cards` réserve INSERT au
 * service_role (cf. migration 022). Le serveur garantit ici le scope
 * workspace (workspaceScope middleware) et fixe les défauts métier.
 */
async function createAction({
  workspaceId,
  userId,
  title,
  description,
  priority,
  impact,
  effort,
  confidence,
  insightId,
  source,
}) {
  const supabase = getServiceRoleClient()
  const payload = {
    workspace_id: workspaceId,
    insight_id: insightId || null,
    title: title.trim(),
    description: description ? description.trim() : null,
    priority: priority || 'medium',
    impact: Number.isFinite(impact) ? impact : null,
    effort: Number.isFinite(effort) ? effort : null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    status: 'todo',
    source: { type: source || 'manual', created_by: userId || null },
  }
  const { data, error } = await supabase.from('action_cards').insert(payload).select('*').single()
  if (error) throw error
  return data
}

async function updateActionStatus(workspaceId, actionId, status) {
  if (!ACTION_STATUSES.has(status)) {
    throw new UserFacingError(`Statut action invalide : ${status}`, {
      statusCode: 400,
      code: 'INVALID_STATUS',
    })
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('action_cards')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', actionId)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Action introuvable.')
  return data
}

module.exports = {
  listInsights,
  listActions,
  getActionById,
  getInsightChart,
  createAction,
  updateInsightStatus,
  updateActionStatus,
  reopenExpiredSnoozes,
  INSIGHT_STATUSES,
  ACTION_STATUSES,
}
