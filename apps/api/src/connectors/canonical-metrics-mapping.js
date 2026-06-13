// Table de mapping universelle: (source, source_key) → canonical metric.
//
// Source: docs/01_CONVENTIONS_GLOBALES.md §6.2, docs/03_ARCHITECTURE_GLOBALE.md §4.2
//
// Règle d'or (docs/03 §4.1 + docs/06 §3): l'IA, le score de santé, les
// rapports, les benchmarks ne lisent JAMAIS la donnée brute d'un connecteur.
// Ils interrogent UNIQUEMENT canonical_metrics (avec metric_key canonique).
//
// Pour ajouter un connecteur:
//   1. Ajouter une entrée dans CANONICAL_METRICS_MAPPING['<source>']
//   2. Implémenter <source>.connector.js qui appelle mapToCanonical() dans normalizeData()
//   3. Pas de nouvelle métrique ailleurs sans passer par ici

/**
 * @typedef {Object} CanonicalMapping
 * @property {string} canonicalKey       - Clé canonique universelle (snake_case)
 * @property {number} confidenceDefault  - 0-100, score de confiance par défaut pour cette source
 * @property {string} [unit]             - Unité (informationnel: 'eur', 'pct', 'count', 'ratio')
 * @property {string} [description]      - Description en français pour la doc générée
 */

/** @type {Record<string, Record<string, CanonicalMapping>>} */
const CANONICAL_METRICS_MAPPING = {
  // ━━━ GA4 (Google Analytics 4) ━━━
  ga4: {
    sessions: { canonicalKey: 'sessions_all', confidenceDefault: 100, unit: 'count' },
    activeUsers: { canonicalKey: 'users_active', confidenceDefault: 100, unit: 'count' },
    newUsers: { canonicalKey: 'users_new', confidenceDefault: 100, unit: 'count' },
    conversions: { canonicalKey: 'conversions_total', confidenceDefault: 100, unit: 'count' },
    totalRevenue: { canonicalKey: 'revenue_from_conversions', confidenceDefault: 95, unit: 'eur' },
    bounceRate: { canonicalKey: 'bounce_rate_all', confidenceDefault: 100, unit: 'ratio' },
    averageSessionDuration: {
      canonicalKey: 'engagement_session_duration',
      confidenceDefault: 100,
      unit: 'seconds',
    },
    screenPageViewsPerSession: {
      canonicalKey: 'engagement_depth',
      confidenceDefault: 100,
      unit: 'ratio',
    },
  },

  // ━━━ Meta Ads (Facebook + Instagram) ━━━
  meta_ads: {
    spend: { canonicalKey: 'spend_paid_social', confidenceDefault: 100, unit: 'eur' },
    impressions: { canonicalKey: 'impressions_paid_social', confidenceDefault: 100, unit: 'count' },
    clicks: { canonicalKey: 'clicks_paid_social', confidenceDefault: 100, unit: 'count' },
    cpc: { canonicalKey: 'cost_per_click_paid', confidenceDefault: 100, unit: 'eur' },
    cpm: { canonicalKey: 'cost_per_mille_paid', confidenceDefault: 100, unit: 'eur' },
    roas: { canonicalKey: 'return_on_investment_paid', confidenceDefault: 95, unit: 'ratio' },
    cpa: { canonicalKey: 'cost_per_acquisition_paid', confidenceDefault: 95, unit: 'eur' },
    actions: { canonicalKey: 'conversions_paid_social', confidenceDefault: 90, unit: 'count' },
  },

  // ━━━ Google Ads ━━━
  google_ads: {
    cost: { canonicalKey: 'spend_paid_search', confidenceDefault: 100, unit: 'eur' },
    impressions: { canonicalKey: 'impressions_paid_search', confidenceDefault: 100, unit: 'count' },
    clicks: { canonicalKey: 'clicks_paid_search', confidenceDefault: 100, unit: 'count' },
    ctr: { canonicalKey: 'click_through_rate_paid', confidenceDefault: 100, unit: 'ratio' },
    averageCpc: { canonicalKey: 'cost_per_click_paid_search', confidenceDefault: 100, unit: 'eur' },
    conversions: { canonicalKey: 'conversions_paid_search', confidenceDefault: 95, unit: 'count' },
    conversionsValue: {
      canonicalKey: 'revenue_paid_search',
      confidenceDefault: 95,
      unit: 'eur',
    },
  },

  // ━━━ Stripe ━━━
  stripe: {
    mrr: { canonicalKey: 'revenue_recurring_monthly', confidenceDefault: 100, unit: 'eur' },
    arr: { canonicalKey: 'revenue_annual_recurring', confidenceDefault: 100, unit: 'eur' },
    churnRate: { canonicalKey: 'churn_rate_subscription', confidenceDefault: 100, unit: 'ratio' },
    ltv: { canonicalKey: 'lifetime_value_customer', confidenceDefault: 95, unit: 'eur' },
    failedPayments: {
      canonicalKey: 'failed_payments_month',
      confidenceDefault: 100,
      unit: 'count',
    },
    activeCustomers: {
      canonicalKey: 'customers_active',
      confidenceDefault: 100,
      unit: 'count',
    },
    newCustomers: {
      canonicalKey: 'customers_new',
      confidenceDefault: 100,
      unit: 'count',
    },
  },

  // ━━━ Shopify ━━━
  shopify: {
    revenue: { canonicalKey: 'revenue_ecommerce', confidenceDefault: 100, unit: 'eur' },
    orders: { canonicalKey: 'orders_count', confidenceDefault: 100, unit: 'count' },
    aov: { canonicalKey: 'order_value_average', confidenceDefault: 100, unit: 'eur' },
    newCustomers: { canonicalKey: 'customers_new', confidenceDefault: 100, unit: 'count' },
    refunds: { canonicalKey: 'refunds_amount', confidenceDefault: 100, unit: 'eur' },
  },

  // ━━━ Search Console ━━━
  search_console: {
    clicks: { canonicalKey: 'clicks_organic_search', confidenceDefault: 100, unit: 'count' },
    impressions: {
      canonicalKey: 'impressions_organic_search',
      confidenceDefault: 100,
      unit: 'count',
    },
    ctr: { canonicalKey: 'click_through_rate_organic', confidenceDefault: 100, unit: 'ratio' },
    position: {
      canonicalKey: 'average_position_organic',
      confidenceDefault: 100,
      unit: 'rank',
    },
  },

  // ━━━ Computed (métriques dérivées calculées par nous) ━━━
  computed: {
    roiTotal: { canonicalKey: 'return_on_investment_total', confidenceDefault: 90, unit: 'ratio' },
    engagementScore: { canonicalKey: 'engagement_score', confidenceDefault: 85, unit: 'score' },
    healthScoreGlobal: { canonicalKey: 'health_score_global', confidenceDefault: 100, unit: 'score' },
  },
}

/**
 * Map a source-specific key to its canonical equivalent.
 * @param {string} source     - 'ga4', 'meta_ads', 'google_ads', 'stripe', 'search_console', 'computed'
 * @param {string} sourceKey  - Clé spécifique à la source (ex: 'sessions' pour GA4)
 * @returns {CanonicalMapping | null} - null si le mapping n'existe pas
 */
function mapToCanonical(source, sourceKey) {
  const sourceMappings = CANONICAL_METRICS_MAPPING[source]
  if (!sourceMappings) return null
  return sourceMappings[sourceKey] || null
}

/**
 * Liste toutes les sources connues.
 * @returns {string[]}
 */
function listSources() {
  return Object.keys(CANONICAL_METRICS_MAPPING)
}

/**
 * Liste toutes les canonical keys disponibles (toutes sources confondues).
 * @returns {string[]}
 */
function listCanonicalKeys() {
  const keys = new Set()
  for (const sourceMappings of Object.values(CANONICAL_METRICS_MAPPING)) {
    for (const mapping of Object.values(sourceMappings)) {
      keys.add(mapping.canonicalKey)
    }
  }
  return Array.from(keys).sort()
}

module.exports = {
  CANONICAL_METRICS_MAPPING,
  mapToCanonical,
  listSources,
  listCanonicalKeys,
}
