// Shopify connector.
//
// Auth: OAuth 2.0 sur sub-domaine boutique ({shop}.myshopify.com).
//       Le token offline ne change pas tant que l'utilisateur ne révoque
//       pas l'app — pas de refresh.
// API:  Admin REST 2025-01 (https://{shop}.myshopify.com/admin/api/2025-01/)
// Stockage: `connectors.account_id` = sub-domaine boutique ('maboutique'),
//           sans suffixe .myshopify.com.
//
// Métriques produites (cf. canonical-metrics-mapping):
//   - revenue       : somme `total_price` des orders par jour
//   - orders        : count orders par jour
//   - aov           : panier moyen (revenue / orders) par jour
//   - newCustomers  : count `customers` créés dans la période, par jour
//   - refunds       : somme `total_refunded` des orders refundés, par jour

const BaseConnector = require('./base.connector')
const { logger } = require('../lib/logger')
const vault = require('../lib/vault')
const { mapToCanonical } = require('./canonical-metrics-mapping')

const SHOPIFY_API_VERSION = '2025-01'
const PAGE_SIZE = 250 // max Shopify
const MAX_PAGES = 50 // sécurité anti-runaway

class ShopifyConnector extends BaseConnector {
  _shopBase() {
    const shop = this.connector.account_id
    if (!shop) {
      const err = new Error('Shopify shop subdomain missing on connector record')
      err.code = 'INVALID_CONNECTOR'
      throw err
    }
    return `https://${shop}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`
  }

  async _getAccessToken() {
    const token = await vault.decrypt(this.connector.access_token, {
      secretType: 'connector_oauth_token',
      field: 'access_token',
      workspaceId: this.connector.workspace_id,
      connectorId: this.connector.id,
      source: 'shopify',
    })
    if (!token) {
      const err = new Error('Shopify access token missing')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }
    return token
  }

  async _shopifyGet(path, params = {}) {
    const token = await this._getAccessToken()
    const url = new URL(`${this._shopBase()}${path}`)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      const err = new Error(`Shopify API error (${response.status}): ${text.slice(0, 500)}`)
      err.statusCode = response.status
      err.code = response.status === 401 ? 'INVALID_CREDENTIALS' : 'API_ERROR'
      throw err
    }
    // Shopify pagination utilise le header Link (rel=next) avec le cursor
    // page_info — on retourne les deux pour que _fetchAll() chaîne.
    return { body: await response.json(), linkHeader: response.headers.get('link') }
  }

  /**
   * Cursor-based pagination Shopify : suit le rel="next" du header Link.
   */
  async _shopifyFetchAll(path, params = {}) {
    const items = []
    let next = { path, params }
    for (let page = 0; page < MAX_PAGES; page++) {
      const { body, linkHeader } = await this._shopifyGet(next.path, next.params)
      // Le body est { orders: [...] } ou { customers: [...] } — on prend la 1re clé tableau
      const arr = Object.values(body).find((v) => Array.isArray(v)) || []
      if (arr.length === 0) break
      items.push(...arr)
      const nextUrl = _parseLinkNext(linkHeader)
      if (!nextUrl) break
      // Repart avec le cursor — on garde le path mais on extrait juste page_info+limit
      const url = new URL(nextUrl)
      const newParams = {}
      url.searchParams.forEach((v, k) => {
        newParams[k] = v
      })
      next = { path, params: newParams }
    }
    return items
  }

  // ━━━ contrat BaseConnector ━━━

  async fetchData({ startDate, endDate }) {
    // Orders : on prend toutes les commandes créées dans la période
    // (statut=any car on veut inclure les annulées/refundées pour le refund count).
    const [orders, customers] = await Promise.all([
      this._shopifyFetchAll('/orders.json', {
        status: 'any',
        created_at_min: `${startDate}T00:00:00Z`,
        created_at_max: `${endDate}T23:59:59Z`,
        limit: PAGE_SIZE,
      }),
      this._shopifyFetchAll('/customers.json', {
        created_at_min: `${startDate}T00:00:00Z`,
        created_at_max: `${endDate}T23:59:59Z`,
        limit: PAGE_SIZE,
      }),
    ])
    return { orders, customers }
  }

  async normalizeData(raw) {
    const { orders, customers } = raw
    const metrics = []

    // ━━━ Agrégations par jour ━━━
    const revenueByDate = new Map() // jour → CA cumulé
    const ordersByDate = new Map() // jour → count
    const refundsByDate = new Map() // jour → CA refundé cumulé

    for (const order of orders) {
      const date = _isoDate(order.created_at)
      if (!date) continue

      const total = parseFloat(order.total_price || '0')
      if (Number.isFinite(total)) {
        revenueByDate.set(date, (revenueByDate.get(date) || 0) + total)
      }
      ordersByDate.set(date, (ordersByDate.get(date) || 0) + 1)

      const refunded = parseFloat(order.total_refunded || '0')
      if (Number.isFinite(refunded) && refunded > 0) {
        refundsByDate.set(date, (refundsByDate.get(date) || 0) + refunded)
      }
    }

    const newCustomersByDate = new Map()
    for (const c of customers) {
      const date = _isoDate(c.created_at)
      if (!date) continue
      newCustomersByDate.set(date, (newCustomersByDate.get(date) || 0) + 1)
    }

    // ━━━ Push canonical metrics ━━━
    for (const [date, value] of revenueByDate) _push(metrics, 'revenue', date, value)
    for (const [date, value] of ordersByDate) _push(metrics, 'orders', date, value)
    for (const [date, value] of newCustomersByDate) _push(metrics, 'newCustomers', date, value)
    for (const [date, value] of refundsByDate) _push(metrics, 'refunds', date, value)

    // AOV = revenue / orders (par jour)
    for (const [date, revenue] of revenueByDate) {
      const count = ordersByDate.get(date) || 0
      if (count === 0) continue
      _push(metrics, 'aov', date, revenue / count)
    }

    return { metrics }
  }

  async testConnection() {
    try {
      // Endpoint léger : juste les infos de la boutique
      await this._shopifyGet('/shop.json')
      return true
    } catch (err) {
      logger.warn(
        {
          event: 'shopify_test_connection_failed',
          connectorId: this.connector.id,
          error: err.message,
          code: err.code,
        },
        'Shopify testConnection failed',
      )
      return false
    }
  }

  // Shopify offline tokens ne périment pas tant que l'utilisateur ne révoque
  // pas l'app. BaseConnector.refreshTokenIfNeeded() skip si token_expires_at
  // est null (cas attendu pour Shopify).
}

// ━━━ helpers ━━━

function _isoDate(timestamp) {
  if (!timestamp) return null
  return String(timestamp).slice(0, 10) // 'YYYY-MM-DD' depuis 'YYYY-MM-DDTHH:MM:SSZ'
}

function _push(metrics, sourceKey, date, value) {
  const mapping = mapToCanonical('shopify', sourceKey)
  if (!mapping || !Number.isFinite(value)) return
  metrics.push({
    date,
    metricKey: mapping.canonicalKey,
    metricValue: value,
    confidenceScore: mapping.confidenceDefault,
  })
}

/**
 * Parse le header Link de Shopify pour récupérer l'URL rel="next".
 * Format: '<https://...?page_info=xxx&limit=250>; rel="next"'
 */
function _parseLinkNext(linkHeader) {
  if (!linkHeader) return null
  const parts = linkHeader.split(',')
  for (const part of parts) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

module.exports = ShopifyConnector
module.exports._parseLinkNext = _parseLinkNext
module.exports._isoDate = _isoDate
