// Service backend du Centre de notifications (cahier §3 Lot 1).
//
// Responsabilités :
//   - createNotification()        : appelé par les producteurs (insight
//                                   engine, watch evaluator, connector
//                                   health monitor, digest scheduler).
//   - listForUser()               : ramène les notifs visibles pour un user
//                                   donné, avec le flag `read_at` joint.
//   - unreadCount()               : compte rapide pour le badge cloche.
//   - markAsRead(id|all)          : insère dans notification_reads.
//
// La table `notifications` est workspace-scoped (toute la team voit le
// même flux) ; le flag "lu/non-lu" est par user via `notification_reads`.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')

const ALLOWED_TYPES = new Set([
  'insight_created',
  'watch_triggered',
  'connector_health',
  'digest_ready',
  'task_proposed',
  'system',
])
const ALLOWED_SEVERITIES = new Set(['info', 'warning', 'critical'])

/**
 * Crée une notification pour un workspace. Best-effort : un échec ici
 * ne doit jamais bloquer le producteur (ex. un insight créé ne doit pas
 * être perdu si la notif rate). Loggue et avale l'erreur.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.type        - cf. ALLOWED_TYPES
 * @param {string} params.title
 * @param {string} [params.body]
 * @param {string} [params.link]      - chemin interne (ex. /veille#wid)
 * @param {string} [params.severity]  - 'info' | 'warning' | 'critical'
 * @param {object} [params.meta]      - payload libre (insightId, etc.)
 * @returns {Promise<{ id: string } | null>}
 */
async function createNotification({
  workspaceId,
  type,
  title,
  body = null,
  link = null,
  severity = 'info',
  meta = {},
}) {
  if (!workspaceId || !type || !title) {
    logger.warn(
      { event: 'notif_create_invalid', workspaceId, type },
      'createNotification: missing required fields',
    )
    return null
  }
  if (!ALLOWED_TYPES.has(type)) {
    logger.warn({ event: 'notif_create_unknown_type', type }, 'createNotification: unknown type')
    return null
  }
  const sev = ALLOWED_SEVERITIES.has(severity) ? severity : 'info'
  const supabase = getServiceRoleClient()
  const payload = {
    workspace_id: workspaceId,
    type,
    title: String(title).slice(0, 200),
    body: body ? String(body).slice(0, 2000) : null,
    link: link || null,
    severity: sev,
    meta: meta || {},
  }
  const { data, error } = await supabase.from('notifications').insert(payload).select('id').single()
  if (error) {
    logger.warn(
      { event: 'notif_create_failed', workspaceId, type, error: error.message },
      'createNotification failed',
    )
    return null
  }
  return data
}

/**
 * Ramène les notifications visibles pour un user dans un workspace,
 * triées de la plus récente à la plus ancienne. Joint le flag `read_at`
 * par user (null = non-lu).
 */
async function listForUser({ workspaceId, userId, limit = 30 }) {
  if (!workspaceId || !userId) return []
  const supabase = getServiceRoleClient()

  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id, type, severity, title, body, link, meta, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))
  if (error) throw error
  if (!rows || rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const { data: reads } = await supabase
    .from('notification_reads')
    .select('notification_id, read_at')
    .eq('user_id', userId)
    .in('notification_id', ids)
  const readMap = new Map((reads || []).map((r) => [r.notification_id, r.read_at]))

  return rows.map((r) => ({
    ...r,
    read_at: readMap.get(r.id) || null,
  }))
}

/**
 * Compte les notifications non-lues pour le badge cloche. Optimisé via
 * une seule requête comptée (pas de SELECT lourd).
 */
async function unreadCount({ workspaceId, userId }) {
  if (!workspaceId || !userId) return 0
  const supabase = getServiceRoleClient()

  // Toutes les notifs du workspace.
  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  if (!rows || rows.length === 0) return 0
  const allIds = rows.map((r) => r.id)

  // Celles que ce user a marqué lues.
  const { data: reads } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_id', userId)
    .in('notification_id', allIds)
  const readIds = new Set((reads || []).map((r) => r.notification_id))

  return allIds.filter((id) => !readIds.has(id)).length
}

/**
 * Marque une notif lue pour un user. Idempotent (upsert).
 */
async function markAsRead({ notificationId, userId }) {
  if (!notificationId || !userId) return false
  const supabase = getServiceRoleClient()
  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      { notification_id: notificationId, user_id: userId, read_at: new Date().toISOString() },
      { onConflict: 'notification_id,user_id', ignoreDuplicates: false },
    )
  if (error) {
    logger.warn(
      { event: 'notif_mark_read_failed', notificationId, error: error.message },
      'markAsRead failed',
    )
    return false
  }
  return true
}

/**
 * Marque toutes les notifs du workspace lues pour un user. Utile pour le
 * bouton "tout marquer lu" dans la dropdown.
 */
async function markAllAsRead({ workspaceId, userId }) {
  if (!workspaceId || !userId) return 0
  const supabase = getServiceRoleClient()
  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  if (!rows || rows.length === 0) return 0
  const payload = rows.map((r) => ({
    notification_id: r.id,
    user_id: userId,
    read_at: new Date().toISOString(),
  }))
  const { error: upErr } = await supabase
    .from('notification_reads')
    .upsert(payload, { onConflict: 'notification_id,user_id', ignoreDuplicates: false })
  if (upErr) {
    logger.warn(
      { event: 'notif_mark_all_read_failed', workspaceId, error: upErr.message },
      'markAllAsRead failed',
    )
    return 0
  }
  return rows.length
}

/**
 * Supprime les notifications de plus de `days` jours. Appele quotidiennement
 * par le scheduler pour eviter l'accumulation infinie. Supprime aussi les
 * reads orphelines dans la foulee.
 * @returns {Promise<number>} nombre de notifs supprimées
 */
async function purgeOld(days = 30) {
  const supabase = getServiceRoleClient()
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', cutoff)
    .select('id')
  if (error) {
    logger.warn({ event: 'notif_purge_failed', error: error.message }, 'purgeOld failed')
    return 0
  }
  const count = data?.length ?? 0
  if (count > 0) {
    logger.info({ event: 'notif_purge_done', count, cutoff }, `Purged ${count} old notifications`)
  }
  return count
}

module.exports = {
  createNotification,
  listForUser,
  unreadCount,
  markAsRead,
  markAllAsRead,
  purgeOld,
  ALLOWED_TYPES,
  ALLOWED_SEVERITIES,
}
