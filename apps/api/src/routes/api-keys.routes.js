// API keys routes — /api/v1/api-keys
//
// Cahier §3 Lot 4. CRUD minimal (create / list / revoke). Pas d'édition :
// pour renommer, l'user supprime et recrée — la doc d'usage déconseille de
// re-utiliser une clé révoquée donc autant l'interdire complètement.

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const apiKeys = require('../services/api-keys/api-keys.service')

const router = express.Router()
router.use(jwtMiddleware)

// ━━━ GET /api-keys — liste les clés d'un workspace ━━━
router.get(
  '/',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const keys = await apiKeys.listKeys(req.workspaceId)
      res.json({ keys })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /api-keys — crée une nouvelle clé ━━━
// La clé en clair n'est renvoyée QU'UNE FOIS dans la réponse à cet appel.
// L'user doit la copier immédiatement — ensuite seul le hash reste en base.
router.post(
  '/',
  [
    body('workspaceId').isUUID(),
    body('name').isString().bail().trim().isLength({ min: 1, max: 80 }),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const result = await apiKeys.createKey({
        workspaceId: req.workspaceId,
        userId: req.user?.id,
        name: req.body.name,
      })
      res.status(201).json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /api-keys/:id — révoque (soft delete) ━━━
router.delete(
  '/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const result = await apiKeys.revokeKey(req.workspaceId, req.params.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
