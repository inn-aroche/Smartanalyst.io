// Tests des endpoints /health (liveness) et /health/ready (readiness).
//
// /health doit toujours répondre 200 (pas de check de deps).
// /health/ready doit refléter l'état réel de Redis + DB :
//   - tout OK   → 200 + {status: 'ready'}
//   - Redis KO  → 503 + checks.redis.ok = false
//   - DB KO     → 503 + checks.db.ok    = false

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')

const ROUTES_PATH = require.resolve('../src/routes/health.routes')
const REDIS_PATH = require.resolve('../src/lib/redis')
const SUPABASE_PATH = require.resolve('../src/lib/supabase')

function mockDeps({ redisOk, redisDelay, dbOk, dbDelay }) {
  require.cache[REDIS_PATH] = {
    id: REDIS_PATH,
    filename: REDIS_PATH,
    loaded: true,
    exports: {
      getRedis: () => ({
        ping: async () => {
          if (redisDelay) await new Promise((r) => setTimeout(r, redisDelay))
          if (!redisOk) throw new Error('redis down')
          return 'PONG'
        },
      }),
      closeRedis: async () => {},
    },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: () => ({
          select: async () => {
            if (dbDelay) await new Promise((r) => setTimeout(r, dbDelay))
            if (!dbOk) return { error: { message: 'supabase down' } }
            return { error: null, count: 1 }
          },
        }),
      }),
      getAnonClient: () => ({}),
      getUserScopedClient: () => ({}),
    },
  }
  // Force le module health.routes à re-require lib/redis et lib/supabase.
  delete require.cache[ROUTES_PATH]
}

async function withServer(opts, fn) {
  mockDeps({
    redisOk: opts.redisOk ?? true,
    redisDelay: opts.redisDelay ?? 0,
    dbOk: opts.dbOk ?? true,
    dbDelay: opts.dbDelay ?? 0,
  })
  const router = require(ROUTES_PATH)
  const app = express()
  app.use(router)

  const server = http.createServer(app)
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  const { port } = server.address()
  try {
    await fn(port)
  } finally {
    await new Promise((res) => server.close(res))
  }
}

async function getJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  const body = await res.json()
  return { statusCode: res.status, body }
}

test('/health renvoie 200 + JSON liveness', async () => {
  await withServer({}, async (port) => {
    const { statusCode, body } = await getJson(port, '/health')
    assert.equal(statusCode, 200)
    assert.equal(body.status, 'ok')
    assert.ok(typeof body.uptime === 'number')
    assert.ok(body.memory && typeof body.memory.rss === 'number')
  })
})

test('/health/ready renvoie 200 quand DB + Redis OK', async () => {
  await withServer({ redisOk: true, dbOk: true }, async (port) => {
    const { statusCode, body } = await getJson(port, '/health/ready')
    assert.equal(statusCode, 200)
    assert.equal(body.status, 'ready')
    assert.equal(body.checks.redis.ok, true)
    assert.equal(body.checks.db.ok, true)
  })
})

test('/health/ready renvoie 503 quand Redis KO', async () => {
  await withServer({ redisOk: false, dbOk: true }, async (port) => {
    const { statusCode, body } = await getJson(port, '/health/ready')
    assert.equal(statusCode, 503)
    assert.equal(body.status, 'not_ready')
    assert.equal(body.checks.redis.ok, false)
    assert.match(body.checks.redis.error, /redis down/)
    assert.equal(body.checks.db.ok, true)
  })
})

test('/health/ready renvoie 503 quand DB KO', async () => {
  await withServer({ redisOk: true, dbOk: false }, async (port) => {
    const { statusCode, body } = await getJson(port, '/health/ready')
    assert.equal(statusCode, 503)
    assert.equal(body.checks.db.ok, false)
    assert.match(body.checks.db.error, /supabase down/)
  })
})

test('/health/ready timeout si Redis tarde > 2s', async () => {
  await withServer({ redisOk: true, redisDelay: 2500, dbOk: true }, async (port) => {
    const { statusCode, body } = await getJson(port, '/health/ready')
    assert.equal(statusCode, 503)
    assert.equal(body.checks.redis.ok, false)
    assert.match(body.checks.redis.error, /timeout/)
  })
})
