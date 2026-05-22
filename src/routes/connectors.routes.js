// Connectors routes: /api/v1/connectors/*
// Source: docs/09_API_CONNECTEURS.md, docs/07 §7 (OAuth callback)

const express = require('express')
const { body, param, query } = require('express-validator')

const { UserFacingError } = require('../lib/error-handler')
const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const connectorService = require('../services/connectors/connector.service')
const oauthState = require('../services/auth/oauth-state.service')
const googleOAuth = require('../services/auth/google-oauth.service')
const { logger } = require('../lib/logger')
const { SUPPORTED_SOURCES } = require('../connectors')

const router = express.Router()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OAuth callback (PUBLIC, pas de JWT — l'auth est dans le state JWT)
// Doit être déclaré AVANT le router.use(jwtMiddleware).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/oauth/callback', async (req, res) => {
  const { code, state, error: providerError } = req.query
  const frontendUrl = process.env.APP_URL || ''
  const errorRedirect = (reason) =>
    res.redirect(`${frontendUrl}/connectors?status=error&reason=${encodeURIComponent(reason)}`)

  if (providerError) {
    logger.warn({ event: 'oauth_callback_provider_error', providerError })
    return errorRedirect(providerError)
  }
  if (!code || !state) {
    return errorRedirect('missing_code_or_state')
  }

  let decoded
  try {
    decoded = oauthState.verify(state)
  } catch (err) {
    logger.warn({ event: 'oauth_callback_state_invalid', error: err.message })
    return errorRedirect('invalid_state')
  }

  const { workspaceId, source, accountId, accountName } = decoded

  try {
    let tokens
    if (source === 'ga4' || source === 'search_console' || source === 'google_ads') {
      tokens = await googleOAuth.exchangeCodeForTokens(code)
    } else {
      throw new UserFacingError(`OAuth pour "${source}" pas encore supporté.`, {
        statusCode: 400,
        code: 'OAUTH_PROVIDER_UNSUPPORTED',
      })
    }

    await connectorService.finalizeOAuthConnector({
      workspaceId,
      source,
      accountId,
      accountName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    })

    return res.redirect(`${frontendUrl}/connectors?status=connected&source=${source}`)
  } catch (err) {
    logger.error({
      event: 'oauth_callback_failed',
      workspaceId,
      source,
      error: err.message,
      stack: err.stack,
    })
    return errorRedirect(err.code || 'unknown')
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// À partir d'ici, JWT requis pour toutes les routes.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.use(jwtMiddleware)

// ━━━ GET /oauth/authorize ━━━
router.get(
  '/oauth/authorize',
  [
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    query('source')
      .isIn(SUPPORTED_SOURCES)
      .withMessage(`source doit être l'un de: ${SUPPORTED_SOURCES.join(', ')}.`),
    query('accountId').optional().isString(),
    query('accountName').optional().isString(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const { source, accountId, accountName } = req.query

      let scopes
      if (source === 'ga4') scopes = googleOAuth.SCOPES.ga4
      else if (source === 'search_console') scopes = googleOAuth.SCOPES.searchConsole
      else if (source === 'google_ads') scopes = googleOAuth.SCOPES.googleAds
      else {
        throw new UserFacingError(`OAuth pour "${source}" pas encore supporté.`, {
          statusCode: 400,
          code: 'OAUTH_PROVIDER_UNSUPPORTED',
        })
      }

      const state = oauthState.sign({
        userId: req.user.id,
        workspaceId: req.workspaceId,
        source,
        accountId,
        accountName,
      })
      const url = googleOAuth.buildAuthorizeUrl({ scopes, state })

      res.json({ authorizeUrl: url })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /connectors — list ━━━
router.get(
  '/',
  [query('workspaceId').isUUID().withMessage('workspaceId UUID requis.')],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const items = await connectorService.list(req.workspaceId)
      res.json({ connectors: items })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /connectors — add API-key connector ━━━
router.post(
  '/',
  [
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('source').isIn(SUPPORTED_SOURCES).withMessage('Source non supportée.'),
    body('accountId').isString().notEmpty().withMessage('accountId requis.'),
    body('accountName').optional().isString(),
    body('apiKey').isString().notEmpty().withMessage('apiKey requis.'),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const connector = await connectorService.addApiKeyConnector({
        workspaceId: req.workspaceId,
        source: req.body.source,
        accountId: req.body.accountId,
        accountName: req.body.accountName,
        apiKey: req.body.apiKey,
      })
      res.status(201).json({ connector })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /connectors/:id ━━━
router.get(
  '/:id',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const record = await connectorService.getById(req.workspaceId, req.params.id)
      res.json({ connector: connectorService.sanitize(record) })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /connectors/:id ━━━
router.delete(
  '/:id',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      await connectorService.remove(req.workspaceId, req.params.id)
      res.json({ message: 'Connecteur supprimé.' })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /connectors/:id/test ━━━
router.post(
  '/:id/test',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const result = await connectorService.test(req.workspaceId, req.params.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /connectors/:id/sync ━━━
router.post(
  '/:id/sync',
  [
    param('id').isUUID().withMessage('id UUID requis.'),
    body('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    body('startDate').optional().isISO8601().withMessage('startDate doit être ISO 8601.'),
    body('endDate').optional().isISO8601().withMessage('endDate doit être ISO 8601.'),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const result = await connectorService.sync(req.workspaceId, req.params.id, {
        startDate: req.body.startDate,
        endDate: req.body.endDate,
      })
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
