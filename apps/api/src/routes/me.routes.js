// Routes self-service utilisateur : /api/v1/me/*
//
// Pour l'instant : export RGPD (Article 15) + suppression compte
// (Article 17). À étendre plus tard avec /me/profile (update name etc.).

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { query } = require('express-validator')
const gdprService = require('../services/gdpr/gdpr.service')
const aiUsage = require('../services/ai/ai-usage.service')

const router = express.Router()
router.use(jwtMiddleware)

// Rate limit strict pour ne pas se faire DDoS sur les exports (qui
// peuvent peser).
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3, // 3 exports / heure / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMIT', message: "Trop d'exports demandés. Attends une heure." },
  },
})

const deleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Trop de tentatives.' } },
})

// ━━━ GET /me/export — RGPD article 15 ━━━
// Renvoie un JSON portable avec toutes les données du user. Content-
// Disposition: attachment pour proposer un téléchargement direct.
router.get('/export', exportLimiter, async (req, res, next) => {
  try {
    const data = await gdprService.exportUserData(req.user.id, req.user.email)
    const filename = `smartanalyst-export-${req.user.id}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(JSON.stringify(data, null, 2))
  } catch (err) {
    next(err)
  }
})

// ━━━ POST /me/delete — RGPD article 17 ━━━
// Body : { confirm: "DELETE MY ACCOUNT" } — phrase exacte exigée pour
// éviter qu'un curl en boucle bousille tout.
router.post(
  '/delete',
  deleteLimiter,
  [body('confirm').isString().withMessage('confirm requis.')],
  runValidation,
  async (req, res, next) => {
    try {
      gdprService.requireConfirmation(req.body.confirm)
      const result = await gdprService.deleteUserData(req.user.id, req.user.email)
      res.json({ ok: true, ...result })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /me/ai-usage — usage IA du mois en cours pour un workspace ━━━
router.get(
  '/ai-usage',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const usage = await aiUsage.getMonthlyUsage(req.workspaceId)
      res.json(usage)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
