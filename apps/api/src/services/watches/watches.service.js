// Service watches — alertes custom utilisateur (brief V2 §3.3, WatchModal).
//
// Le flow d'évaluation (qui déclenche une notification quand une condition se
// réalise) sera câblé dans un job de fond séparé. Ici on couvre uniquement le
// CRUD : créer, lister, basculer, supprimer.

const { getServiceRoleClient } = require('../../lib/supabase')
const { UserFacingError, NotFoundError } = require('../../lib/error-handler')

const OPERATORS = new Set(['drops_below', 'rises_above', 'changes_by_pct', 'any_change'])

function validateInput({ description, metric_key, operator, threshold }) {
  const desc = String(description || '').trim()
  if (desc.length < 3 || desc.length > 280) {
    throw new UserFacingError('Description requise (3 à 280 caractères).', {
      statusCode: 400,
      code: 'INVALID_DESCRIPTION',
    })
  }
  const mk = String(metric_key || '').trim()
  if (mk.length < 3 || mk.length > 80) {
    throw new UserFacingError('Métrique invalide.', { statusCode: 400, code: 'INVALID_METRIC' })
  }
  if (!OPERATORS.has(operator)) {
    throw new UserFacingError(`Opérateur invalide : ${operator}`, {
      statusCode: 400,
      code: 'INVALID_OPERATOR',
    })
  }
  // threshold requis sauf pour any_change.
  if (operator !== 'any_change') {
    if (threshold == null || !Number.isFinite(Number(threshold))) {
      throw new UserFacingError('Seuil numérique requis pour cet opérateur.', {
        statusCode: 400,
        code: 'INVALID_THRESHOLD',
      })
    }
  }
}

async function listWatches(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('watches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

async function createWatch(workspaceId, userId, payload) {
  validateInput(payload)
  const supabase = getServiceRoleClient()
  const row = {
    workspace_id: workspaceId,
    created_by: userId || null,
    description: payload.description.trim(),
    metric_key: payload.metric_key.trim(),
    source: payload.source ? String(payload.source).trim() : null,
    operator: payload.operator,
    threshold: payload.operator === 'any_change' ? null : Number(payload.threshold),
    notify_in_app: payload.notify_in_app !== false, // default true
    notify_email: payload.notify_email === true, // default false
    enabled: true,
  }
  const { data, error } = await supabase.from('watches').insert(row).select('*').single()
  if (error) throw error
  return data
}

async function patchWatch(workspaceId, watchId, patch) {
  const allowed = {}
  if (typeof patch.enabled === 'boolean') allowed.enabled = patch.enabled
  if (typeof patch.notify_in_app === 'boolean') allowed.notify_in_app = patch.notify_in_app
  if (typeof patch.notify_email === 'boolean') allowed.notify_email = patch.notify_email
  if (Object.keys(allowed).length === 0) {
    throw new UserFacingError('Aucun champ modifiable fourni.', {
      statusCode: 400,
      code: 'EMPTY_PATCH',
    })
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('watches')
    .update(allowed)
    .eq('workspace_id', workspaceId)
    .eq('id', watchId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Alerte introuvable.')
  return data
}

async function deleteWatch(workspaceId, watchId) {
  const supabase = getServiceRoleClient()
  const { error, count } = await supabase
    .from('watches')
    .delete({ count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('id', watchId)
  if (error) throw error
  if (!count) throw new NotFoundError('Alerte introuvable.')
  return { deleted: true }
}

module.exports = {
  listWatches,
  createWatch,
  patchWatch,
  deleteWatch,
  OPERATORS,
}
