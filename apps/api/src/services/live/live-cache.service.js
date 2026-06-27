// Cache + throttle pour les requêtes live (GA4, Meta, Stripe, Shopify, GSC).
//
// TTL 5 min — assez frais pour un usage interactif (chat), assez long pour
// éviter de taper l'API source à chaque message.
// Throttle 20 requêtes live / workspace / minute — coupe-circuit si l'user
// spamme le chat avec des questions dimensionnelles.

const crypto = require('crypto')
const { getRedis } = require('../../lib/redis')
const { logger } = require('../../lib/logger')

const DEFAULT_TTL_S = 300
const THROTTLE_WINDOW_S = 60
const THROTTLE_MAX = 20

function cacheKey(workspaceId, source, params) {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ workspaceId, source, ...params }))
    .digest('hex')
    .slice(0, 16)
  return `live:${workspaceId}:${source}:${hash}`
}

async function cacheGet(key) {
  try {
    const redis = getRedis()
    const raw = await redis.get(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function cacheSet(key, data, ttl = DEFAULT_TTL_S) {
  try {
    const redis = getRedis()
    await redis.set(key, JSON.stringify(data), 'EX', ttl)
  } catch (err) {
    logger.warn({ event: 'live_cache_set_failed', key, error: err.message })
  }
}

function throttleKey(workspaceId) {
  return `live_throttle:${workspaceId}`
}

async function throttleCheck(workspaceId) {
  try {
    const redis = getRedis()
    const key = throttleKey(workspaceId)
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, THROTTLE_WINDOW_S)
    return count <= THROTTLE_MAX
  } catch {
    return true
  }
}

async function cachedQuery(workspaceId, source, params, fetchFn) {
  const allowed = await throttleCheck(workspaceId)
  if (!allowed) {
    logger.warn({ event: 'live_query_throttled', workspaceId, source })
    return { error: 'rate_limit', message: 'Trop de requêtes live — réessaie dans 1 minute.' }
  }

  const key = cacheKey(workspaceId, source, params)
  const cached = await cacheGet(key)
  if (cached) {
    logger.info({ event: 'live_cache_hit', workspaceId, source })
    return cached
  }

  const result = await fetchFn()
  if (result && !result.error) {
    await cacheSet(key, result)
  }
  return result
}

module.exports = { cachedQuery, cacheKey, cacheGet, cacheSet, throttleCheck }
