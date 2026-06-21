// Chat routes: /api/v1/chat/*

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { UserFacingError } = require('../lib/error-handler')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { requireFeature } = require('../middleware/quota-gate.middleware')
const chatService = require('../services/ai/chat.service')
const chatConversations = require('../services/ai/chat-conversations.service')
const chatExport = require('../services/ai/chat-export.service')
const chatPptx = require('../services/ai/chat-pptx.service')

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
    // `nullable: true` : le frontend peut envoyer `null` explicite au 1er
    // tour (avant qu'un fil ait été créé). Sans ce flag, express-validator
    // appellerait isUUID() sur null et rejetterait.
    body('conversationId')
      .optional({ nullable: true, checkFalsy: false })
      .isUUID()
      .withMessage('conversationId invalide.'),
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

// ─── Streaming (SSE) — cahier §3 Lot 1 ──────────────────────────────────
//
// Même contrat d'entrée que /ask, mais réponse en text/event-stream :
//   - meta  : { conversationId }
//   - delta : { text }   répétés au fur et à mesure
//   - done  : { answer, model, sources, highlights, conversationId }
//   - error : { code, message }   (statut HTTP toujours 200 car SSE déjà
//             commencé ; le client lit error.code pour mapper l'i18n)
//
// Note : pas de gestion du Last-Event-ID / reconnect SSE — un échec en
// cours de stream force le client à retomber sur /ask (non-streaming).
router.post(
  '/stream',
  jwtMiddleware,
  askLimiter,
  [
    body('message').isString().bail().trim().isLength({ min: 1, max: 2000 }),
    body('workspaceId').optional().isUUID(),
    body('locale').optional().isIn(['fr', 'en']),
    body('fileIds').optional().isArray({ max: 4 }),
    body('fileIds.*').optional().isUUID(),
    body('conversationId').optional({ nullable: true, checkFalsy: false }).isUUID(),
    // Cahier ADR-04 — toggle Rapide/Approfondi côté UI (Claude/Gemini côté
    // backend, transparent pour l'user qui voit juste "Rapide"/"Approfondi").
    body('mode').optional().isIn(['fast', 'deep']),
    // Cahier 22b §3.2 — chip "filtre sources" persistante au-dessus de l'input.
    // Limite le scope de la reponse a un sous-ensemble de connecteurs.
    body('sources').optional().isArray({ max: 10 }),
    body('sources.*').optional().isString().isLength({ min: 2, max: 40 }),
  ],
  runValidation,
  async (req, res, next) => {
    // Headers SSE — flush immédiat pour que le client commence à recevoir.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // disable proxy buffering (nginx)
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const send = (event, payload) => {
      try {
        res.write(`event: ${event}\n`)
        res.write(`data: ${JSON.stringify(payload)}\n\n`)
      } catch {
        // Socket fermée — on ignore, le close handler nettoiera.
      }
    }

    // Heartbeat toutes les 15s : keep-alive pour les proxys (nginx, ELB)
    // qui ferment les connexions idle après 30-60s.
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 15_000)

    let closed = false
    req.on('close', () => {
      closed = true
      clearInterval(heartbeat)
    })

    try {
      await chatService.askStream({
        userId: req.user.id,
        workspaceId: req.body.workspaceId,
        message: req.body.message,
        locale: req.body.locale || 'fr',
        fileIds: req.body.fileIds || [],
        conversationId: req.body.conversationId || null,
        mode: req.body.mode || 'fast',
        sources: Array.isArray(req.body.sources) ? req.body.sources : null,
        onEvent: (ev) => {
          if (closed) return
          send(ev.type, ev)
        },
      })
    } catch (err) {
      // Mapping des erreurs métier → event SSE 'error' avec le bon code.
      let code = 'INTERNAL'
      let message = err.message || 'Internal error'
      if (err && err.code === 'GEMINI_NOT_CONFIGURED') {
        code = 'AI_NOT_CONFIGURED'
        message = 'Le chat IA n’est pas encore configuré côté serveur.'
      } else if (err && err.code === 'AI_BUDGET_EXCEEDED') {
        code = 'AI_BUDGET_EXCEEDED'
        message = 'Budget IA mensuel atteint.'
      } else if (err && err.code === 'AI_RATE_LIMIT') {
        code = 'AI_RATE_LIMIT'
        message = 'Trop de questions, l’IA est saturée.'
      } else if (err && err.code === 'AI_TIMEOUT') {
        code = 'AI_TIMEOUT'
        message = 'La réponse a mis trop de temps.'
      } else if (err && err.code === 'AI_PROVIDER_DOWN') {
        code = 'AI_PROVIDER_DOWN'
        message = 'IA temporairement indisponible.'
      } else if (err && err.code === 'CLAUDE_NOT_CONFIGURED') {
        code = 'AI_NOT_CONFIGURED'
        message = "Le mode Approfondi n'est pas encore configuré côté serveur."
      } else if (err && err.code === 'AI_CREDIT_DEPLETED') {
        code = 'AI_CREDIT_DEPLETED'
        message = 'Le mode Approfondi est temporairement indisponible. Réessaie en mode Rapide.'
      } else {
        // Erreur non classifiée : on logue côté serveur pour investigation,
        // on n'expose pas le détail au client.
        next(err)
      }
      send('error', { code, message })
    } finally {
      clearInterval(heartbeat)
      if (!closed) {
        try {
          res.end()
        } catch {
          // déjà fermée
        }
      }
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

// ─── Export XLSX d'une reponse chat (cahier 22b §3.4 + §4.3) ─────────────
// L'user clique "📥 Excel" dans l'ActionShelf → on streame un .xlsx genere
// a la volee (text + highlights chart/table/compare). Aucun stockage : le
// fichier vit le temps de la reponse HTTP. Cap 50K cellules (cahier 22b §4.3).
router.get(
  '/messages/:id/export.xlsx',
  jwtMiddleware,
  [
    param('id').isUUID().withMessage('message id invalide.'),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const msg = await chatConversations.getMessageWithWorkspace(req.params.id)
      if (!msg) {
        return next(
          new UserFacingError('Message introuvable.', {
            statusCode: 404,
            code: 'MESSAGE_NOT_FOUND',
          }),
        )
      }
      // Defense en profondeur : verifie que le message appartient au
      // workspace passe en query (qui a deja ete contrarie par le JWT).
      if (msg.workspaceId !== req.query.workspaceId) {
        return next(new UserFacingError('Accès refusé.', { statusCode: 403, code: 'WS_MISMATCH' }))
      }
      if (msg.role !== 'assistant') {
        return next(
          new UserFacingError("On n'exporte que les réponses assistant.", {
            statusCode: 400,
            code: 'NOT_ASSISTANT_MESSAGE',
          }),
        )
      }

      const { buffer, filename } = await chatExport.buildXlsx({
        text: msg.content || '',
        highlights: Array.isArray(msg.highlights) ? msg.highlights : [],
        conversationId: msg.conversationId,
        messageId: msg.id,
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Content-Length', String(buffer.length))
      res.send(buffer)
    } catch (err) {
      if (err && err.code === 'XLSX_CELL_LIMIT') {
        return next(
          new UserFacingError(
            'Export trop volumineux. Réduis la période ou filtre par source pour réessayer.',
            { statusCode: 413, code: 'XLSX_CELL_LIMIT' },
          ),
        )
      }
      next(err)
    }
  },
)

// ─── Export PPTX d'une reponse chat (cahier 22b §4.4 — Pro only) ─────────
// Meme pattern que .xlsx : stream binaire, defense en profondeur, gated Pro.
router.get(
  '/messages/:id/export.pptx',
  jwtMiddleware,
  [
    param('id').isUUID().withMessage('message id invalide.'),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  workspaceScope,
  requireFeature('generate_slides'),
  async (req, res, next) => {
    try {
      const msg = await chatConversations.getMessageWithWorkspace(req.params.id)
      if (!msg) {
        return next(
          new UserFacingError('Message introuvable.', {
            statusCode: 404,
            code: 'MESSAGE_NOT_FOUND',
          }),
        )
      }
      if (msg.workspaceId !== req.workspaceId) {
        return next(new UserFacingError('Accès refusé.', { statusCode: 403, code: 'WS_MISMATCH' }))
      }
      if (msg.role !== 'assistant') {
        return next(
          new UserFacingError("On n'exporte que les réponses assistant.", {
            statusCode: 400,
            code: 'NOT_ASSISTANT_MESSAGE',
          }),
        )
      }
      const { buffer, filename } = await chatPptx.buildPptx({
        title: 'SmartAnalyst — Synthèse',
        subtitle: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
        highlights: Array.isArray(msg.highlights) ? msg.highlights : [],
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Content-Length', String(buffer.length))
      res.send(buffer)
    } catch (err) {
      if (err && err.code === 'PPTX_SLIDE_LIMIT') {
        return next(
          new UserFacingError(
            'Trop de visuels dans la réponse — réduis ou refais une question plus ciblée.',
            { statusCode: 413, code: 'PPTX_SLIDE_LIMIT' },
          ),
        )
      }
      next(err)
    }
  },
)

module.exports = router
