// Routes pinned_widgets — /api/v1/pinned-widgets (cahier 22b §3.4).
//
// L'user appelle POST depuis ActionShelf (Pin), GET depuis BriefHome au
// render, DELETE depuis BriefHome (croix sur chaque widget).

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { requireFeature } = require('../middleware/quota-gate.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const pinnedWidgets = require('../services/pinned-widgets/pinned-widgets.service')

const router = express.Router()
router.use(jwtMiddleware)

router.get(
  '/',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const widgets = await pinnedWidgets.listWidgets(req.workspaceId)
      res.json({ widgets })
    } catch (err) {
      next(err)
    }
  },
)

// Cahier ADR-02 — Pin to dashboard est gate Pro (cf. 22b §5 — action shelf).
router.post(
  '/',
  [
    body('workspaceId').isUUID(),
    body('kind').isIn(['kpi', 'chart']),
    body('spec').isObject(),
    body('sourceMessageId').optional({ nullable: true }).isUUID(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  requireFeature('pin_to_dashboard'),
  async (req, res, next) => {
    try {
      const created = await pinnedWidgets.createWidget(req.workspaceId, req.user?.id, {
        kind: req.body.kind,
        spec: req.body.spec,
        sourceMessageId: req.body.sourceMessageId || null,
      })
      res.status(201).json({ widget: created })
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const r = await pinnedWidgets.deleteWidget(req.workspaceId, req.params.id)
      res.json(r)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
