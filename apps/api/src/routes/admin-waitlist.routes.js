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

// POST /admin/waitlist/:id/invite — envoie le welcome email beta et passe
// le signup en `invited`. Idempotent (déjà invité = no-op).
// Pas de body attendu. Format ID = UUID.
router.post('/:id/invite', async (req, res) => {
  const id = String(req.params.id || '')
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(id)) return res.status(400).json({ error: 'invalid_id' })

  try {
    const result = await waitlistService.inviteSignup(id)
    res.status(result.sent ? 200 : 200).json(result)
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'invite_failed', message: err.message })
  }
})

module.exports = router
