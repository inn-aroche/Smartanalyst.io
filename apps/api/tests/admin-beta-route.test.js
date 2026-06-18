// Tests admin-beta.routes : auth X-Admin-Token + négociation Accept JSON/HTML.

const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const http = require('node:http')

const ROUTES_PATH = require.resolve('../src/routes/admin-beta.routes')
const STATS_PATH = require.resolve('../src/services/admin/beta-stats.service')

function loadRouter() {
  // Mock le service stats pour éviter de toucher Supabase dans ce test.
  require.cache[STATS_PATH] = {
    id: STATS_PATH,
    filename: STATS_PATH,
    loaded: true,
    exports: {
      getOverview: async () => ({
        generatedAt: '2026-06-15T20:00:00.000Z',
        totals: { workspaces: 3, last7d: 2, last30d: 3 },
        funnel: [
          { step: 'signed_up', count: 3, ratio: 100 },
          { step: 'connected_source', count: 2, ratio: 66.7 },
          { step: 'received_data', count: 1, ratio: 33.3 },
          { step: 'asked_chat', count: 0, ratio: 0 },
          { step: 'created_watch', count: 0, ratio: 0 },
          { step: 'got_insight', count: 0, ratio: 0 },
        ],
        activity: { askedLast24h: 0, askedLast7d: 0, chatActivityByDay: [] },
        topAiCosts: [
          {
            workspaceId: 'ws-expensive',
            costUsd: 1.23,
            tokens: 4000,
            calls: 5,
          },
        ],
        recentSignups: [
          {
            workspaceId: 'ws-1',
            workspaceName: 'Acme',
            email: 'a@a.com',
            orgName: 'Acme Co',
            createdAt: '2026-06-15T18:00:00.000Z',
          },
        ],
      }),
    },
  }
  delete require.cache[ROUTES_PATH]
  return require(ROUTES_PATH)
}

async function withServer(fn) {
  // ADMIN_TOKEN doit faire ≥ 32 chars (middleware le vérifie strictement).
  const previousToken = process.env.ADMIN_TOKEN
  process.env.ADMIN_TOKEN = 'a'.repeat(64)

  const router = loadRouter()
  const app = express()
  app.use(router)
  const server = http.createServer(app)
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  try {
    await fn(server.address().port)
  } finally {
    await new Promise((res) => server.close(res))
    if (previousToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = previousToken
  }
}

async function get(port, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/`, { headers })
  const text = await res.text()
  return { status: res.status, headers: res.headers, text }
}

test('GET sans X-Admin-Token → 403', async () => {
  await withServer(async (port) => {
    const r = await get(port)
    assert.equal(r.status, 403)
  })
})

test('GET avec token invalide → 403', async () => {
  await withServer(async (port) => {
    const r = await get(port, { 'X-Admin-Token': 'b'.repeat(64) })
    assert.equal(r.status, 403)
  })
})

test('GET sans Accept → JSON (par défaut)', async () => {
  await withServer(async (port) => {
    const r = await get(port, { 'X-Admin-Token': 'a'.repeat(64) })
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type') || '', /application\/json/)
    const body = JSON.parse(r.text)
    assert.equal(body.totals.workspaces, 3)
    assert.equal(body.funnel.length, 6)
    assert.equal(body.recentSignups.length, 1)
  })
})

test('GET Accept: text/html → HTML standalone', async () => {
  await withServer(async (port) => {
    const r = await get(port, {
      'X-Admin-Token': 'a'.repeat(64),
      Accept: 'text/html',
    })
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type') || '', /text\/html/)
    // Sanity-check : le HTML contient les valeurs réelles + le funnel.
    assert.match(r.text, /<!doctype html>/i)
    assert.match(r.text, /Total workspaces/)
    assert.match(r.text, />3</) // total workspaces
    assert.match(r.text, /Connecté/)
    assert.match(r.text, /ws-expensive/)
    assert.match(r.text, /Acme Co/)
  })
})

test('GET Accept: application/json prioritaire si client envoie les deux', async () => {
  await withServer(async (port) => {
    const r = await get(port, {
      'X-Admin-Token': 'a'.repeat(64),
      Accept: 'application/json, text/html;q=0.9',
    })
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type') || '', /application\/json/)
  })
})

test('GET échappe le HTML pour éviter une XSS via nom de workspace', async () => {
  // Recharge le router en injectant un nom malveillant.
  require.cache[STATS_PATH] = {
    id: STATS_PATH,
    filename: STATS_PATH,
    loaded: true,
    exports: {
      getOverview: async () => ({
        generatedAt: '2026-06-15T20:00:00.000Z',
        totals: { workspaces: 1, last7d: 1, last30d: 1 },
        funnel: [{ step: 'signed_up', count: 1, ratio: 100 }],
        activity: { askedLast24h: 0, askedLast7d: 0, chatActivityByDay: [] },
        topAiCosts: [],
        recentSignups: [
          {
            workspaceId: 'ws-evil',
            workspaceName: '<script>alert(1)</script>',
            email: 'evil@x.com',
            orgName: '<img onerror=alert(1) src=x>',
            createdAt: '2026-06-15T18:00:00.000Z',
          },
        ],
      }),
    },
  }
  delete require.cache[ROUTES_PATH]
  process.env.ADMIN_TOKEN = 'a'.repeat(64)
  const router = require(ROUTES_PATH)
  const app = express()
  app.use(router)
  const server = http.createServer(app)
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  try {
    const r = await get(server.address().port, {
      'X-Admin-Token': 'a'.repeat(64),
      Accept: 'text/html',
    })
    assert.equal(r.status, 200)
    // Les tags doivent être échappés, pas exécutables.
    assert.ok(!r.text.includes('<script>alert(1)</script>'))
    assert.ok(r.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
    assert.ok(!r.text.includes('<img onerror=alert(1) src=x>'))
  } finally {
    await new Promise((res) => server.close(res))
  }
})
