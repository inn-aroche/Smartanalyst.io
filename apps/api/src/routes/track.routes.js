// Endpoint public d'ingestion des événements du tag /sa.js.
//
// Caractéristiques :
//   - Public (PAS de JWT) : le writeKey passé dans le body identifie le
//     workspace. Il est aujourd'hui = workspace_id (rotatable via une
//     colonne dédiée plus tard).
//   - Rate-limit propre (séparé du global) : on tolère beaucoup plus
//     d'events par IP que le reste de l'API (un site moyen peut générer
//     plusieurs req/seconde).
//   - CORS large (Access-Control-Allow-Origin: *) : le tag tourne sur
//     des sites tiers qu'on ne connaît pas à l'avance.
//   - Réponse 204 No Content immédiate, traitement async côté Redis.
//   - IP truncée et anonymisée AVANT toute écriture/publish.

const express = require('express')
const rateLimit = require('express-rate-limit')

const { getServiceRoleClient } = require('../lib/supabase')
const { logger } = require('../lib/logger')
const { sanitizeEvent, truncateIp } = require('../services/tracking/sanitize')
const ingestion = require('../services/tracking/ingestion.service')

const router = express.Router()

// Cache court (60s) des writeKeys valides pour éviter de taper la DB sur
// chaque event. Bypassable en cas de besoin admin.
const KEY_CACHE_MS = 60_000
const keyCache = new Map() // writeKey → { valid: bool, at: number }

async function isValidWriteKey(writeKey) {
  if (typeof writeKey !== 'string' || writeKey.length < 8) return false
  const cached = keyCache.get(writeKey)
  if (cached && Date.now() - cached.at < KEY_CACHE_MS) return cached.valid

  // Aujourd'hui writeKey = workspace_id. Match strict UUID v4.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(writeKey)) {
    keyCache.set(writeKey, { valid: false, at: Date.now() })
    return false
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', writeKey)
    .maybeSingle()
  const valid = !error && Boolean(data)
  keyCache.set(writeKey, { valid, at: Date.now() })
  return valid
}

// CORS large pour le endpoint d'ingestion (les sites clients sont inconnus
// d'avance). Réponse en pré-flight directe (cf POST Content-Type=application/json).
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

// Rate-limit dédié : large mais protège contre l'abus extrême.
// 600 events / minute / IP = 10/s. Bien au-delà d'un trafic normal.
const trackLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT' } },
})

router.post('/', trackLimiter, async (req, res) => {
  const body = req.body || {}
  const writeKey = body.wk
  const ev = body.ev

  // Validation rapide avant toute écriture
  const event = sanitizeEvent(ev)
  if (!event) return res.status(400).json({ error: { code: 'INVALID_PAYLOAD' } })

  const valid = await isValidWriteKey(writeKey).catch(() => false)
  if (!valid) return res.status(401).json({ error: { code: 'INVALID_WRITE_KEY' } })

  // Geo truncation (on n'a pas de GeoIP lib branchée pour l'instant — on
  // garde juste l'IP tronquée à des fins de debug, jamais stockée).
  const ip = req.ip || req.headers['x-forwarded-for'] || ''
  const truncated = truncateIp(String(ip).split(',')[0].trim())

  // Fire-and-forget — la réponse 204 sort indépendamment du publish.
  ingestion
    .publish(writeKey, event, { ipPrefix: truncated || undefined })
    .catch((err) =>
      logger.warn(
        { event: 'track_publish_async_failed', writeKey, error: err.message },
        'Async publish failed',
      ),
    )

  res.status(204).end()
})

module.exports = router
