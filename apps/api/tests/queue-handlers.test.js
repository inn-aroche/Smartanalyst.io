// Tests des handlers de queues (logique pure, sans Redis).
// Mocks: workspace.service, connectors factory, supabase client.

process.env.LOG_LEVEL = 'fatal'

const { test, mock } = require('node:test')
const assert = require('node:assert/strict')

const workspaceService = require('../src/services/workspaces/workspace.service')
const syncHandler = require('../src/queue-jobs/handlers/sync.handler')
const reportsHandler = require('../src/queue-jobs/handlers/reports.handler')
const alertsHandler = require('../src/queue-jobs/handlers/alerts.handler')
const insightsHandler = require('../src/queue-jobs/handlers/insights.handler')

// ━━━ sync.handler ━━━

test('sync scanAllWorkspaces enqueues one job per active workspace', async () => {
  const restore = mock.method(workspaceService, 'listActive', async () => [
    { id: 'ws-1' },
    { id: 'ws-2' },
    { id: 'ws-3' },
  ])
  const added = []
  const fakeQueue = {
    add: async (name, data, opts) => {
      added.push({ name, data, opts })
    },
  }
  try {
    const result = await syncHandler.scanAllWorkspaces({ dataSyncQueue: fakeQueue })
    assert.equal(result.workspaceCount, 3)
    assert.equal(result.enqueued, 3)
    assert.equal(added.length, 3)
    assert.equal(added[0].name, 'sync-workspace')
    assert.equal(added[0].data.workspaceId, 'ws-1')
    // jobId stable contient le workspaceId + date du jour
    assert.match(added[0].opts.jobId, /^sync-workspace:ws-1:\d{4}-\d{2}-\d{2}$/)
  } finally {
    restore.mock.restore()
  }
})

test('sync scanAllWorkspaces handles zero workspaces', async () => {
  const restore = mock.method(workspaceService, 'listActive', async () => [])
  const fakeQueue = { add: async () => {} }
  try {
    const result = await syncHandler.scanAllWorkspaces({ dataSyncQueue: fakeQueue })
    assert.equal(result.workspaceCount, 0)
    assert.equal(result.enqueued, 0)
  } finally {
    restore.mock.restore()
  }
})

// ━━━ reports.handler ━━━

test('reports scanAllWorkspaces only enqueues workspaces eligible today', async () => {
  const today = new Date().getUTCDate()
  const otherDay = today === 1 ? 15 : 1

  const restore = mock.method(workspaceService, 'listActive', async () => [
    { id: 'ws-eligible-1', auto_send: true, report_day: today },
    { id: 'ws-eligible-2', auto_send: true, report_day: today },
    { id: 'ws-wrong-day', auto_send: true, report_day: otherDay },
    { id: 'ws-no-autosend', auto_send: false, report_day: today },
  ])
  const added = []
  const fakeQueue = {
    add: async (name, data, opts) => {
      added.push({ name, data, opts })
    },
  }
  try {
    const result = await reportsHandler.scanAllWorkspaces({ reportsQueue: fakeQueue })
    assert.equal(result.eligibleCount, 2)
    assert.equal(added.length, 2)
    assert.deepEqual(
      added.map((a) => a.data.workspaceId).sort(),
      ['ws-eligible-1', 'ws-eligible-2'],
    )
    // période YYYY-MM dans le jobId
    assert.match(added[0].opts.jobId, /^report:ws-eligible-1:\d{4}-\d{2}$/)
  } finally {
    restore.mock.restore()
  }
})

test('reports generateForWorkspace stub returns expected shape', async () => {
  const result = await reportsHandler.generateForWorkspace({
    data: { workspaceId: 'ws-1', period: '2025-05' },
  })
  assert.equal(result.workspaceId, 'ws-1')
  assert.equal(result.period, '2025-05')
  assert.equal(result.stub, true)
})

// ━━━ alerts.handler ━━━

test('alerts scanAllWorkspaces enqueues for every workspace', async () => {
  const restore = mock.method(workspaceService, 'listActive', async () => [
    { id: 'ws-1' },
    { id: 'ws-2' },
  ])
  const added = []
  const fakeQueue = { add: async (name, data, opts) => added.push({ name, data, opts }) }
  try {
    const result = await alertsHandler.scanAllWorkspaces({ alertsQueue: fakeQueue })
    assert.equal(result.workspaceCount, 2)
    assert.equal(added.length, 2)
    assert.equal(added[0].name, 'check-workspace')
  } finally {
    restore.mock.restore()
  }
})

test('alerts checkWorkspace stub returns expected shape', async () => {
  const result = await alertsHandler.checkWorkspace({ data: { workspaceId: 'ws-1' } })
  assert.equal(result.workspaceId, 'ws-1')
  assert.equal(result.stub, true)
  assert.equal(result.alertsTriggered, 0)
})

// ━━━ insights.handler ━━━

test('insights generateForWorkspace délègue au moteur et passe le résultat', async () => {
  const engine = require('../src/services/insights/insight-engine.service')
  const restore = mock.method(engine, 'generateForWorkspace', async () => ({
    generated: 2,
    dropped: 1,
    skipped: false,
  }))
  try {
    const result = await insightsHandler.generateForWorkspace({ data: { workspaceId: 'ws-1' } })
    assert.equal(result.workspaceId, 'ws-1')
    assert.equal(result.generated, 2)
    assert.equal(result.dropped, 1)
    assert.equal(result.skipped, false)
  } finally {
    restore.mock.restore()
  }
})

// ━━━ scheduler schedules sanity ━━━

test('scheduler exports schedules with valid cron patterns', () => {
  const { SCHEDULES } = require('../src/queue-jobs/scheduler')
  assert.equal(SCHEDULES.length, 6)
  for (const s of SCHEDULES) {
    assert.ok(s.queueName, 'queueName required')
    assert.ok(s.jobName, 'jobName required')
    assert.match(s.pattern, /^[\d*/\s,-]+$/, `Invalid cron pattern: ${s.pattern}`)
  }
})

// ━━━ queues module: known names ━━━

test('queues module exposes canonical names', () => {
  const { QUEUE_NAMES, JOB_NAMES } = require('../src/queue-jobs/queues')
  assert.deepEqual(Object.values(QUEUE_NAMES).sort(), [
    'alert-check',
    'data-sync',
    'insights-generation',
    'monthly-reports',
    'notifications',
    'oauth-refresh',
  ])
  assert.ok(JOB_NAMES.DATA_SYNC_SCAN)
  assert.ok(JOB_NAMES.DATA_SYNC_WORKSPACE)
  assert.ok(JOB_NAMES.INSIGHTS_WORKSPACE)
  assert.ok(JOB_NAMES.OAUTH_REFRESH_SCAN)
  assert.ok(JOB_NAMES.OAUTH_REFRESH_ONE)
})
