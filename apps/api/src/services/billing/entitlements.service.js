// Service entitlements — source de vérité pour les questions "quel plan a ce
// workspace ?" et "peut-il utiliser cette feature / dépasser ce quota ?".
//
// Cahier §3 Lot 3 + ADR-02 (pricing workspaces × features).
// MVP : 2 plans actifs (Free + Pro). Les plans Starter et Agency restent
// définis dans pricing.js (packages/shared) pour ne pas casser leur référence,
// mais on ne les exposera ni en checkout ni en UI tant qu'on n'a pas
// d'utilisateur qui les demande.
//
// Stratégie : un workspace appartient à une organisation, l'organisation porte
// le `plan` (free|pro|...). Tout le code applicatif passe par ce service —
// jamais lire `organizations.plan` en direct ailleurs, pour qu'on puisse
// changer la sémantique sans casser le reste.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')

// MVP gating : Free + Pro uniquement. Les autres plans hérités sont mappés
// vers Pro pour ne pas casser un compte existant qui aurait Starter/Agency.
const PLAN_FEATURES = {
  free: {
    maxConnectors: 1,
    maxInsightsPerMonth: 3,
    canGenerateReports: false,
    canUseDeepChat: false,
  },
  pro: {
    maxConnectors: Infinity,
    maxInsightsPerMonth: Infinity,
    canGenerateReports: true,
    canUseDeepChat: true,
  },
}
// Plans non-MVP : on les considère équivalents à 'pro' pour ne pas régresser
// un compte existant. On migrera progressivement.
const LEGACY_TO_MVP = { starter: 'pro', agency: 'pro', trial: 'pro' }

function normalizePlan(plan) {
  if (!plan) return 'free'
  const lower = String(plan).toLowerCase()
  if (PLAN_FEATURES[lower]) return lower
  if (LEGACY_TO_MVP[lower]) return LEGACY_TO_MVP[lower]
  return 'free'
}

/**
 * Récupère le plan effectif d'un workspace via son organisation.
 * Fail-open : retourne 'free' en cas d'erreur DB ou de mock incomplet
 * (tests) pour ne pas bloquer l'UX (worst case = on offre moins, pas plus).
 */
async function getWorkspacePlan(workspaceId) {
  if (!workspaceId) return 'free'
  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('workspaces')
      .select('organization_id, organizations(plan)')
      .eq('id', workspaceId)
      .maybeSingle()
    if (error || !data) {
      logger.warn(
        { event: 'entitlements_plan_lookup_failed', workspaceId, error: error?.message },
        'Could not resolve workspace plan, defaulting to free',
      )
      return 'free'
    }
    return normalizePlan(data.organizations?.plan)
  } catch (err) {
    logger.warn(
      { event: 'entitlements_plan_lookup_threw', workspaceId, error: err.message },
      'Plan lookup threw, defaulting to free',
    )
    return 'free'
  }
}

/**
 * Idem mais à partir de l'organization_id (plus rapide quand on l'a déjà).
 */
async function getOrganizationPlan(organizationId) {
  if (!organizationId) return 'free'
  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('plan')
      .eq('id', organizationId)
      .maybeSingle()
    if (error || !data) return 'free'
    return normalizePlan(data.plan)
  } catch {
    return 'free'
  }
}

/**
 * @param {string} plan — 'free' | 'pro'
 * @param {string} feature — 'reports' | 'deep_chat'
 * @returns {boolean}
 */
function canUseFeature(plan, feature) {
  const normalized = normalizePlan(plan)
  const features = PLAN_FEATURES[normalized]
  switch (feature) {
    case 'reports':
      return features.canGenerateReports
    case 'deep_chat':
      return features.canUseDeepChat
    default:
      return false
  }
}

/**
 * Vérifie un quota numérique (connecteurs, insights/mois).
 * Retourne toujours { current, limit, exceeded } — jamais throw.
 */
async function checkQuota(workspaceId, quotaType) {
  const plan = await getWorkspacePlan(workspaceId)
  const limit = getQuotaLimit(plan, quotaType)
  const current = await getCurrentUsage(workspaceId, quotaType)
  const exceeded = Number.isFinite(limit) && current >= limit
  return { plan, current, limit, exceeded, quotaType }
}

function getQuotaLimit(plan, quotaType) {
  const features = PLAN_FEATURES[normalizePlan(plan)]
  switch (quotaType) {
    case 'connectors':
      return features.maxConnectors
    case 'insights_per_month':
      return features.maxInsightsPerMonth
    default:
      return Infinity
  }
}

async function getCurrentUsage(workspaceId, quotaType) {
  // Fail-open : si la lecture du compteur plante (mock incomplet en test,
  // DB momentanément down), on retourne 0 plutôt que de bloquer.
  try {
    const supabase = getServiceRoleClient()
    if (quotaType === 'connectors') {
      const { count } = await supabase
        .from('connectors')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .in('status', ['active', 'expired', 'error'])
      return count || 0
    }
    if (quotaType === 'insights_per_month') {
      // Mois calendaire en cours — pas glissant, plus simple à expliquer à l'user
      // ("ce mois-ci tu as utilisé X / Y insights").
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { count } = await supabase
        .from('insights')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .gte('created_at', startOfMonth)
      return count || 0
    }
  } catch {
    return 0
  }
  return 0
}

/**
 * Résumé complet pour l'UI Settings/Billing : plan + tous les quotas en un
 * appel pour éviter les N+1 côté frontend.
 */
async function getEntitlementsSummary(workspaceId) {
  const plan = await getWorkspacePlan(workspaceId)
  const [connectorsQ, insightsQ] = await Promise.all([
    checkQuota(workspaceId, 'connectors'),
    checkQuota(workspaceId, 'insights_per_month'),
  ])
  return {
    plan,
    features: {
      canGenerateReports: PLAN_FEATURES[plan].canGenerateReports,
      canUseDeepChat: PLAN_FEATURES[plan].canUseDeepChat,
    },
    quotas: {
      connectors: {
        current: connectorsQ.current,
        limit: connectorsQ.limit === Infinity ? null : connectorsQ.limit,
        exceeded: connectorsQ.exceeded,
      },
      insightsPerMonth: {
        current: insightsQ.current,
        limit: insightsQ.limit === Infinity ? null : insightsQ.limit,
        exceeded: insightsQ.exceeded,
      },
    },
  }
}

module.exports = {
  getWorkspacePlan,
  getOrganizationPlan,
  canUseFeature,
  checkQuota,
  getEntitlementsSummary,
  normalizePlan,
  PLAN_FEATURES,
}
