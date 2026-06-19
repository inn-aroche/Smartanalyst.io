// Connectors routes: /api/v1/connectors/*
//
// Source: docs/09_API_CONNECTEURS.md, docs/07 §7 (OAuth callback)
//
// Depuis la refonte intégration_providers (migration 011), les flows OAuth
// utilisent oauth-generic.service qui lit la config provider depuis la DB
// (URLs, scopes, Client ID/Secret chiffrés) au lieu de hardcoder par provider.

const express = require('express')
const { body, param, query } = require('express-validator')

const { UserFacingError } = require('../lib/error-handler')
const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const connectorService = require('../services/connectors/connector.service')
const connectorHealth = require('../services/connectors/connector-health.service')
const providersService = require('../services/connectors/providers.service')
const accountResolver = require('../services/connectors/account-resolver.service')
const oauthGeneric = require('../services/auth/oauth-generic.service')
const oauthState = require('../services/auth/oauth-state.service')
const { getQueue, QUEUE_NAMES, JOB_NAMES } = require('../queue-jobs/queues')
const { logger } = require('../lib/logger')

const router = express.Router()

// Récupère la liste à jour des sources connectables (status='available'|'beta'
// ET app OAuth configurée). Utilisé pour la validation des params.
async function _sourcesConnectables() {
  const catalog = await providersService.listForCatalog()
  return catalog
    .filter((p) => ['available', 'beta'].includes(p.status) && p.credentials_configured)
    .map((p) => p.source)
}

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
    return errorRedirect(String(providerError))
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

  const { workspaceId, source, accountId, accountName, subst } = decoded

  try {
    const tokens = await oauthGeneric.exchangeCodeForTokens({
      source,
      code,
      subst: subst || {},
    })

    // Vérifie que le provider a bien octroyé les scopes qu'on a demandés.
    // Certains providers (Meta, Google) laissent l'user décocher des scopes
    // dans l'écran de consentement : le token marche, mais en READ-ONLY ou
    // sans les permissions critiques. Sans cette vérif on s'en rendrait
    // compte uniquement au premier sync KO. On log un warning structuré
    // pour pouvoir alerter (Sentry / debug user) ET on remonte le signal
    // jusqu'à l'UI via le redirect (Lot 0 §4.7 : aucun échec silencieux).
    let scopeMismatch = null
    try {
      const provider = await providersService.getWithDecryptedCredentials(source)
      const requestedScopes = provider.scopes || []
      const grantedScopes = parseGrantedScopes(tokens.scope, tokens.raw)
      if (grantedScopes && requestedScopes.length > 0) {
        const missing = requestedScopes.filter((s) => !grantedScopes.includes(s))
        if (missing.length > 0) {
          scopeMismatch = missing
          logger.warn(
            {
              event: 'oauth_scope_mismatch',
              workspaceId,
              source,
              requested: requestedScopes,
              granted: grantedScopes,
              missing,
            },
            'OAuth provider granted fewer scopes than requested — connector may sync partial data',
          )
        }
      }
    } catch (scopeErr) {
      // Vérification best-effort : on ne casse pas le flow si la lecture du
      // provider échoue ici, le finalize ci-dessous remontera l'erreur réelle.
      logger.warn(
        { event: 'oauth_scope_check_failed', source, error: scopeErr.message },
        'Could not verify granted scopes',
      )
    }

    // Le flow d'init OAuth ne demande pas à l'utilisateur de choisir une
    // property/account avant la redirection — c'est impossible pour la
    // plupart des providers (GA4, Meta Ads…) qui exigent d'avoir le token
    // pour lister les comptes disponibles. Si le state ne contient pas de
    // accountId, on le résout maintenant via l'API du provider.
    let resolvedAccountId = accountId
    let resolvedAccountName = accountName
    if (!resolvedAccountId) {
      const resolved = await accountResolver.resolveAccount({
        source,
        accessToken: tokens.accessToken,
        subst: subst || {},
      })
      resolvedAccountId = resolved.accountId
      resolvedAccountName = resolved.accountName
      logger.info(
        {
          event: 'oauth_account_resolved',
          workspaceId,
          source,
          accountId: resolvedAccountId,
        },
        'Account resolved post-OAuth',
      )
    }

    await connectorService.finalizeOAuthConnector({
      workspaceId,
      source,
      accountId: resolvedAccountId,
      accountName: resolvedAccountName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    })

    // Trigger un sync immédiat sur 30j — sinon le user voit un dashboard
    // vide jusqu'au prochain cron quotidien (3h UTC). Fire-and-forget :
    // si l'enqueue échoue, on log mais on ne casse pas le redirect.
    try {
      const today = new Date()
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      const dataSyncQueue = getQueue(QUEUE_NAMES.DATA_SYNC)
      // jobId stable = idempotence si l'user re-clique sur le même OAuth flow
      // (double callback peut arriver si refresh navigateur). Granularité minute.
      const jobId = `sync-workspace:${workspaceId}:post-oauth:${Date.now().toString().slice(0, -3)}`
      await dataSyncQueue.add(
        JOB_NAMES.DATA_SYNC_WORKSPACE,
        { workspaceId, startDate: fmt(monthAgo), endDate: fmt(today) },
        { jobId },
      )
      logger.info(
        { event: 'post_oauth_sync_enqueued', workspaceId, source, jobId },
        'Post-OAuth sync job enqueued',
      )
    } catch (enqueueErr) {
      logger.warn(
        { event: 'post_oauth_sync_enqueue_failed', workspaceId, source, error: enqueueErr.message },
        'Failed to enqueue post-OAuth sync (next cron will catch up)',
      )
    }

    const successParams = new URLSearchParams({ status: 'connected', source })
    if (scopeMismatch && scopeMismatch.length > 0) {
      // L'UI affichera un panneau d'avertissement (ScopeMismatchWarning)
      // listant les scopes manquants — le user comprend pourquoi telle
      // métrique restera vide sans avoir à creuser les logs.
      successParams.set('warning', 'scope_mismatch')
      successParams.set('missing_scopes', scopeMismatch.join(','))
    }
    return res.redirect(`${frontendUrl}/connectors?${successParams.toString()}`)
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

// ━━━ GET /catalog — liste publique des providers (sanitized) ━━━
// Renvoie tout sauf les colonnes *_encrypted. Le flag credentials_configured
// permet au frontend de savoir si un provider est réellement connectable.
router.get('/catalog', async (req, res, next) => {
  try {
    const catalog = await providersService.listForCatalog()
    res.json({ catalog })
  } catch (err) {
    next(err)
  }
})

// ━━━ GET /oauth/authorize ━━━
router.get(
  '/oauth/authorize',
  [
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    query('source').isString().notEmpty().withMessage('source requis.'),
    query('accountId').optional().isString(),
    query('accountName').optional().isString(),
    // Pour les providers qui ont besoin d'un sub-domaine (Shopify) ou d'un
    // identifiant compte (Meta) — passé en query.subst (JSON-encoded).
    query('subst').optional().isString(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const { source, accountId, accountName } = req.query
      const subst = req.query.subst ? JSON.parse(req.query.subst) : {}

      const connectables = await _sourcesConnectables()
      if (!connectables.includes(source)) {
        throw new UserFacingError(
          `Source "${source}" non connectable (app OAuth non configurée ou status≠available).`,
          { statusCode: 400, code: 'SOURCE_NOT_CONNECTABLE' },
        )
      }

      const state = oauthState.sign({
        userId: req.user.id,
        workspaceId: req.workspaceId,
        source,
        accountId,
        accountName,
        subst,
      })
      const url = await oauthGeneric.buildAuthorizeUrl({ source, state, subst })

      res.json({ authorize_url: url })
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
      // Calcule un health_state dérivé pour chaque connecteur (cahier §3
      // Lot 0). Permet au front d'afficher un badge précis sans dupliquer
      // la logique de seuils.
      const enriched = connectorHealth.enrichWithHealth(items)
      res.json({ connectors: enriched })
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
    body('source').isString().notEmpty().withMessage('source requise.'),
    body('accountId').isString().notEmpty().withMessage('accountId requis.'),
    body('accountName').optional().isString(),
    body('apiKey').isString().notEmpty().withMessage('apiKey requis.'),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      // Verifie que le provider existe et qu'il est en mode apikey.
      const provider = await providersService.getBySource(req.body.source)
      if (provider.auth_kind !== 'apikey') {
        throw new UserFacingError(
          `Le connecteur "${req.body.source}" utilise OAuth, pas une clé API.`,
          { statusCode: 400, code: 'AUTH_KIND_MISMATCH' },
        )
      }
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

/**
 * Normalise la liste des scopes effectivement octroyés par le provider.
 *
 * Google/Stripe → `scope` est une string space-separated.
 * Meta → `granted_scopes` peut être un string CSV dans `raw`.
 * Shopify → `scope` est une string CSV.
 * Plein d'autres → champ absent (on retourne null = on ne vérifie pas).
 */
function parseGrantedScopes(scope, raw) {
  if (typeof scope === 'string' && scope.length > 0) {
    return scope.split(/[\s,]+/).filter(Boolean)
  }
  if (raw && typeof raw.granted_scopes === 'string') {
    return raw.granted_scopes.split(/[\s,]+/).filter(Boolean)
  }
  return null
}

module.exports = router
