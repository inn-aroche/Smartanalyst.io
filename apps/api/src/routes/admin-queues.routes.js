// Admin queues router — observabilité et contrôle des queues BullMQ.
//
// Endpoints (tous protégés par X-Admin-Token, monté sur /admin/queues
// dans app.js — les routes ci-dessous sont relatives) :
//   GET    /                          - liste des queues
//   GET    /:name/stats               - counts par état
//   GET    /:name/failed?limit=20     - jobs en DLQ
//   POST   /:name/failed/:jobId/retry  - re-enqueue
//   POST   /:name/failed/:jobId/remove - delete
//
// IMPORTANT : monter ce router via app.use('/admin/queues', router). Sinon
// le middleware requireAdminToken s'applique à TOUTES les requêtes de l'API
// (régression vécue en prod le 08/06/2026 — auth users cassée).
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

router.get('/', (req, res) => {
  res.json({ queues: ALLOWED_QUEUE_NAMES })
})

router.get('/:name/stats', async (req, res) => {
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

router.get('/:name/failed', async (req, res) => {
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

router.post('/:name/failed/:jobId/retry', async (req, res) => {
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

router.post('/:name/failed/:jobId/remove', async (req, res) => {
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
