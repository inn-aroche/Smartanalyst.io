// Routes Nango : exposent au frontend les fonctions du nango.service.
//
// Endpoints :
//   POST   /api/v1/nango/connect/:providerId               → connect session token (popup OAuth côté front)
//   GET    /api/v1/nango/connections                        → liste des intégrations connectées du workspace
//   DELETE /api/v1/nango/connections/:providerId/:connectionId → déconnexion
//
// Toutes les routes sont protégées par JWT + workspaceScope (vérifie que
// l'utilisateur appartient bien au workspace cible).

const express = require('express')
const { param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const nangoService = require('../services/auth/nango.service')

const router = express.Router()

// Liste blanche des intégrations exposées au frontend. Doit refléter les
// integrations déclarées dans nango.yaml ET configurées dans le dashboard
// Nango (sinon createConnectSession renverra une erreur).
const INTEGRATIONS_SUPPORTEES = [
  'shopify',
  'google-analytics',
  'facebook-marketing',
  'tiktok',
  'google-ads',
  'stripe',
  'hubspot',
  'notion',
]

router.use(jwtMiddleware)

// ━━━ POST /connect/:providerId ━━━
// Génère un connect session token. Le front l'utilise avec @nangohq/frontend
// pour ouvrir la popup OAuth.
router.post(
  '/connect/:providerId',
  [
    param('providerId')
      .isIn(INTEGRATIONS_SUPPORTEES)
      .withMessage(`providerId doit être l'un de: ${INTEGRATIONS_SUPPORTEES.join(', ')}.`),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const { token, expiresAt } = await nangoService.creerSessionConnexion({
        userId: req.user.id,
        workspaceId: req.workspaceId,
        providerConfigKey: req.params.providerId,
      })
      res.json({
        connect_session_token: token,
        expires_at: expiresAt,
      })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /connections ━━━
router.get(
  '/connections',
  [query('workspaceId').isUUID().withMessage('workspaceId UUID requis.')],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const connections = await nangoService.listerConnexions(req.workspaceId)
      res.json({ connections })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /connections/:providerId/:connectionId ━━━
router.delete(
  '/connections/:providerId/:connectionId',
  [
    param('providerId').isIn(INTEGRATIONS_SUPPORTEES),
    param('connectionId').isString().notEmpty(),
    query('workspaceId').isUUID(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      await nangoService.supprimerConnexion(
        req.params.providerId,
        req.params.connectionId,
      )
      res.json({ message: 'Connexion supprimée.' })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
