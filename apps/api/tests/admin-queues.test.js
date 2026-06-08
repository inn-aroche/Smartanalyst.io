// Tests du router admin queues (apps/api/src/routes/admin-queues.routes.js).
//
// Vérifie :
//   - 503 si ADMIN_TOKEN pas configuré (fail-closed)
//   - 403 sans header X-Admin-Token (ou mauvais)
//   - 200 avec bon token sur GET /admin/queues
//   - 404 sur queue inconnue
//   - 200 sur GET /admin/queues/:name/stats avec counts + recentFailureCount
//   - 200 sur GET .../failed avec liste de jobs sérialisés
//   - 200 sur POST .../retry
//   - 404 sur retry d'un jobId inconnu

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')

const QUEUES_PATH = require.resolve('../src/queue-jobs/queues')
const DLQ_PATH = require.resolve('../src/lib/dlq')
const ROUTES_PATH = require.resolve('../src/routes/admin-queues.routes')

const VALID_TOKEN = 'a'.repeat(64) // ≥ 32 chars

function mockDeps({ jobsList = [], jobById = {}, recentFailureCount = 3 } = {}) {
  require.cache[QUEUES_PATH] = {
    id: QUEUES_PATH,
    filename: QUEUES_PATH,
    loaded: true,
    exports: {
      QUEUE_NAMES: {
        DATA_SYNC: 'data-sync',
        INSIGHTS: 'insights-generation',
        REPORTS: 'monthly-reports',
        ALERTS: 'alert-check',
      },
      JOB_NAMES: {},
      getQueue: () => ({
        getJobCounts: async () => ({
          waiting: 1,
          active: 0,
          completed: 42,
          failed: 2,
          delayed: 0,
          paused: 0,
        }),
        getFailed: async (start, end) => jobsList.slice(start, end + 1),
        getJob: async (id) => jobById[id] || null,
      }),
    },
  }
  require.cache[DLQ_PATH] = {
    id: DLQ_PATH,
    filename: DLQ_PATH,
    loaded: true,
    exports: {
      getRecentFailureCount: async () => recentFailureCount,
      listFailedJobs: async (q, limit) => {
        const jobs = await q.getFailed(0, Math.max(0, limit - 1))
        return jobs.map((j) => ({
          id: j.id,
          name: j.name,
          failedReason: j.failedReason,
          attemptsMade: j.attemptsMade,
        }))
      },
      retryFailedJob: async (q, jobId) => {
        const job = await q.getJob(jobId)
        if (!job) return { ok: false, error: 'job_not_found' }
        const state = await job.getState()
        if (state !== 'failed') return { ok: false, error: 'not_in_failed_state', state }
        await job.retry()
        return { ok: true, jobId, jobName: job.name }
      },
      removeFailedJob: async (q, jobId) => {
        const job = await q.getJob(jobId)
        if (!job) return { ok: false, error: 'job_not_found' }
        await job.remove()
        return { ok: true, jobId }
      },
      DEFAULT_WINDOW_SECONDS: 3600,
    },
  }
  delete require.cache[ROUTES_PATH]
}

async function withServer(envToken, opts, fn) {
  mockDeps(opts)
  const originalEnv = process.env.ADMIN_TOKEN
  if (envToken === undefined) {
    delete process.env.ADMIN_TOKEN
  } else {
    process.env.ADMIN_TOKEN = envToken
  }
  const router = require(ROUTES_PATH)
  const app = express()
  app.set('trust proxy', false)
  app.use(express.json())
  app.use(router)

  const server = http.createServer(app)
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  const { port } = server.address()
  try {
    await fn(port)
  } finally {
    await new Promise((res) => server.close(res))
    if (originalEnv === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = originalEnv
  }
}

async function req(port, path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Admin-Token'] = token
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { statusCode: res.status, body: json }
}

// ───────── Tests auth ─────────

test('503 si ADMIN_TOKEN pas configuré côté serveur (fail-closed)', async () => {
  await withServer(undefined, {}, async (port) => {
    const { statusCode, body } = await req(port, '/admin/queues', { token: 'whatever' })
    assert.equal(statusCode, 503)
    assert.equal(body.error, 'admin_disabled')
  })
})

test('503 si ADMIN_TOKEN trop court (< 32 chars)', async () => {
  await withServer('short', {}, async (port) => {
    const { statusCode } = await req(port, '/admin/queues', { token: 'short' })
    assert.equal(statusCode, 503)
  })
})

test('403 sans header X-Admin-Token', async () => {
  await withServer(VALID_TOKEN, {}, async (port) => {
    const { statusCode, body } = await req(port, '/admin/queues')
    assert.equal(statusCode, 403)
    assert.equal(body.error, 'forbidden')
  })
})

test('403 avec mauvais token', async () => {
  await withServer(VALID_TOKEN, {}, async (port) => {
    const { statusCode } = await req(port, '/admin/queues', { token: 'b'.repeat(64) })
    assert.equal(statusCode, 403)
  })
})

// ───────── Tests endpoints ─────────

test('200 sur GET /admin/queues avec bon token', async () => {
  await withServer(VALID_TOKEN, {}, async (port) => {
    const { statusCode, body } = await req(port, '/admin/queues', { token: VALID_TOKEN })
    assert.equal(statusCode, 200)
    assert.deepEqual(body.queues, [
      'data-sync',
      'insights-generation',
      'monthly-reports',
      'alert-check',
    ])
  })
})

test('404 sur queue inconnue', async () => {
  await withServer(VALID_TOKEN, {}, async (port) => {
    const { statusCode, body } = await req(port, '/admin/queues/ghost-queue/stats', {
      token: VALID_TOKEN,
    })
    assert.equal(statusCode, 404)
    assert.equal(body.error, 'unknown_queue')
  })
})

test('200 sur GET stats avec counts + recentFailureCount', async () => {
  await withServer(VALID_TOKEN, { recentFailureCount: 7 }, async (port) => {
    const { statusCode, body } = await req(port, '/admin/queues/data-sync/stats', {
      token: VALID_TOKEN,
    })
    assert.equal(statusCode, 200)
    assert.equal(body.queue, 'data-sync')
    assert.equal(body.counts.completed, 42)
    assert.equal(body.recentFailureCount, 7)
    assert.equal(body.recentWindowSeconds, 3600)
  })
})

test('200 sur GET /failed renvoie la liste sérialisée', async () => {
  const jobsList = [
    { id: 'a', name: 'sync', failedReason: 'oops', attemptsMade: 3 },
    { id: 'b', name: 'sync', failedReason: 'oops2', attemptsMade: 3 },
  ]
  await withServer(VALID_TOKEN, { jobsList }, async (port) => {
    const { statusCode, body } = await req(port, '/admin/queues/data-sync/failed?limit=10', {
      token: VALID_TOKEN,
    })
    assert.equal(statusCode, 200)
    assert.equal(body.count, 2)
    assert.equal(body.jobs[0].id, 'a')
  })
})

test('200 sur POST retry — délègue à BullMQ', async () => {
  let retried = false
  const job = {
    id: 'a',
    name: 'sync',
    getState: async () => 'failed',
    retry: async () => {
      retried = true
    },
  }
  await withServer(VALID_TOKEN, { jobById: { a: job } }, async (port) => {
    const { statusCode, body } = await req(
      port,
      '/admin/queues/data-sync/failed/a/retry',
      { method: 'POST', token: VALID_TOKEN },
    )
    assert.equal(statusCode, 200)
    assert.equal(body.ok, true)
    assert.equal(retried, true)
  })
})

test('404 sur retry d\'un jobId inconnu', async () => {
  await withServer(VALID_TOKEN, {}, async (port) => {
    const { statusCode, body } = await req(
      port,
      '/admin/queues/data-sync/failed/ghost/retry',
      { method: 'POST', token: VALID_TOKEN },
    )
    assert.equal(statusCode, 404)
    assert.equal(body.error, 'job_not_found')
  })
})
