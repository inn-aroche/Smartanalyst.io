// Billing routes — cahier §3 Lot 3.
//
// Endpoints:
//   GET  /api/v1/billing/subscription   plan effectif + quotas + features
//   POST /api/v1/billing/checkout       Stripe Checkout Session → url
//   POST /api/v1/billing/portal         Customer Portal Session → url
//
// Toutes les routes sont JWT-gated + workspace-scoped : un user ne peut agir
// que sur le workspace dont il est membre. Le service entitlements joint via
// workspace → organization pour résoudre le plan.

const express = require('express')
const { body, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { UserFacingError } = require('../lib/error-handler')
const entitlements = require('../services/billing/entitlements.service')
const billing = require('../services/billing/billing.service')
const { getServiceRoleClient } = require('../lib/supabase')
const { logger } = require('../lib/logger')

const router = express.Router()
router.use(jwtMiddleware)

// ━━━ GET /billing/subscription ━━━
// Retourne le plan + quotas + features du workspace courant. Consommé par
// l'onglet Settings/Billing et par les UpgradePrompts inline.
router.get(
  '/subscription',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const summary = await entitlements.getEntitlementsSummary(req.workspaceId)
      res.json(summary)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /billing/checkout ━━━
// Crée une Stripe Checkout Session et retourne son URL. Le front redirige
// l'user dessus avec window.location.href = url.
router.post(
  '/checkout',
  [
    body('workspaceId').isUUID(),
    // Whitelist alignée sur PUBLIC_PLAN_ORDER (cf. packages/shared/src/pricing.js)
    // Pro = plan principal du funnel. Starter accepté pour le tiers freelance.
    body('plan').isIn(['pro', 'starter']),
    body('successUrl').optional().isURL({ require_tld: false }),
    body('cancelUrl').optional().isURL({ require_tld: false }),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const supabase = getServiceRoleClient()
      const { data: ws } = await supabase
        .from('workspaces')
        .select('organization_id')
        .eq('id', req.workspaceId)
        .maybeSingle()
      if (!ws?.organization_id) {
        return next(
          new UserFacingError("Le workspace n'a pas d'organisation associée.", {
            statusCode: 400,
            code: 'NO_ORG',
          }),
        )
      }
      const origin = req.get('origin') || req.get('referer') || 'https://app.smartanalyst.io'
      const cleanOrigin = origin.replace(/\/$/, '').split('?')[0]
      const result = await billing.createCheckoutSession({
        orgId: ws.organization_id,
        plan: req.body.plan,
        userEmail: req.user?.email,
        successUrl: req.body.successUrl || `${cleanOrigin}/settings?billing=success`,
        cancelUrl: req.body.cancelUrl || `${cleanOrigin}/settings?billing=cancel`,
      })
      res.json(result)
    } catch (err) {
      if (err && err.code === 'BILLING_NOT_CONFIGURED') {
        return next(
          new UserFacingError("La facturation n'est pas encore configurée côté serveur.", {
            statusCode: 503,
            code: 'BILLING_NOT_CONFIGURED',
          }),
        )
      }
      if (err && err.code === 'BILLING_PLAN_UNAVAILABLE') {
        return next(
          new UserFacingError(
            "Ce plan n'est pas disponible. Contacte le support si le problème persiste.",
            { statusCode: 503, code: 'BILLING_PLAN_UNAVAILABLE' },
          ),
        )
      }
      logger.error(
        { event: 'billing_checkout_failed', orgId: req.workspaceId, error: err.message },
        'Stripe checkout session creation failed',
      )
      next(err)
    }
  },
)

// ━━━ POST /billing/portal ━━━
// Crée une Customer Portal Session pour gérer l'abonnement existant (plan,
// CB, factures). Échoue avec NO_CUSTOMER si l'org n'a jamais checkout — l'UI
// proposera alors un upgrade au lieu d'un manage.
router.post(
  '/portal',
  [body('workspaceId').isUUID(), body('returnUrl').optional().isURL({ require_tld: false })],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const supabase = getServiceRoleClient()
      const { data: ws } = await supabase
        .from('workspaces')
        .select('organization_id')
        .eq('id', req.workspaceId)
        .maybeSingle()
      if (!ws?.organization_id) {
        return next(
          new UserFacingError("Le workspace n'a pas d'organisation associée.", {
            statusCode: 400,
            code: 'NO_ORG',
          }),
        )
      }
      const origin = req.get('origin') || req.get('referer') || 'https://app.smartanalyst.io'
      const cleanOrigin = origin.replace(/\/$/, '').split('?')[0]
      const result = await billing.createPortalSession({
        orgId: ws.organization_id,
        returnUrl: req.body.returnUrl || `${cleanOrigin}/settings`,
      })
      res.json(result)
    } catch (err) {
      if (err && err.code === 'NO_CUSTOMER') {
        return next(
          new UserFacingError(
            "Tu n'as pas encore d'abonnement à gérer. Passe au plan Pro d'abord.",
            { statusCode: 404, code: 'NO_CUSTOMER' },
          ),
        )
      }
      if (err && err.code === 'BILLING_NOT_CONFIGURED') {
        return next(
          new UserFacingError("La facturation n'est pas encore configurée côté serveur.", {
            statusCode: 503,
            code: 'BILLING_NOT_CONFIGURED',
          }),
        )
      }
      next(err)
    }
  },
)

module.exports = router
