// Middleware quota-gate — bloque une mutation si l'org a atteint la limite
// de son plan (cahier §3 Lot 3).
//
// Utilisation :
//   router.post('/', workspaceScope, requireQuota('connectors'), handler)
//
// À appliquer APRÈS `workspaceScope` qui résout `req.workspaceId`.
//
// Format de l'erreur (UserFacingError 402 Payment Required) :
//   {
//     error: {
//       code: 'QUOTA_EXCEEDED',
//       message: '...',
//       requestId: '...',
//       quotaType, current, limit, plan
//     }
//   }
// Le frontend lit `code` pour afficher un UpgradePrompt contextualisé.

const { UserFacingError } = require('../lib/error-handler')
const entitlements = require('../services/billing/entitlements.service')

function requireQuota(quotaType) {
  return async function quotaGate(req, res, next) {
    try {
      if (!req.workspaceId) {
        return next(new Error('requireQuota called before workspaceScope (no req.workspaceId)'))
      }
      const result = await entitlements.checkQuota(req.workspaceId, quotaType)
      if (result.exceeded) {
        const err = new UserFacingError(
          `Tu as atteint la limite de ton plan ${result.plan} pour ce quota.`,
          { statusCode: 402, code: 'QUOTA_EXCEEDED' },
        )
        // On enrichit l'erreur pour que le frontend ait tout le contexte
        // pour afficher l'UpgradePrompt (current/limit/quotaType/plan).
        err.quotaType = quotaType
        err.current = result.current
        err.limit = result.limit === Infinity ? null : result.limit
        err.plan = result.plan
        return next(err)
      }
      next()
    } catch (err) {
      // Fail-open : si la lecture du quota plante (DB down), on laisse passer
      // plutôt que de bloquer l'user pour un problème d'infra. Le worst case
      // est qu'un quota soit dépassé d'1 unité jusqu'au prochain check.
      next()
    }
  }
}

/**
 * Variante feature gate (pas un nombre, mais un booléen).
 *   router.post('/reports', workspaceScope, requireFeature('reports'), handler)
 */
function requireFeature(featureName) {
  return async function featureGate(req, res, next) {
    try {
      if (!req.workspaceId) {
        return next(new Error('requireFeature called before workspaceScope'))
      }
      const plan = await entitlements.getWorkspacePlan(req.workspaceId)
      if (!entitlements.canUseFeature(plan, featureName)) {
        const err = new UserFacingError(
          `Cette fonctionnalité n'est pas incluse dans ton plan ${plan}.`,
          { statusCode: 402, code: 'FEATURE_UNAVAILABLE' },
        )
        err.feature = featureName
        err.plan = plan
        return next(err)
      }
      next()
    } catch {
      // Fail-open identique à requireQuota.
      next()
    }
  }
}

module.exports = { requireQuota, requireFeature }
