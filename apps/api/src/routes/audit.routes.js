// Audit routes: /api/v1/audit/*
//
// M4 Phase D — SEO + GEO + Performance + AI scoring on-demand.
// POST synchrone qui renvoie l'audit complet (~20-30s avec tous les analyzers).

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { getServiceRoleClient } = require('../lib/supabase')
const { UserFacingError } = require('../lib/error-handler')
const { logger } = require('../lib/logger')
const auditService = require('../services/audit/audit.service')

const router = express.Router()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC: POST /audit/trigger (writeKey-based auth, pas de JWT)
//
// Déclenché par Smartanalyst('runAudit') depuis le script sa.js. On
// authentifie via le writeKey du workspace (= workspace_id) plutôt qu'un
// JWT user, parce que le tag tourne côté navigateur d'un visiteur final
// qui n'a pas de compte SmartAnalyst.
//
// Rate limit serré (5 req/min/IP) pour limiter l'abus, et 1 audit
// concurrent par workspace côté service plus tard si besoin.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const triggerLimiter = rateLimit({
  windowMs: 60_000, // 1 min
  max: 5, // 5 audits/min/IP — un humain n'a pas besoin de plus
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Trop de requêtes — réessaie dans une minute.' },
})

// CORS large pour /trigger (le tag tourne sur des sites tiers inconnus,
// même pattern que track.routes). Appliqué uniquement à cette route, pas
// au reste du router (les routes auth restent en CORS restrictif global).
function publicCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
}

router.options('/trigger', publicCors)
router.post(
  '/trigger',
  publicCors,
  triggerLimiter,
  express.json({ limit: '4kb' }),
  body('writeKey').isUUID().withMessage('writeKey doit être un UUID workspace valide'),
  body('url').isString().trim().isLength({ min: 4, max: 2048 }),
  runValidation,
  async (req, res, next) => {
    try {
      const { writeKey, url } = req.body

      // Vérifie que le writeKey correspond à un workspace existant.
      const { data: ws, error: wsErr } = await getServiceRoleClient()
        .from('workspaces')
        .select('id')
        .eq('id', writeKey)
        .maybeSingle()

      if (wsErr) {
        logger.error({ event: 'audit_trigger_ws_lookup_failed', error: wsErr.message })
        throw new UserFacingError('Lookup workspace failed.', {
          statusCode: 500,
          code: 'WS_LOOKUP_FAILED',
        })
      }
      if (!ws) {
        throw new UserFacingError('writeKey inconnu.', {
          statusCode: 401,
          code: 'INVALID_WRITE_KEY',
        })
      }

      logger.info({ event: 'audit_trigger_public', workspaceId: writeKey, url, ip: req.ip })

      const audit = await auditService.runAudit({
        workspaceId: writeKey,
        userId: null, // Triggered by anonymous visitor via tag, pas un user identifié
        url,
      })

      const appBase = (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
      res.status(201).json({
        id: audit.id,
        score: audit.score,
        appUrl: `${appBase}/audit?id=${audit.id}`,
      })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes authentifiées (depuis l'app web)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
