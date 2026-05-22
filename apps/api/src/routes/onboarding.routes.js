// Onboarding routes: /api/v1/onboarding/*
// Source: docs/08_API_ONBOARDING.md

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const onboardingService = require('../services/onboarding/onboarding.service')

const router = express.Router()

router.use(jwtMiddleware)

// Rate limit /analyze: scrape Playwright = coûteux. 20 par user / heure.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    error: {
      code: 'RATE_LIMIT',
      message: "Trop d'analyses. Réessaie dans une heure.",
    },
  },
})

// ━━━ POST /analyze — scrape + AI ━━━
router.post(
  '/analyze',
  analyzeLimiter,
  [
    body('url')
      .exists({ checkFalsy: true })
      .withMessage('URL requise.')
      .bail()
      .isString()
      .withMessage('URL invalide.')
      .bail()
      .trim()
      .isURL({ require_protocol: true, protocols: ['http', 'https'] })
      .withMessage('URL invalide (doit commencer par http:// ou https://).'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await onboardingService.analyzeUrl(req.body.url)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /profile — sauvegarde du profil confirmé ━━━
router.post(
  '/profile',
  [
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('url')
      .isURL({ require_protocol: true, protocols: ['http', 'https'] })
      .withMessage('URL invalide.'),
    body('sector').isString().notEmpty().withMessage('sector requis.'),
    body('market').isString().notEmpty().withMessage('market requis.'),
    body('brand_keywords').optional().isArray(),
    body('description').optional().isString(),
    body('detected_tools').optional().isObject(),
    body('confidence_score').optional().isInt({ min: 0, max: 100 }),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const profile = await onboardingService.saveProfile({
        workspaceId: req.workspaceId,
        url: req.body.url,
        sector: req.body.sector,
        market: req.body.market,
        brand_keywords: req.body.brand_keywords,
        description: req.body.description,
        detected_tools: req.body.detected_tools,
        confidence_score: req.body.confidence_score,
      })
      res.status(201).json({ profile })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
