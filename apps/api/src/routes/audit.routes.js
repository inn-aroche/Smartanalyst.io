// Audit routes: /api/v1/audit/*
//
// M4 Phase D Part 1 — SEO analyzer only (GEO/Perf/AI score à venir dans
// les PRs suivantes). POST synchrone qui renvoie l'audit complet (~5-8 s).

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const auditService = require('../services/audit/audit.service')

const router = express.Router()

router.use(jwtMiddleware)
router.use(workspaceScope)

// ─── POST /audit ─────────────────────────────────────────────────
// Body: { url }
// Renvoie l'audit complet une fois exécuté (~5-8 s).
router.post(
  '/',
  body('url')
    .isString()
    .trim()
    .isLength({ min: 4, max: 2048 })
    .withMessage('URL requise (4-2048 caractères)'),
  runValidation,
  async (req, res, next) => {
    try {
      const audit = await auditService.runAudit({
        workspaceId: req.workspaceId,
        userId: req.user.id,
        url: req.body.url,
      })
      res.status(201).json(audit)
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /audit ──────────────────────────────────────────────────
// Liste les N derniers audits du workspace (résumé seulement, pas le JSONB).
router.get(
  '/',
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  runValidation,
  async (req, res, next) => {
    try {
      const audits = await auditService.listAudits({
        workspaceId: req.workspaceId,
        limit: req.query.limit ?? 20,
      })
      res.json(audits)
    } catch (err) {
      next(err)
    }
  },
)

// ─── GET /audit/:id ──────────────────────────────────────────────
// Renvoie un audit complet (avec le JSONB des findings).
router.get(
  '/:id',
  param('id').isUUID().withMessage('id doit être un UUID'),
  runValidation,
  async (req, res, next) => {
    try {
      const audit = await auditService.getAudit({
        workspaceId: req.workspaceId,
        auditId: req.params.id,
      })
      res.json(audit)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
