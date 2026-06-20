// Notifications routes : /api/v1/notifications/*
//
// Cahier §3 Lot 1 — Centre de notifications in-app.
// Endpoints :
//   GET   /                            liste pour le user/workspace
//   GET   /unread-count                count pour le badge cloche
//   POST  /:id/read                    marque une notif lue
//   POST  /mark-all-read               tout marquer lu

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const notifs = require('../services/notifications/notification-center.service')

const router = express.Router()
router.use(jwtMiddleware)

router.get(
  '/',
  [
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const items = await notifs.listForUser({
        workspaceId: req.workspaceId,
        userId: req.user.id,
        limit: Number(req.query.limit) || 30,
      })
      res.json({ notifications: items })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/unread-count',
  [query('workspaceId').isUUID().withMessage('workspaceId UUID requis.')],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const count = await notifs.unreadCount({
        workspaceId: req.workspaceId,
        userId: req.user.id,
      })
      res.json({ count })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id/read',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const ok = await notifs.markAsRead({
        notificationId: req.params.id,
        userId: req.user.id,
      })
      res.json({ ok })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/mark-all-read',
  [body('workspaceId').isUUID().withMessage('workspaceId UUID requis.')],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const count = await notifs.markAllAsRead({
        workspaceId: req.workspaceId,
        userId: req.user.id,
      })
      res.json({ marked: count })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
