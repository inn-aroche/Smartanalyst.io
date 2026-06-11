// Admin waitlist endpoint — GET /admin/waitlist
//
// Protégé par X-Admin-Token (même token que /admin/queues). Permet de
// lister les inscriptions à la waitlist pour décider qui inviter à la
// beta. Pas d'UI pour le moment, consommation via curl + jq.
//
// IMPORTANT : monté sur /admin/waitlist dans app.js (voir le bug PR #40
// — `app.use(router)` sans path applique le middleware à toutes les
// routes de l'API).

const express = require('express')
const { requireAdminToken } = require('../middleware/admin-token.middleware')
const waitlistService = require('../services/waitlist/waitlist.service')

const router = express.Router()

router.use(requireAdminToken)

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500)
  const offset = parseInt(req.query.offset, 10) || 0
  const status = typeof req.query.status === 'string' ? req.query.status : null

  try {
    const result = await waitlistService.listSignups({ limit, offset, status })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'list_failed', message: err.message })
  }
})

module.exports = router
