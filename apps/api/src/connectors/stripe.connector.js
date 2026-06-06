// Stripe connector.
//
// Source: docs/13_CONNECTOR_STRIPE.md, docs/14b §"stripe" mappings
//
// Auth: API key (Bearer secret_key). Pas d'OAuth, pas de refresh.
// API:  https://api.stripe.com/v1 (REST, pagination cursor-based via starting_after).
//
// Stratégie de métriques (Stripe ne fournit pas MRR/churn natif, on calcule):
//   - MRR : sum(active subscriptions normalisés en montant mensuel) — snapshot à endDate
//   - ARR : MRR * 12 — snapshot à endDate
//   - active_customers : count(distinct customers ayant ≥ 1 sub active) — snapshot
//   - new_customers/jour : customers.created dans le range, groupés par date
//   - failed_payments/jour : charges status=failed dans le range, groupés par date
//
// Hors scope MVP (nécessite cohort historique):
//   - churn_rate (besoin état des subs N jours avant)
//   - LTV (besoin historique complet par client)

const BaseConnector = require('./base.connector')
const { logger } = require('../lib/logger')
const vault = require('../lib/vault')
const { mapToCanonical } = require('./canonical-metrics-mapping')

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const PAGE_SIZE = 100 // max Stripe = 100
const MAX_PAGES = 50 // sécurité anti-runaway (= 5000 items max par appel)

// Sécurité: ne stocker QUE des clés "restricted" en prod (rak_xxx). On accepte
// quand même sk_* pour la flexibilité dev. La validation regex est dans le service.
const STRIPE_KEY_PATTERN = /^(sk_(test|live)_|rk_(test|live)_)[A-Za-z0-9]+$/

class StripeConnector extends BaseConnector {
  // ━━━ helpers HTTP ━━━

  async _getApiKey() {
    const key = await vault.decrypt(this.connector.access_token, {
      secretType: 'connector_api_key',
      field: 'access_token',
      workspaceId: this.connector.workspace_id,
      connectorId: this.connector.id,
      source: 'stripe',
    })
    if (!key) {
      const err = new Error('Stripe API key missing')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }
    return key
  }

  async _stripeGet(endpoint, params = {}) {
    const apiKey = await this._getApiKey()
    const url = new URL(`${STRIPE_API_BASE}${endpoint}`)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Stripe-Version': '2024-06-20',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      const err = new Error(`Stripe API error (${response.status}): ${text.slice(0, 500)}`)
      err.statusCode = response.status
      err.code = response.status === 401 ? 'INVALID_CREDENTIALS' : 'API_ERROR'
      throw err
    }
    return response.json()
  }

  async _stripeFetchAll(endpoint, params = {}) {
    const all = []
    let startingAfter = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = { limit: PAGE_SIZE, ...params }
      if (startingAfter) query.starting_after = startingAfter
      const result = await this._stripeGet(endpoint, query)
      const items = result.data || []
      if (items.length === 0) break
      all.push(...items)
      if (!result.has_more) break
      startingAfter = items[items.length - 1].id
    }
    return all
  }

  // ━━━ contrat BaseConnector ━━━

  async fetchData({ startDate, endDate }) {
    const startTs = isoDateToUnix(startDate, 'start')
    const endTs = isoDateToUnix(endDate, 'end')

    // Snapshot subscriptions actives (pas de range temporel — état courant)
    // expand[]=data.items.data.price pour avoir les montants directement
    const [activeSubs, newCustomers, charges] = await Promise.all([
      this._stripeFetchAll('/subscriptions', {
        status: 'active',
        'expand[]': 'data.items.data.price',
      }),
      this._stripeFetchAll('/customers', {
        'created[gte]': startTs,
        'created[lte]': endTs,
      }),
      this._stripeFetchAll('/charges', {
        'created[gte]': startTs,
        'created[lte]': endTs,
      }),
    ])

    return { activeSubs, newCustomers, charges, startDate, endDate }
  }

  async normalizeData(raw) {
    const { activeSubs, newCustomers, charges, endDate } = raw
    const metrics = []

    // ━━━ 1. MRR snapshot (sum subs actives normalisées en mensuel) ━━━
    let mrrCents = 0
    for (const sub of activeSubs) {
      if (sub.status !== 'active') continue
      for (const item of sub.items?.data || []) {
        mrrCents += priceToMonthlyCents(item.price, item.quantity || 1)
      }
    }
    const mrr = mrrCents / 100
    pushMetric(metrics, 'mrr', endDate, mrr)
    pushMetric(metrics, 'arr', endDate, mrr * 12)

    // ━━━ 2. Active customers (distinct customer_id sur subs actives) ━━━
    const activeCustomerIds = new Set()
    for (const sub of activeSubs) {
      if (sub.customer) activeCustomerIds.add(typeof sub.customer === 'string' ? sub.customer : sub.customer.id)
    }
    pushMetric(metrics, 'activeCustomers', endDate, activeCustomerIds.size)

    // ━━━ 3. New customers per day (created dans range) ━━━
    const newByDate = groupCountByDate(newCustomers, (c) => unixToIsoDate(c.created))
    for (const [date, count] of newByDate) {
      pushMetric(metrics, 'newCustomers', date, count)
    }

    // ━━━ 4. Failed payments per day ━━━
    const failed = charges.filter((c) => c.status === 'failed' || c.paid === false)
    const failedByDate = groupCountByDate(failed, (c) => unixToIsoDate(c.created))
    for (const [date, count] of failedByDate) {
      pushMetric(metrics, 'failedPayments', date, count)
    }

    return { metrics }
  }

  async testConnection() {
    try {
      await this._stripeGet('/balance')
      return true
    } catch (err) {
      logger.warn(
        {
          event: 'stripe_test_connection_failed',
          connectorId: this.connector.id,
          error: err.message,
          code: err.code,
        },
        'Stripe testConnection failed',
      )
      return false
    }
  }

  // Pas d'OAuth → pas de refresh. BaseConnector.refreshTokenIfNeeded() skip
  // automatiquement quand token_expires_at est null (toujours le cas pour Stripe).
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers (exportés pour les tests unitaires)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Convertit un Stripe Price (recurring) en montant mensuel en cents.
 * Supporte day / week / month / year + interval_count.
 *
 * @param {Object} price - Stripe Price object (avec recurring.interval, unit_amount)
 * @param {number} quantity
 * @returns {number} cents/mois (peut être fractionnaire si week/year)
 */
function priceToMonthlyCents(price, quantity = 1) {
  if (!price || !price.recurring) return 0
  const unitAmount = price.unit_amount || 0
  const { interval, interval_count: intervalCount = 1 } = price.recurring
  let perMonth
  switch (interval) {
    case 'month':
      perMonth = unitAmount / intervalCount
      break
    case 'year':
      perMonth = unitAmount / (12 * intervalCount)
      break
    case 'week':
      perMonth = (unitAmount * (365.25 / 12 / 7)) / intervalCount // ≈ 4.348
      break
    case 'day':
      perMonth = (unitAmount * (365.25 / 12)) / intervalCount // ≈ 30.44
      break
    default:
      perMonth = 0
  }
  return perMonth * quantity
}

/**
 * Stripe `created` est un Unix timestamp (seconds). On le convertit en 'YYYY-MM-DD' UTC.
 */
function unixToIsoDate(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) return null
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

/**
 * Convertit "YYYY-MM-DD" en timestamp Unix (seconds, UTC).
 * mode='start' → 00:00:00 UTC ce jour-là ; mode='end' → 23:59:59 UTC.
 */
function isoDateToUnix(iso, mode = 'start') {
  const [y, m, d] = iso.split('-').map(Number)
  const ms = mode === 'end'
    ? Date.UTC(y, m - 1, d, 23, 59, 59)
    : Date.UTC(y, m - 1, d, 0, 0, 0)
  return Math.floor(ms / 1000)
}

/**
 * Groupe une liste d'items par date (Map<dateString, count>).
 * @param {Array} items
 * @param {(item: any) => string|null} dateExtractor
 * @returns {Map<string, number>}
 */
function groupCountByDate(items, dateExtractor) {
  const counts = new Map()
  for (const item of items) {
    const date = dateExtractor(item)
    if (!date) continue
    counts.set(date, (counts.get(date) || 0) + 1)
  }
  return counts
}

function pushMetric(metrics, stripeKey, date, value) {
  const mapping = mapToCanonical('stripe', stripeKey)
  if (!mapping) return // ne devrait jamais arriver (toutes les clés sont mappées)
  if (!Number.isFinite(value)) return
  metrics.push({
    date,
    metricKey: mapping.canonicalKey,
    metricValue: value,
    confidenceScore: mapping.confidenceDefault,
  })
}

module.exports = StripeConnector
// Exports pour tests:
module.exports.priceToMonthlyCents = priceToMonthlyCents
module.exports.unixToIsoDate = unixToIsoDate
module.exports.isoDateToUnix = isoDateToUnix
module.exports.groupCountByDate = groupCountByDate
module.exports.STRIPE_KEY_PATTERN = STRIPE_KEY_PATTERN
