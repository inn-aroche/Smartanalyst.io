// Notification settings: /api/v1/notification-settings
// Brief V2 §3.9 — réglages digest hebdo / alertes critiques par workspace.

const express = require('express')
const { body, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const settings = require('../services/notifications/settings.service')

const router = express.Router()
router.use(jwtMiddleware)

router.get(
  '/',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      res.json(await settings.getSettings(req.workspaceId))
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/',
  [
    body('workspaceId').isUUID(),
    body('weekly_digest').optional().isBoolean(),
    body('critical_alerts').optional().isBoolean(),
    body('email_override').optional({ nullable: true }).isString().isLength({ max: 200 }),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const updated = await settings.updateSettings(req.workspaceId, {
        weekly_digest: req.body.weekly_digest,
        critical_alerts: req.body.critical_alerts,
        email_override: req.body.email_override,
      })
      res.json(updated)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
