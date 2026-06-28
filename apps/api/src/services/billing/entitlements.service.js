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

// MVP gating : Free + Starter + Pro. Starter est un tier intermediaire reel
// (cf. marketing pricing page) — plus de connecteurs/insights que Free, mais
// pas les features premium (deep_chat, pin to dashboard, slide deck).
const PLAN_FEATURES = {
  free: {
    maxConnectors: 1,
    maxInsightsPerMonth: 3,
    maxAiTokensPerMonth: 50_000,
    canGenerateReports: false,
    canUseDeepChat: false,
    // Lot V2.3 — Pin / Slide deck Pro-only (cahier 22b §5).
    canPinToDashboard: false,
    canGenerateSlides: false,
  },
  starter: {
    maxConnectors: 3,
    maxInsightsPerMonth: 100,
    maxAiTokensPerMonth: 500_000,
    // Rapports OK pour Starter (cas d'usage cle du freelance : envoyer son
    // rapport mensuel au client meme sans toute la suite Pro).
    canGenerateReports: true,
    // Mais pas les "Pro flagship features" — c'est ce qui justifie le 59€ Pro.
    canUseDeepChat: false,
    canPinToDashboard: false,
    canGenerateSlides: false,
  },
  pro: {
    maxConnectors: Infinity,
    maxInsightsPerMonth: Infinity,
    maxAiTokensPerMonth: Infinity,
    canGenerateReports: true,
    canUseDeepChat: true,
    canPinToDashboard: true,
    canGenerateSlides: true,
  },
}
// Plans hérités / non-MVP :
//   - agency = clients en grandfather de l'ancien plan 199€, on les garde sur 'pro'
//     pour ne pas régresser (ils paient deja le top tier).
//   - trial = état initial d'inscription (créé par auth.service à l'inscription),
//     PAS un plan payé → doit être traité comme 'free' (sinon tout nouveau user
//     a accès à tout gratuitement, fuite de revenus garantie)
//
// NOTE : 'starter' a ETE retire de cette map. Il etait auparavant mappe a 'pro'
// pour ne pas casser les clients existants, mais on vend le plan Starter
// publiquement avec ses propres quotas — il doit donc avoir ses propres
// features. Si tu as un Starter historique, il garde Starter (ses quotas
// matchent ce qu'il a achete).
const LEGACY_TO_MVP = { agency: 'pro', trial: 'free' }

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
 * @param {string} feature — 'reports' | 'deep_chat' | 'pin_to_dashboard' | 'generate_slides'
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
    case 'pin_to_dashboard':
      return features.canPinToDashboard
    case 'generate_slides':
      return features.canGenerateSlides
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
    case 'ai_tokens_per_month':
      return features.maxAiTokensPerMonth
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
    if (quotaType === 'ai_tokens_per_month') {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { data } = await supabase
        .from('ai_usage')
        .select('input_tokens, output_tokens')
        .eq('workspace_id', workspaceId)
        .gte('created_at', startOfMonth)
      let total = 0
      for (const r of data || []) {
        total += (r.input_tokens || 0) + (r.output_tokens || 0)
      }
      return total
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
  const [connectorsQ, insightsQ, aiTokensQ] = await Promise.all([
    checkQuota(workspaceId, 'connectors'),
    checkQuota(workspaceId, 'insights_per_month'),
    checkQuota(workspaceId, 'ai_tokens_per_month'),
  ])
  return {
    plan,
    features: {
      canGenerateReports: PLAN_FEATURES[plan].canGenerateReports,
      canUseDeepChat: PLAN_FEATURES[plan].canUseDeepChat,
      canPinToDashboard: PLAN_FEATURES[plan].canPinToDashboard,
      canGenerateSlides: PLAN_FEATURES[plan].canGenerateSlides,
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
      aiTokensPerMonth: {
        current: aiTokensQ.current,
        limit: aiTokensQ.limit === Infinity ? null : aiTokensQ.limit,
        exceeded: aiTokensQ.exceeded,
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
