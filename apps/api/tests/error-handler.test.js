// Tests du middleware errorHandler — focus sur l'enrichissement Sentry
// (workspaceId + requestId) et la propagation du requestId dans la réponse.

const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const http = require('node:http')

const SENTRY_PATH = require.resolve('../src/lib/sentry')
const HANDLER_PATH = require.resolve('../src/middleware/error-handler.middleware')
const { UserFacingError } = require('../src/lib/error-handler')

function loadWithMockSentry() {
  const captured = []
  require.cache[SENTRY_PATH] = {
    id: SENTRY_PATH,
    filename: SENTRY_PATH,
    loaded: true,
    exports: {
      captureException: (err, ctx) => captured.push({ err, ctx }),
      captureMessage: () => {},
      flush: async () => {},
      enabled: true,
    },
  }
  delete require.cache[HANDLER_PATH]
  const { errorHandler } = require(HANDLER_PATH)
  return { errorHandler, captured }
}

function buildApp(errorHandler, route) {
  const app = express()
  app.use(express.json())
  // Pose un requestId pour simuler le middleware en prod
  app.use((req, res, next) => {
    req.requestId = 'test-req-id-aaaa-1111'
    next()
  })
  route(app)
  app.use(errorHandler)
  return app
}

async function withServer(app, fn) {
  const server = http.createServer(app)
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  try {
    await fn(server.address().port)
  } finally {
    await new Promise((res) => server.close(res))
  }
}

async function request(port, { method = 'POST', path, body, headers } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json() }
}

test('errorHandler : UserFacingError renvoie le code + requestId dans la réponse', async () => {
  const { errorHandler, captured } = loadWithMockSentry()
  const app = buildApp(errorHandler, (a) => {
    a.post('/boom', (req, res, next) => {
      next(new UserFacingError('nope', { statusCode: 400, code: 'NOPE' }))
    })
  })
  await withServer(app, async (port) => {
    const { status, body } = await request(port, { path: '/boom', body: {} })
    assert.equal(status, 400)
    assert.equal(body.error.code, 'NOPE')
    assert.equal(body.error.message, 'nope')
    assert.equal(body.error.requestId, 'test-req-id-aaaa-1111')
    // UserFacingError n'est PAS envoyé à Sentry (c'est attendu — c'est une
    // erreur côté user, pas un bug serveur).
    assert.equal(captured.length, 0)
  })
})

test('errorHandler : 500 inattendu → Sentry avec workspace_id + request_id tags', async () => {
  const { errorHandler, captured } = loadWithMockSentry()
  const app = buildApp(errorHandler, (a) => {
    a.post('/crash', (req, res, next) => {
      next(new Error('kaboom'))
    })
  })
  await withServer(app, async (port) => {
    const { status, body } = await request(port, {
      path: '/crash',
      body: { workspaceId: 'ws-xyz', other: 'data' },
    })
    assert.equal(status, 500)
    assert.equal(body.error.code, 'INTERNAL_ERROR')
    assert.equal(body.error.requestId, 'test-req-id-aaaa-1111')
    assert.equal(captured.length, 1)
    const { ctx } = captured[0]
    assert.equal(ctx.tags.workspace_id, 'ws-xyz')
    assert.equal(ctx.tags.request_id, 'test-req-id-aaaa-1111')
    assert.match(ctx.tags.route, /POST \/crash/)
    assert.equal(ctx.extra.workspaceId, 'ws-xyz')
    assert.equal(ctx.extra.requestId, 'test-req-id-aaaa-1111')
  })
})

test('errorHandler : workspaceId pioché depuis query string si pas dans body', async () => {
  const { errorHandler, captured } = loadWithMockSentry()
  const app = buildApp(errorHandler, (a) => {
    a.get('/crash', (req, res, next) => {
      next(new Error('boom'))
    })
  })
  await withServer(app, async (port) => {
    await request(port, { method: 'GET', path: '/crash?workspaceId=ws-from-query' })
    assert.equal(captured[0].ctx.tags.workspace_id, 'ws-from-query')
  })
})

test('errorHandler : tag workspace_id = "none" si vraiment absent', async () => {
  const { errorHandler, captured } = loadWithMockSentry()
  const app = buildApp(errorHandler, (a) => {
    a.post('/crash', (req, res, next) => {
      next(new Error('boom'))
    })
  })
  await withServer(app, async (port) => {
    await request(port, { path: '/crash', body: {} })
    assert.equal(captured[0].ctx.tags.workspace_id, 'none')
  })
})
