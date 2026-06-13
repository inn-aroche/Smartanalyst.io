// Publication temps-réel des événements de tracking dans Redis.
//
// Pattern : PUBSUB sur le channel `track:<workspaceId>`. Le WebSocket
// server (lib/ws-server.js) s'abonne à ces channels et forward vers les
// clients connectés au dashboard /live.
//
// Pas de persistence ici (StandardTag = real-time only). La phase SmartTag
// premium écrira en plus dans une table Postgres+TimescaleDB.

const { getRedis } = require('../../lib/redis')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')

const CHANNEL_PREFIX = 'track:'
// On garde aussi un mini compteur agrégé par minute pour permettre au
// dashboard de calculer "pageviews last 5 min" sans avoir à rejouer tous
// les events (utile si l'utilisateur ouvre la page après que les events
// soient passés). TTL court (10 min) → vraiment ephemeral.
const COUNTER_TTL_S = 600

// Key Redis qui stampe le dernier event reçu par workspace, utilisée par
// le frontend Smart tag pour détecter si le tag est installé et fonctionne
// (sinon on affiche l'onboarding au lieu du dashboard). TTL long (30 jours)
// pour que l'état persiste entre 2 sessions utilisateur.
const STATUS_KEY_PREFIX = 'track:status:'
const STATUS_TTL_S = 30 * 24 * 3600

function channelFor(workspaceId) {
  return `${CHANNEL_PREFIX}${workspaceId}`
}

/**
 * Persiste l'événement dans l'agrégat journalier Postgres (smarttag_daily)
 * via la RPC d'incrément atomique. Fire-and-forget : ne bloque jamais la
 * réponse 204 du endpoint public /track.
 *
 * Grain : (workspace, date UTC, type, nom). event_name = '' sauf pour les
 * events 'custom' (où on garde le nom, ex: 'lead_submit') — c'est ce qui
 * permettra à l'insight engine de comparer "SmartTag a vu N conversions"
 * vs GA4/Meta.
 *
 * Note scale : à volume élevé, remplacer ce write-per-event par un flush
 * batché (Redis daily counters → upsert périodique). OK en l'état au volume
 * beta.
 */
function persistDaily(workspaceId, event) {
  const date = new Date(Number.isFinite(event.ts) ? event.ts : Date.now())
    .toISOString()
    .slice(0, 10)
  const eventName = event.type === 'custom' ? (event.name || '').slice(0, 60) : ''

  getServiceRoleClient()
    .rpc('increment_smarttag_daily', {
      p_workspace_id: workspaceId,
      p_date: date,
      p_event_type: event.type,
      p_event_name: eventName,
      p_delta: 1,
    })
    .then(({ error }) => {
      if (error) {
        logger.warn(
          { event: 'smarttag_persist_failed', workspaceId, type: event.type, error: error.message },
          'SmartTag daily persist failed',
        )
      }
    })
}

/**
 * Publie un événement sanitized vers le channel temps-réel du workspace.
 * Incrémente aussi un compteur par minute par type (pour stats résumées).
 *
 * @param {string} workspaceId
 * @param {Object} event  - Sortie de sanitizeEvent()
 * @param {Object} meta   - {country?: string} — geo issu de l'IP truncated
 */
async function publish(workspaceId, event, meta = {}) {
  const redis = getRedis()
  const payload = JSON.stringify({ ...event, meta })

  // Channel pub/sub
  const channel = channelFor(workspaceId)

  // Compteur agrégé par minute par type (mini stats)
  const minute = Math.floor(Date.now() / 60_000)
  const counterKey = `stats:${workspaceId}:${minute}:${event.type}`

  try {
    await Promise.all([
      redis.publish(channel, payload),
      redis
        .multi()
        .incr(counterKey)
        .expire(counterKey, COUNTER_TTL_S)
        .set(`${STATUS_KEY_PREFIX}${workspaceId}`, String(Date.now()), 'EX', STATUS_TTL_S)
        .exec(),
    ])
  } catch (err) {
    logger.warn(
      { event: 'tracking_publish_failed', workspaceId, error: err.message },
      'Tracking event publish failed',
    )
  }

  // Persistance journalière (fire-and-forget, hors du await ci-dessus pour
  // ne pas ajouter de latence au pub/sub temps-réel).
  persistDaily(workspaceId, event)
}

/**
 * Renvoie l'état d'installation du tag pour un workspace.
 * Utilisé par GET /api/v1/track/status pour décider onboarding vs dashboard
 * côté front.
 *
 * @param {string} workspaceId
 * @returns {Promise<{ installed: boolean, lastEventAt: number|null }>}
 */
async function getStatus(workspaceId) {
  const redis = getRedis()
  try {
    const ts = await redis.get(`${STATUS_KEY_PREFIX}${workspaceId}`)
    if (!ts) return { installed: false, lastEventAt: null }
    const lastEventAt = Number(ts)
    if (!Number.isFinite(lastEventAt)) return { installed: false, lastEventAt: null }
    return { installed: true, lastEventAt }
  } catch (err) {
    logger.warn(
      { event: 'tracking_status_lookup_failed', workspaceId, error: err.message },
      'Tracking status lookup failed',
    )
    return { installed: false, lastEventAt: null }
  }
}

/**
 * Récupère les agrégats journaliers SmartTag persistés pour une période.
 * Utilisé par le tracking-health et l'insight engine pour comparer les
 * volumes observés terrain vs les connecteurs (GA4/Meta/Stripe).
 *
 * @param {string} workspaceId
 * @param {Object} params
 * @param {string} params.startDate - 'YYYY-MM-DD' inclus
 * @param {string} params.endDate   - 'YYYY-MM-DD' inclus
 * @returns {Promise<Array<{ date, event_type, event_name, event_count }>>}
 */
async function getDailyAggregates(workspaceId, { startDate, endDate }) {
  const supabase = getServiceRoleClient()
  let q = supabase
    .from('smarttag_daily')
    .select('date, event_type, event_name, event_count')
    .eq('workspace_id', workspaceId)
    .order('date', { ascending: false })
  if (startDate) q = q.gte('date', startDate)
  if (endDate) q = q.lte('date', endDate)
  const { data, error } = await q
  if (error) {
    logger.warn(
      { event: 'smarttag_aggregates_query_failed', workspaceId, error: error.message },
      'SmartTag daily aggregates query failed',
    )
    return []
  }
  return data || []
}

module.exports = { publish, channelFor, getStatus, getDailyAggregates, persistDaily }
