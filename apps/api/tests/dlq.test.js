// Tests du helper DLQ (apps/api/src/lib/dlq.js).
//
// On mock :
//   - Redis (multi/zadd/zcard/zremrangebyscore/expire/exec) via stub minimal
//   - Sentry (captureException, captureMessage) via stub qui mémorise les calls
// Pour valider que :
//   - recordFinalFailure increment le compteur et appelle captureException
//   - Quand le seuil BURST_THRESHOLD est dépassé, captureMessage est appelé
//     avec tag alert=dlq_burst
//   - listFailedJobs / retryFailedJob / removeFailedJob délèguent à BullMQ
//     correctement et gèrent le cas job introuvable

const test = require('node:test')
const assert = require('node:assert/strict')

const REDIS_PATH = require.resolve('../src/lib/redis')
const SENTRY_PATH = require.resolve('../src/lib/sentry')
const DLQ_PATH = require.resolve('../src/lib/dlq')

// ───────── Stubs partagés ─────────

function freshDlq({ initialCount = 0 } = {}) {
  const sentryCalls = { captureException: [], captureMessage: [] }
  const redisCalls = { zadd: [], zcard: [], zremrangebyscore: [], expire: [] }
  let currentCount = initialCount

  require.cache[SENTRY_PATH] = {
    id: SENTRY_PATH,
    filename: SENTRY_PATH,
    loaded: true,
    exports: {
      enabled: true,
      Sentry: {},
      captureException: (err, ctx) => sentryCalls.captureException.push({ err, ctx }),
      captureMessage: (msg, level, ctx) =>
        sentryCalls.captureMessage.push({ msg, level, ctx }),
      flush: async () => {},
    },
  }

  // Mock Redis avec un multi() chainable + zcard qui renvoie currentCount.
  const multiObj = {
    zadd(key, score, member) {
      redisCalls.zadd.push({ key, score, member })
      currentCount += 1
      return multiObj
    },
    zremrangebyscore(key, min, max) {
      redisCalls.zremrangebyscore.push({ key, min, max })
      return multiObj
    },
    expire(key, ttl) {
      redisCalls.expire.push({ key, ttl })
      return multiObj
    },
    async exec() {
      return []
    },
  }

  require.cache[REDIS_PATH] = {
    id: REDIS_PATH,
    filename: REDIS_PATH,
    loaded: true,
    exports: {
      getRedis: () => ({
        multi: () => multiObj,
        zcard: async (key) => {
          redisCalls.zcard.push({ key })
          return currentCount
        },
        zremrangebyscore: async (key, min, max) => {
          redisCalls.zremrangebyscore.push({ key, min, max })
          return 0
        },
      }),
      closeRedis: async () => {},
    },
  }

  delete require.cache[DLQ_PATH]
  return { dlq: require(DLQ_PATH), sentryCalls, redisCalls }
}

// ───────── Tests recordFinalFailure ─────────

test('recordFinalFailure appelle captureException avec tags business', async () => {
  const { dlq, sentryCalls } = freshDlq({ initialCount: 0 })
  const err = new Error('stripe sync exploded')
  await dlq.recordFinalFailure({
    queueName: 'data-sync',
    jobName: 'sync-workspace',
    jobId: 'job-42',
    error: err,
    jobData: { workspaceId: 'ws-1' },
    attemptsMade: 3,
  })

  assert.equal(sentryCalls.captureException.length, 1)
  const [call] = sentryCalls.captureException
  assert.equal(call.err, err)
  assert.equal(call.ctx.tags.queue, 'data-sync')
  assert.equal(call.ctx.tags.jobName, 'sync-workspace')
  assert.equal(call.ctx.tags.kind, 'job_final_failure')
  assert.equal(call.ctx.tags.service, 'worker')
  assert.equal(call.ctx.extra.jobId, 'job-42')
  assert.equal(call.ctx.extra.attemptsMade, 3)
})

test('recordFinalFailure NE déclenche PAS captureMessage si sous le seuil', async () => {
  const { dlq, sentryCalls } = freshDlq({ initialCount: 0 })
  // 5 fails consécutifs (sous seuil 10)
  for (let i = 0; i < 5; i++) {
    await dlq.recordFinalFailure({
      queueName: 'data-sync',
      jobName: 'sync-workspace',
      jobId: `job-${i}`,
      error: new Error('boom'),
    })
  }
  // captureException = 5 (un par fail), captureMessage = 0 (pas de burst)
  assert.equal(sentryCalls.captureException.length, 5)
  assert.equal(sentryCalls.captureMessage.length, 0)
})

test('recordFinalFailure déclenche captureMessage quand seuil burst dépassé', async () => {
  // Seed à BURST_THRESHOLD-1 → le prochain fail déclenche le burst.
  const { dlq, sentryCalls } = freshDlq({ initialCount: dlqThresholdMinusOne() })
  await dlq.recordFinalFailure({
    queueName: 'monthly-reports',
    jobName: 'generate-workspace',
    jobId: 'last-straw',
    error: new Error('pdf generation timeout'),
  })

  assert.equal(sentryCalls.captureException.length, 1)
  assert.equal(sentryCalls.captureMessage.length, 1)
  const burst = sentryCalls.captureMessage[0]
  assert.match(burst.msg, /DLQ burst/i)
  assert.equal(burst.level, 'error')
  assert.equal(burst.ctx.tags.alert, 'dlq_burst')
  assert.equal(burst.ctx.tags.queue, 'monthly-reports')
})

function dlqThresholdMinusOne() {
  // Lit la constante exportée pour ne pas hardcoder.
  const { BURST_THRESHOLD } = require(DLQ_PATH)
  return BURST_THRESHOLD - 1
}

// ───────── Tests list/retry/remove (mocks BullMQ Queue) ─────────

function fakeJob(id, name, state = 'failed') {
  return {
    id,
    name,
    data: { foo: 'bar' },
    failedReason: 'something broke',
    attemptsMade: 3,
    timestamp: 1700000000000,
    finishedOn: 1700000001000,
    stacktrace: ['Error: a', 'at b', 'at c', 'at d'],
    getState: async () => state,
    retry: async () => {},
    remove: async () => {},
  }
}

function fakeQueue({ jobs = [], jobById = {} } = {}) {
  return {
    getFailed: async (start, end) => jobs.slice(start, end + 1),
    getJob: async (id) => jobById[id] || null,
  }
}

test('listFailedJobs sérialise les jobs BullMQ (max stacktrace 3 lignes)', async () => {
  const { dlq } = freshDlq()
  const jobs = [fakeJob('a', 'x'), fakeJob('b', 'y'), fakeJob('c', 'z')]
  const result = await dlq.listFailedJobs(fakeQueue({ jobs }), 10)
  assert.equal(result.length, 3)
  assert.equal(result[0].id, 'a')
  assert.equal(result[0].stacktrace.length, 3)
  assert.equal(result[0].failedReason, 'something broke')
})

test('retryFailedJob renvoie ok=true et appelle job.retry()', async () => {
  const { dlq } = freshDlq()
  let retried = false
  const job = fakeJob('a', 'x', 'failed')
  job.retry = async () => {
    retried = true
  }
  const result = await dlq.retryFailedJob(fakeQueue({ jobById: { a: job } }), 'a')
  assert.equal(result.ok, true)
  assert.equal(result.jobId, 'a')
  assert.equal(retried, true)
})

test('retryFailedJob renvoie job_not_found si jobId inconnu', async () => {
  const { dlq } = freshDlq()
  const result = await dlq.retryFailedJob(fakeQueue({}), 'ghost')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'job_not_found')
})

test('retryFailedJob refuse si job pas en state failed', async () => {
  const { dlq } = freshDlq()
  const job = fakeJob('a', 'x', 'active')
  const result = await dlq.retryFailedJob(fakeQueue({ jobById: { a: job } }), 'a')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'not_in_failed_state')
  assert.equal(result.state, 'active')
})

test('removeFailedJob appelle job.remove() et renvoie ok=true', async () => {
  const { dlq } = freshDlq()
  let removed = false
  const job = fakeJob('a', 'x')
  job.remove = async () => {
    removed = true
  }
  const result = await dlq.removeFailedJob(fakeQueue({ jobById: { a: job } }), 'a')
  assert.equal(result.ok, true)
  assert.equal(removed, true)
})
