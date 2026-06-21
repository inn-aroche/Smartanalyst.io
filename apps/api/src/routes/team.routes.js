// Team routes — /api/v1/team
//
// Cahier §3 Lot 4. Membres + invitations workspace. Le accept est un endpoint
// special : il prend juste le token (pas de workspaceId) car l'invitation
// porte deja le workspace_id.

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const team = require('../services/team/team.service')

const router = express.Router()
router.use(jwtMiddleware)

// ━━━ GET /team — liste membres + invitations en cours ━━━
router.get(
  '/',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const data = await team.listMembers(req.workspaceId)
      res.json(data)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /team/invite — invite un nouveau membre ━━━
router.post(
  '/invite',
  [
    body('workspaceId').isUUID(),
    body('email').isEmail().normalizeEmail(),
    body('role').optional().isIn(team.VALID_ROLES),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const result = await team.inviteMember(req.workspaceId, req.user.id, {
        email: req.body.email,
        role: req.body.role || 'editor',
      })
      res.status(201).json({ invitation: result })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /team/invitations/:id — revoke une invitation ━━━
router.delete(
  '/invitations/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const result = await team.revokeInvitation(req.workspaceId, req.params.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ PATCH /team/members/:id — change le role d'un membre ━━━
router.patch(
  '/members/:id',
  [param('id').isUUID(), body('workspaceId').isUUID(), body('role').isIn(team.VALID_ROLES)],
  runValidation,
  workspaceScope,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const result = await team.updateMemberRole(req.workspaceId, req.params.id, req.body.role)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /team/members/:id — retire un membre ━━━
router.delete(
  '/members/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const result = await team.removeMember(req.workspaceId, req.params.id, req.user.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /team/accept — accepte une invitation via token ━━━
// Le user doit etre auth (jwtMiddleware en haut). Pas de workspaceScope car
// le workspace est resolu via le token.
router.post(
  '/accept',
  [body('token').isString().bail().isLength({ min: 16, max: 128 })],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await team.acceptInvitation(req.body.token, req.user.id, req.user.email)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
