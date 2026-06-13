// Lecture + mise à jour des insights et action_cards (côté API authentifiée).
// La génération vit dans insight-engine.service ; ici c'est le CRUD léger
// consommé par la Home et la page Insights.

const { getServiceRoleClient } = require('../../lib/supabase')
const { NotFoundError, UserFacingError } = require('../../lib/error-handler')

const INSIGHT_STATUSES = new Set(['open', 'snoozed', 'resolved', 'dismissed'])
const ACTION_STATUSES = new Set(['todo', 'in_progress', 'done', 'dismissed'])

/**
 * Liste les insights d'un workspace (open par défaut) + leurs action_cards.
 */
async function listInsights(workspaceId, { status = 'open', limit = 20 } = {}) {
  const supabase = getServiceRoleClient()
  let q = supabase
    .from('insights')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status && status !== 'all') q = q.eq('status', status)
  const { data: insights, error } = await q
  if (error) throw error
  if (!insights || insights.length === 0) return []

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

/** Liste les action_cards d'un workspace (utile pour un board d'actions). */
async function listActions(workspaceId, { status, limit = 50 } = {}) {
  const supabase = getServiceRoleClient()
  let q = supabase
    .from('action_cards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status && status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

async function updateInsightStatus(workspaceId, insightId, status) {
  if (!INSIGHT_STATUSES.has(status)) {
    throw new UserFacingError(`Statut insight invalide : ${status}`, {
      statusCode: 400,
      code: 'INVALID_STATUS',
    })
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('insights')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', insightId)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Insight introuvable.')
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
  updateInsightStatus,
  updateActionStatus,
  INSIGHT_STATUSES,
  ACTION_STATUSES,
}
