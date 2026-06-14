// Routes watches : /api/v1/watches/* (brief V2 §3.3, WatchModal).

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const watchesService = require('../services/watches/watches.service')

const router = express.Router()
router.use(jwtMiddleware)

// ━━━ GET /watches — liste les alertes du workspace ━━━
router.get(
  '/',
  [query('workspaceId').isUUID().withMessage('workspaceId UUID requis.')],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const watches = await watchesService.listWatches(req.workspaceId)
      res.json({ watches })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /watches — crée une nouvelle alerte ━━━
router.post(
  '/',
  [
    body('workspaceId').isUUID(),
    body('description').isString().isLength({ min: 3, max: 280 }),
    body('metric_key').isString().isLength({ min: 3, max: 80 }),
    body('source').optional({ nullable: true }).isString().isLength({ max: 40 }),
    body('operator').isIn(['drops_below', 'rises_above', 'changes_by_pct', 'any_change']),
    body('threshold').optional({ nullable: true }).isFloat(),
    body('notify_in_app').optional().isBoolean(),
    body('notify_email').optional().isBoolean(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const watch = await watchesService.createWatch(req.workspaceId, req.user?.id, req.body)
      res.status(201).json({ watch })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ PATCH /watches/:id — toggle enabled / change canaux ━━━
router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('workspaceId').isUUID(),
    body('enabled').optional().isBoolean(),
    body('notify_in_app').optional().isBoolean(),
    body('notify_email').optional().isBoolean(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const watch = await watchesService.patchWatch(req.workspaceId, req.params.id, req.body)
      res.json({ watch })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /watches/:id ━━━
router.delete(
  '/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const r = await watchesService.deleteWatch(req.workspaceId, req.params.id)
      res.json(r)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
