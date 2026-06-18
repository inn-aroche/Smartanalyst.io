// Health endpoints.
//
// Distinction Kubernetes-style (et standard cloud / uptime monitoring) :
//
//   GET /health
//     Liveness probe. "Le process Node respire-t-il ?". 200 inconditionnel
//     tant que l'event loop n'est pas bloqué. Pas de check de dépendances.
//     → Utilisé par les uptime monitors qui veulent un signal vert/rouge
//        binaire et léger (pas de spam DB/Redis).
//
//   GET /health/ready
//     Readiness probe. "Le service est-il en état de servir du trafic ?".
//     Check actif DB (Supabase) + Redis. 200 si toutes les deps sont OK,
//     503 sinon avec détail par check.
//     → Utilisé par les orchestrateurs (PM2 graceful reload, k8s, load
//        balancer) pour savoir si on peut router du trafic vers cette
//        instance. Le souci Hostinger Anti-DDoS d'aujourd'hui aurait été
//        trivial à diagnostiquer : /health/ready aurait montré "supabase: KO"
//        en 30 sec au lieu de 3h de debug.

const express = require('express')

const { getRedis } = require('../lib/redis')
const { getServiceRoleClient } = require('../lib/supabase')

const router = express.Router()

const CHECK_TIMEOUT_MS = 2000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms)),
  ])
}

async function checkRedis() {
  const startedAt = Date.now()
  try {
    const pong = await withTimeout(getRedis().ping(), CHECK_TIMEOUT_MS)
    return { ok: pong === 'PONG', durationMs: Date.now() - startedAt }
  } catch (err) {
    return { ok: false, durationMs: Date.now() - startedAt, error: err.message }
  }
}

async function checkDb() {
  const startedAt = Date.now()
  try {
    // HEAD request sur une table stable (seedée par migration 012).
    // Pas de transfert de data, juste un round-trip Postgrest → Postgres.
    const supabase = getServiceRoleClient()
    const { error } = await withTimeout(
      supabase.from('integration_providers').select('id', { head: true, count: 'exact' }),
      CHECK_TIMEOUT_MS,
    )
    if (error) {
      return { ok: false, durationMs: Date.now() - startedAt, error: error.message }
    }
    return { ok: true, durationMs: Date.now() - startedAt }
  } catch (err) {
    return { ok: false, durationMs: Date.now() - startedAt, error: err.message }
  }
}

// Check Gemini configuré (présence de la clé, pas un placeholder type "AIza<...>").
// On NE fait PAS d'appel réseau ici : un check Gemini coûterait un token à
// chaque /health/ready, et la lib Gemini n'a pas de "ping" endpoint. Une
// clé absente / placeholder = la cause #1 d'un chat KO au démarrage, ce
// qui justifie d'avoir un signal clair côté monitoring.
function checkGemini() {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return { ok: false, error: 'GEMINI_API_KEY missing' }
  }
  if (key.startsWith('AIza<') || key === 'placeholder') {
    return { ok: false, error: 'GEMINI_API_KEY is a placeholder' }
  }
  return { ok: true }
}

// Liveness — toujours 200 tant que l'event loop répond. Le format reste
// stable car des monitors externes le scrapent et pollueraient si on change.
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

// Readiness — 200 si toutes les deps répondent, 503 sinon avec détail.
router.get('/health/ready', async (req, res) => {
  const [redis, db] = await Promise.all([checkRedis(), checkDb()])
  const gemini = checkGemini()
  const allOk = redis.ok && db.ok && gemini.ok
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: { redis, db, gemini },
  })
})

module.exports = router
