// Shopify live queries — commandes, clients, produits.

const { getActiveConnector } = require('./connector-resolver.service')
const { cachedQuery } = require('./live-cache.service')
const { logger } = require('../../lib/logger')

const SHOPIFY_API_VERSION = '2025-01'

const ALLOWED_ENTITIES = new Set(['orders', 'customers', 'products'])

function shopBase(accountId) {
  return `https://${accountId}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`
}

async function shopifyGet(baseUrl, token, path, params = {}) {
  const url = new URL(`${baseUrl}${path}`)
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
    const text = await response.text().catch(() => '')
    const err = new Error(`Shopify API (${response.status}): ${text.slice(0, 300)}`)
    err.statusCode = response.status
    throw err
  }
  return response.json()
}

function summarizeOrders(orders) {
  return orders.map((o) => ({
    id: o.id,
    name: o.name,
    total_price: parseFloat(o.total_price || '0'),
    currency: o.currency,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    items_count: (o.line_items || []).length,
    customer_name: o.customer
      ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim()
      : null,
    created_at: (o.created_at || '').slice(0, 10),
  }))
}

function summarizeProducts(products) {
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    product_type: p.product_type,
    vendor: p.vendor,
    variants_count: (p.variants || []).length,
    price_range: formatPriceRange(p.variants),
    created_at: (p.created_at || '').slice(0, 10),
  }))
}

function formatPriceRange(variants) {
  if (!variants || variants.length === 0) return null
  const prices = variants.map((v) => parseFloat(v.price || '0')).filter(Number.isFinite)
  if (prices.length === 0) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? `${min}` : `${min}–${max}`
}

function summarizeCustomers(customers) {
  return customers.map((c) => ({
    id: c.id,
    email: c.email,
    name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    orders_count: c.orders_count || 0,
    total_spent: c.total_spent ? parseFloat(c.total_spent) : 0,
    created_at: (c.created_at || '').slice(0, 10),
  }))
}

async function queryShopify({ workspaceId, entity, dateRange, filters, limit }) {
  const params = { entity, dateRange, filters, limit }

  return cachedQuery(workspaceId, 'shopify', params, async () => {
    const conn = await getActiveConnector(workspaceId, 'shopify')
    if (!conn) return { error: 'no_connector', message: 'Aucun connecteur Shopify actif.' }

    const base = shopBase(conn.accountId)
    const safeEntity = ALLOWED_ENTITIES.has(entity) ? entity : 'orders'
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25)

    const apiParams = { limit: safeLimit }

    if (dateRange && safeEntity !== 'products') {
      if (dateRange.startDate) apiParams.created_at_min = `${dateRange.startDate}T00:00:00Z`
      if (dateRange.endDate) apiParams.created_at_max = `${dateRange.endDate}T23:59:59Z`
      if (dateRange.days) {
        const days = Math.min(Math.max(Number(dateRange.days), 1), 90)
        const start = new Date(Date.now() - days * 86_400_000)
        apiParams.created_at_min = start.toISOString()
      }
    }

    if (safeEntity === 'orders') {
      apiParams.status = filters?.status || 'any'
      if (filters?.financial_status) apiParams.financial_status = filters.financial_status
      if (filters?.fulfillment_status) apiParams.fulfillment_status = filters.fulfillment_status
    }

    let data
    try {
      data = await shopifyGet(base, conn.accessToken, `/${safeEntity}.json`, apiParams)
    } catch (err) {
      logger.warn({ event: 'shopify_live_fetch_failed', workspaceId, error: err.message })
      return { error: 'api_error', message: err.message }
    }

    const items = data[safeEntity] || []
    let rows
    switch (safeEntity) {
      case 'orders':
        rows = summarizeOrders(items)
        break
      case 'products':
        rows = summarizeProducts(items)
        break
      case 'customers':
        rows = summarizeCustomers(items)
        break
      default:
        rows = items
    }

    return {
      source: 'shopify',
      entity: safeEntity,
      row_count: rows.length,
      rows,
    }
  })
}

module.exports = { queryShopify, ALLOWED_ENTITIES }
