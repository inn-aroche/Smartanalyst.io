// Insights routes: /api/v1/insights/*
//
// Lecture des insights + action_cards générés par l'Insight Engine, et
// mise à jour de leur statut (snooze/resolve/dismiss, todo/done).
// La génération est faite par le job post-sync, pas par une route.

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const insightsService = require('../services/insights/insights.service')

const router = express.Router()

router.use(jwtMiddleware)

// ━━━ GET /insights — liste des insights (open par défaut) + actions ━━━
router.get(
  '/',
  [
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    query('status').optional().isIn(['open', 'snoozed', 'resolved', 'dismissed', 'all']),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const insights = await insightsService.listInsights(req.workspaceId, {
        status: req.query.status || 'open',
      })
      res.json({ insights })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /insights/actions — board d'actions ━━━
router.get(
  '/actions',
  [
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    query('status').optional().isIn(['todo', 'in_progress', 'done', 'dismissed', 'all']),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const actions = await insightsService.listActions(req.workspaceId, {
        status: req.query.status,
      })
      res.json({ actions })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /insights/:id/chart — points du graphe (résolus depuis canonical_metrics) ━━━
// Renvoie { chart } (ou { chart: null } si pas de chart_spec exploitable).
router.get(
  '/:id/chart',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const chart = await insightsService.getInsightChart(req.workspaceId, req.params.id)
      res.json({ chart })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ PATCH /insights/:id — change le statut d'un insight ━━━
router.patch(
  '/:id',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('status').isIn(['open', 'snoozed', 'resolved', 'dismissed']),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const updated = await insightsService.updateInsightStatus(
        req.workspaceId,
        req.params.id,
        req.body.status,
      )
      res.json(updated)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ PATCH /insights/actions/:id — change le statut d'une action ━━━
router.patch(
  '/actions/:id',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('status').isIn(['todo', 'in_progress', 'done', 'dismissed']),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const updated = await insightsService.updateActionStatus(
        req.workspaceId,
        req.params.id,
        req.body.status,
      )
      res.json(updated)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
