// Chat routes: /api/v1/chat/*

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { UserFacingError } = require('../lib/error-handler')
const chatService = require('../services/ai/chat.service')
const chatConversations = require('../services/ai/chat-conversations.service')

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
    // Mémoire de conversation (migration 031) : si fourni, on charge
    // l'historique du fil. Sinon on en crée un nouveau.
    body('conversationId').optional().isUUID().withMessage('conversationId invalide.'),
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
        conversationId: req.body.conversationId || null,
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
      // Erreurs LLM classifiées : le frontend pioche le bon i18n + affiche le
      // délai de retry quand on l'a.
      if (err && err.code === 'AI_RATE_LIMIT') {
        if (Number.isInteger(err.retryAfterSec)) {
          res.set('Retry-After', String(err.retryAfterSec))
        }
        return next(
          new UserFacingError("Trop de questions d'un coup, l'IA est saturée.", {
            statusCode: 429,
            code: 'AI_RATE_LIMIT',
          }),
        )
      }
      if (err && err.code === 'AI_TIMEOUT') {
        return next(
          new UserFacingError('La réponse a mis trop de temps. Réessaie.', {
            statusCode: 504,
            code: 'AI_TIMEOUT',
          }),
        )
      }
      if (err && err.code === 'AI_PROVIDER_DOWN') {
        return next(
          new UserFacingError("L'IA est temporairement indisponible. Réessaie dans une minute.", {
            statusCode: 503,
            code: 'AI_PROVIDER_DOWN',
          }),
        )
      }
      next(err)
    }
  },
)

// ─── Conversations (mémoire chat — migration 031) ───────────────────────

// Liste les fils de discussion du workspace (sidebar future + reprise
// auto au mount du chat).
router.get(
  '/conversations',
  jwtMiddleware,
  [query('workspaceId').isUUID().withMessage('workspaceId UUID requis.')],
  runValidation,
  async (req, res, next) => {
    try {
      const conversations = await chatConversations.listConversations(req.query.workspaceId, {
        limit: 50,
      })
      res.json({ conversations })
    } catch (err) {
      next(err)
    }
  },
)

// Détail d'un fil + ses messages, pour le rendre côté UI à la reprise.
router.get(
  '/conversations/:id',
  jwtMiddleware,
  [
    param('id').isUUID().withMessage('conversation id invalide.'),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const conversation = await chatConversations.getConversation(
        req.params.id,
        req.query.workspaceId,
      )
      if (!conversation) {
        return next(
          new UserFacingError('Conversation introuvable.', {
            statusCode: 404,
            code: 'CONVERSATION_NOT_FOUND',
          }),
        )
      }
      const messages = await chatConversations.listMessages(conversation.id)
      res.json({ conversation, messages })
    } catch (err) {
      next(err)
    }
  },
)

// Supprime un fil (cascade sur messages).
router.delete(
  '/conversations/:id',
  jwtMiddleware,
  [
    param('id').isUUID().withMessage('conversation id invalide.'),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await chatConversations.deleteConversation(
        req.params.id,
        req.query.workspaceId,
      )
      if (!result.deleted) {
        return next(
          new UserFacingError('Conversation introuvable.', {
            statusCode: 404,
            code: 'CONVERSATION_NOT_FOUND',
          }),
        )
      }
      res.json({ deleted: true })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
