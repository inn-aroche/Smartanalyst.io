// Service pinned_widgets (cahier 22b §3.4 — "Pin to dashboard").
//
// L'user clique 📌 sur un highlight chat → on persiste une row qui sera
// re-rendue sur BriefHome (dashboard d'accueil) au prochain affichage.
//
// Validation cote service : on whitelist les champs de spec acceptes selon
// le kind. Empeche un blob arbitraire d'arriver en base.

const { getServiceRoleClient } = require('../../lib/supabase')
const { UserFacingError } = require('../../lib/error-handler')

const MAX_WIDGETS_PER_WORKSPACE = 12

/**
 * Valide et normalise une spec selon son kind. Throw UserFacingError si invalide.
 *
 * KPI : { title, value, delta? , unit? }
 * Chart : { title, series: [{date, value}], unit?, metricKey? }
 */
function validateSpec(kind, raw) {
  if (typeof raw !== 'object' || raw === null) {
    throw new UserFacingError('Widget spec invalide.', { statusCode: 400, code: 'INVALID_SPEC' })
  }
  const title = String(raw.title || '')
    .trim()
    .slice(0, 80)
  if (!title) {
    throw new UserFacingError('Widget sans titre.', { statusCode: 400, code: 'TITLE_REQUIRED' })
  }
  if (kind === 'kpi') {
    return {
      title,
      value: raw.value != null ? String(raw.value).slice(0, 40) : null,
      delta: raw.delta != null ? String(raw.delta).slice(0, 20) : null,
      unit: raw.unit ? String(raw.unit).slice(0, 12) : null,
      metricKey: raw.metricKey ? String(raw.metricKey).slice(0, 60) : null,
    }
  }
  if (kind === 'chart') {
    const series = Array.isArray(raw.series) ? raw.series : []
    // Cap a 200 points + valide chaque point.
    const cleanSeries = []
    for (const p of series.slice(0, 200)) {
      if (!p || typeof p !== 'object') continue
      const date = typeof p.date === 'string' ? p.date.slice(0, 10) : null
      const value = Number(p.value)
      if (!date || !Number.isFinite(value)) continue
      cleanSeries.push({ date, value })
    }
    if (cleanSeries.length < 2) {
      throw new UserFacingError('Au moins 2 points requis pour un widget chart.', {
        statusCode: 400,
        code: 'CHART_NEEDS_2_POINTS',
      })
    }
    return {
      title,
      series: cleanSeries,
      unit: raw.unit ? String(raw.unit).slice(0, 12) : null,
      metricKey: raw.metricKey ? String(raw.metricKey).slice(0, 60) : null,
    }
  }
  throw new UserFacingError(`Kind non supporte : ${kind}`, {
    statusCode: 400,
    code: 'INVALID_KIND',
  })
}

async function listWidgets(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('pinned_widgets')
    .select('id, kind, spec, source_kind, source_message_id, position, created_at')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

async function createWidget(workspaceId, userId, { kind, spec, sourceMessageId = null }) {
  if (!['kpi', 'chart'].includes(kind)) {
    throw new UserFacingError(`Kind non supporte : ${kind}`, {
      statusCode: 400,
      code: 'INVALID_KIND',
    })
  }
  const cleanSpec = validateSpec(kind, spec)
  const supabase = getServiceRoleClient()

  // Cap : max N widgets / workspace pour eviter qu'un user fasse exploser
  // le rendu de BriefHome avec 50 pins.
  const { count } = await supabase
    .from('pinned_widgets')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
  if ((count || 0) >= MAX_WIDGETS_PER_WORKSPACE) {
    throw new UserFacingError(
      `Maximum ${MAX_WIDGETS_PER_WORKSPACE} widgets épinglés. Retire-en un pour en ajouter un nouveau.`,
      { statusCode: 409, code: 'MAX_WIDGETS' },
    )
  }

  // Position = max existant + 1 (apparait en bas par defaut).
  const { data: maxRow } = await supabase
    .from('pinned_widgets')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (maxRow?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('pinned_widgets')
    .insert({
      workspace_id: workspaceId,
      created_by: userId || null,
      kind,
      spec: cleanSpec,
      source_kind: sourceMessageId ? 'chat' : 'manual',
      source_message_id: sourceMessageId,
      position,
    })
    .select('id, kind, spec, source_kind, source_message_id, position, created_at')
    .single()
  if (error) throw error
  return data
}

async function deleteWidget(workspaceId, widgetId) {
  const supabase = getServiceRoleClient()
  const { error, count } = await supabase
    .from('pinned_widgets')
    .delete({ count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('id', widgetId)
  if (error) throw error
  return { deleted: (count || 0) > 0 }
}

module.exports = {
  listWidgets,
  createWidget,
  deleteWidget,
  validateSpec,
  MAX_WIDGETS_PER_WORKSPACE,
}
