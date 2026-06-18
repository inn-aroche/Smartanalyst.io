// Chat routes: /api/v1/chat/*

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { UserFacingError } = require('../lib/error-handler')
const chatService = require('../services/ai/chat.service')

const router = express.Router()

// Per-IP throttle so a runaway client can't burn through the Gemini quota.
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT',
      message: 'Trop de questions. Attends une minute.',
    },
  },
})

router.post(
  '/ask',
  jwtMiddleware,
  askLimiter,
  [
    body('message')
      .isString()
      .withMessage('Le message doit être du texte.')
      .bail()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Le message doit faire entre 1 et 2000 caractères.'),
    body('workspaceId').optional().isUUID().withMessage('workspaceId invalide.'),
    body('locale').optional().isIn(['fr', 'en']).withMessage('locale doit être fr ou en.'),
    // Multimodal (brief V2 §3.2) : référence des fichiers de la librairie.
    body('fileIds').optional().isArray({ max: 4 }).withMessage('fileIds: 4 max.'),
    body('fileIds.*').optional().isUUID().withMessage('fileId invalide.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await chatService.ask({
        userId: req.user.id,
        workspaceId: req.body.workspaceId,
        message: req.body.message,
        locale: req.body.locale || 'fr',
        fileIds: req.body.fileIds || [],
      })
      res.json(result)
    } catch (err) {
      // Surface a friendly message if Gemini isn't configured (placeholder key).
      if (err && err.code === 'GEMINI_NOT_CONFIGURED') {
        return next(
          new UserFacingError(
            'Le chat IA n’est pas encore configuré côté serveur. Contacte le support.',
            { statusCode: 503, code: 'AI_NOT_CONFIGURED' },
          ),
        )
      }
      // Hard-stop budget : workspace a dépassé son quota mensuel de tokens.
      if (err && err.code === 'AI_BUDGET_EXCEEDED') {
        return next(
          new UserFacingError(
            'Ton budget IA mensuel est atteint. Augmente-le dans Réglages ou attends le 1ᵉʳ du mois.',
            { statusCode: 402, code: 'AI_BUDGET_EXCEEDED' },
          ),
        )
      }
      next(err)
    }
  },
)

module.exports = router
