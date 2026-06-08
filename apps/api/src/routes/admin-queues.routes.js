// Admin queues router — observabilité et contrôle des queues BullMQ.
//
// Endpoints (tous protégés par X-Admin-Token) :
//   GET    /admin/queues                          - liste des queues
//   GET    /admin/queues/:name/stats              - counts par état
//   GET    /admin/queues/:name/failed?limit=20    - jobs en DLQ
//   POST   /admin/queues/:name/failed/:jobId/retry  - re-enqueue
//   POST   /admin/queues/:name/failed/:jobId/remove - delete
//
// Pas d'UI : ces endpoints sont consommés manuellement (curl) ou par un
// dashboard ops externe. Pour V2 on pourra ajouter une page bull-board.

const express = require('express')
const { QUEUE_NAMES, getQueue } = require('../queue-jobs/queues')
const { requireAdminToken } = require('../middleware/admin-token.middleware')
const {
  getRecentFailureCount,
  listFailedJobs,
  retryFailedJob,
  removeFailedJob,
  DEFAULT_WINDOW_SECONDS,
} = require('../lib/dlq')

const router = express.Router()
const ALLOWED_QUEUE_NAMES = Object.values(QUEUE_NAMES)

router.use(requireAdminToken)

router.get('/admin/queues', (req, res) => {
  res.json({ queues: ALLOWED_QUEUE_NAMES })
})

router.get('/admin/queues/:name/stats', async (req, res) => {
  const { name } = req.params
  if (!ALLOWED_QUEUE_NAMES.includes(name)) {
    return res.status(404).json({ error: 'unknown_queue' })
  }
  try {
    const queue = getQueue(name)
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    )
    const recentFailureCount = await getRecentFailureCount(name)
    res.json({
      queue: name,
      counts,
      recentFailureCount,
      recentWindowSeconds: DEFAULT_WINDOW_SECONDS,
    })
  } catch (err) {
    res.status(500).json({ error: 'stats_failed', message: err.message })
  }
})

router.get('/admin/queues/:name/failed', async (req, res) => {
  const { name } = req.params
  if (!ALLOWED_QUEUE_NAMES.includes(name)) {
    return res.status(404).json({ error: 'unknown_queue' })
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100)
  try {
    const queue = getQueue(name)
    const jobs = await listFailedJobs(queue, limit)
    res.json({ queue: name, count: jobs.length, jobs })
  } catch (err) {
    res.status(500).json({ error: 'list_failed', message: err.message })
  }
})

router.post('/admin/queues/:name/failed/:jobId/retry', async (req, res) => {
  const { name, jobId } = req.params
  if (!ALLOWED_QUEUE_NAMES.includes(name)) {
    return res.status(404).json({ error: 'unknown_queue' })
  }
  try {
    const queue = getQueue(name)
    const result = await retryFailedJob(queue, jobId)
    if (!result.ok) return res.status(404).json(result)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'retry_failed', message: err.message })
  }
})

router.post('/admin/queues/:name/failed/:jobId/remove', async (req, res) => {
  const { name, jobId } = req.params
  if (!ALLOWED_QUEUE_NAMES.includes(name)) {
    return res.status(404).json({ error: 'unknown_queue' })
  }
  try {
    const queue = getQueue(name)
    const result = await removeFailedJob(queue, jobId)
    if (!result.ok) return res.status(404).json(result)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'remove_failed', message: err.message })
  }
})

module.exports = router
