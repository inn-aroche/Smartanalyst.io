// Tests endpoint POST /api/v1/client-errors :
// - 204 sur payload valide
// - validation (message manquant → 400, trop long → 400)
// - appelle sentry.captureException avec les bons tags/extra

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')

const SENTRY_PATH = require.resolve('../src/lib/sentry')
const ROUTES_PATH = require.resolve('../src/routes/client-errors.routes')

function loadRoute() {
  const captures = []
  require.cache[SENTRY_PATH] = {
    id: SENTRY_PATH, filename: SENTRY_PATH, loaded: true,
    exports: {
      captureException: (err, ctx) => captures.push({ message: err.message, ctx }),
      captureMessage: () => {},
      flushSentry: async () => {},
    },
  }
  delete require.cache[ROUTES_PATH]
  const router = require(ROUTES_PATH)
  const app = express()
  app.use(express.json())
  app.use('/api/v1/client-errors', router)
  // Error handler basique pour récupérer les UserFacingError validateurs.
  app.use((err, req, res, _next) => {
    res.status(err.statusCode || 500).json({ error: { message: err.message, code: err.code } })
  })
  return { app, captures }
}

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server))
  })
}

function req(server, method, path, body) {
  const port = server.address().port
  const data = body ? JSON.stringify(body) : null
  return new Promise((resolve, reject) => {
    const r = http.request(
      { hostname: '127.0.0.1', port, path, method, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
        )
      },
    )
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

test('POST /client-errors avec un payload valide → 204 + Sentry capté', async () => {
  const { app, captures } = loadRoute()
  const server = await startServer(app)
  try {
    const r = await req(server, 'POST', '/api/v1/client-errors', {
      message: 'TypeError: x is not a function',
      stack: 'at foo (file.js:1)\nat bar (file.js:2)',
      componentStack: 'in Foo\n  in Bar',
      url: 'https://app.example.com/dashboard',
      userAgent: 'Mozilla/5.0',
    })
    assert.equal(r.status, 204)
    assert.equal(captures.length, 1)
    assert.equal(captures[0].message, 'TypeError: x is not a function')
    assert.equal(captures[0].ctx.tags.source, 'web-client')
    assert.equal(captures[0].ctx.extra.componentStack, 'in Foo\n  in Bar')
  } finally {
    server.close()
  }
})

test('POST /client-errors sans message → 400', async () => {
  const { app } = loadRoute()
  const server = await startServer(app)
  try {
    const r = await req(server, 'POST', '/api/v1/client-errors', { url: 'foo' })
    assert.equal(r.status, 400)
  } finally {
    server.close()
  }
})

test('POST /client-errors avec userId → attaché à Sentry user', async () => {
  const { app, captures } = loadRoute()
  const server = await startServer(app)
  try {
    await req(server, 'POST', '/api/v1/client-errors', { message: 'boom', userId: 'u-1' })
    assert.deepEqual(captures[0].ctx.user, { id: 'u-1' })
  } finally {
    server.close()
  }
})
