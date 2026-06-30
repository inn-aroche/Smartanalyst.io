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
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit doit être entre 1 et 100.'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset doit être >= 0.'),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const insights = await insightsService.listInsights(req.workspaceId, {
        status: req.query.status || 'open',
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      })
      res.json({ insights })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /insights/actions — board d'actions ━━━
// Statuts réels en DB (cf. migration 023) : proposed, todo, in_progress,
// done, archived. `dismissed` gardé en alias pour rétrocompatibilité
// (anciens clients) — mappé sur archived côté service.
router.get(
  '/actions',
  [
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    query('status')
      .optional()
      .isIn(['proposed', 'todo', 'in_progress', 'done', 'archived', 'dismissed', 'all']),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit doit être entre 1 et 100.'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset doit être >= 0.'),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const actions = await insightsService.listActions(req.workspaceId, {
        status: req.query.status,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      })
      res.json({ actions })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /insights/actions — création manuelle d'une tâche ━━━
// Source : 'manual' (UI quick-add) ou 'chat' (crochet d'action depuis
// une réponse de l'assistant, cahier §3 Lot 1). RLS reste strict
// (service_role only pour INSERT) : le serveur valide le workspace
// membership puis insère.
router.post(
  '/actions',
  [
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('title').isString().bail().trim().isLength({ min: 3, max: 200 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('priority').optional().isIn(['critical', 'high', 'medium', 'low']),
    body('impact').optional().isInt({ min: 1, max: 5 }),
    body('effort').optional().isInt({ min: 1, max: 5 }),
    body('confidence').optional().isInt({ min: 1, max: 5 }),
    body('insightId').optional({ nullable: true }).isUUID(),
    body('source').optional().isIn(['manual', 'chat']),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const created = await insightsService.createAction({
        workspaceId: req.workspaceId,
        userId: req.user?.id,
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority || 'medium',
        impact: req.body.impact,
        effort: req.body.effort,
        confidence: req.body.confidence,
        insightId: req.body.insightId || null,
        source: req.body.source || 'manual',
      })
      res.status(201).json(created)
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
// Pour status=snoozed, le client doit fournir snoozed_until (ISO 8601, futur).
router.patch(
  '/:id',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('status').isIn(['open', 'snoozed', 'resolved', 'dismissed']),
    body('snoozed_until').optional().isISO8601().withMessage('snoozed_until doit être ISO 8601.'),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const updated = await insightsService.updateInsightStatus(
        req.workspaceId,
        req.params.id,
        req.body.status,
        { snoozedUntil: req.body.snoozed_until || null },
      )
      res.json(updated)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ PATCH /insights/actions/:id — change le statut d'une tâche ━━━
// Cycle (brief V2 §3.4) : proposed → todo → done | archived
router.patch(
  '/actions/:id',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('status').isIn(['proposed', 'todo', 'in_progress', 'done', 'archived']),
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

// ━━━ POST /insights/actions/:id/email-brief ━━━
// Brief V2 §3.4 : envoie la tâche comme brief par email à un destinataire.
const taskEmailService = require('../services/insights/task-email.service')
router.post(
  '/actions/:id/email-brief',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('recipient').isEmail().withMessage('Destinataire email invalide.').normalizeEmail(),
    body('note').optional().isString().isLength({ max: 600 }),
    body('senderName').optional().isString().isLength({ max: 120 }),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const task = await insightsService.getActionById(req.workspaceId, req.params.id)
      const result = await taskEmailService.sendTaskBrief({
        workspaceId: req.workspaceId,
        userId: req.user?.id,
        task,
        recipient: req.body.recipient,
        note: req.body.note,
        senderName: req.body.senderName,
      })
      if (!result.ok) {
        return res.status(502).json({ error: { code: 'EMAIL_SEND_FAILED', message: result.error } })
      }
      res.json({ ok: true, messageId: result.id || null })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
