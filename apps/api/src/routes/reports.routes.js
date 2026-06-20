// Routes reports : /api/v1/reports/* (brief V2 §3.6).

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { requireFeature } = require('../middleware/quota-gate.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { NotFoundError } = require('../lib/error-handler')
const reportGenerator = require('../services/reports/report-generator.service')

const router = express.Router()
router.use(jwtMiddleware)

// ━━━ GET /reports — liste des rapports du workspace ━━━
router.get(
  '/',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const reports = await reportGenerator.listReports(req.workspaceId)
      res.json({ reports })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /reports/generate — génère un rapport à la demande ━━━
router.post(
  '/generate',
  [
    body('workspaceId').isUUID(),
    body('periodStart').isISO8601().toDate(),
    body('periodEnd').isISO8601().toDate(),
    body('kind').optional().isIn(['monthly', 'quarterly', 'custom']),
    body('title').optional().isString().isLength({ max: 200 }),
    body('whiteLabel').optional().isBoolean(),
    // Personnalisation : sources, segmentation, comparaison période N-1.
    body('sources').optional({ nullable: true }).isArray({ max: 10 }),
    body('sources.*').optional().isString().isLength({ min: 2, max: 40 }),
    body('segmentBy')
      .optional({ nullable: true, checkFalsy: false })
      .isIn(['source'])
      .withMessage('segmentBy must be "source" or null.'),
    body('compareToPreviousPeriod').optional().isBoolean(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  requireFeature('reports'),
  async (req, res, next) => {
    try {
      const fmt = (d) => new Date(d).toISOString().slice(0, 10)
      const result = await reportGenerator.generate({
        workspaceId: req.workspaceId,
        periodStart: fmt(req.body.periodStart),
        periodEnd: fmt(req.body.periodEnd),
        kind: req.body.kind || 'custom',
        title: req.body.title,
        whiteLabel: req.body.whiteLabel,
        userId: req.user?.id,
        sources: Array.isArray(req.body.sources) ? req.body.sources : undefined,
        segmentBy: req.body.segmentBy || null,
        compareToPreviousPeriod: !!req.body.compareToPreviousPeriod,
      })
      res.status(201).json({ id: result.id })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /reports/:id — récupère le HTML pour preview/iframe ━━━
router.get(
  '/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const report = await reportGenerator.getReportHtml(req.workspaceId, req.params.id)
      if (!report) throw new NotFoundError('Rapport introuvable.')
      res.json({
        id: report.id,
        title: report.title,
        status: report.status,
        html: report.html_content || null,
      })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /reports/:id ━━━
router.delete(
  '/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const r = await reportGenerator.deleteReport(req.workspaceId, req.params.id)
      res.json(r)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
