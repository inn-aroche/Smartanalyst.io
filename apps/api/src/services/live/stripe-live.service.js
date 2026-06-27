// Stripe live queries — charges, subscriptions, customers, invoices.

const { getActiveConnector } = require('./connector-resolver.service')
const { cachedQuery } = require('./live-cache.service')
const { logger } = require('../../lib/logger')

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const PAGE_SIZE = 100
const MAX_PAGES = 5

const ALLOWED_ENTITIES = new Set([
  'subscriptions',
  'customers',
  'charges',
  'invoices',
  'refunds',
  'balance_transactions',
])

async function stripeGet(apiKey, endpoint, params = {}) {
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
    const text = await response.text().catch(() => '')
    const err = new Error(`Stripe API (${response.status}): ${text.slice(0, 300)}`)
    err.statusCode = response.status
    throw err
  }
  return response.json()
}

async function stripeFetchAll(apiKey, endpoint, params = {}, maxItems = 25) {
  const all = []
  let startingAfter = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = { limit: Math.min(PAGE_SIZE, maxItems - all.length), ...params }
    if (startingAfter) query.starting_after = startingAfter
    const result = await stripeGet(apiKey, endpoint, query)
    const items = result.data || []
    if (items.length === 0) break
    all.push(...items)
    if (all.length >= maxItems || !result.has_more) break
    startingAfter = items[items.length - 1].id
  }
  return all.slice(0, maxItems)
}

function unixToDate(ts) {
  if (!Number.isFinite(ts)) return null
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function summarizeEntity(entity, items) {
  switch (entity) {
    case 'subscriptions':
      return items.map((s) => ({
        id: s.id,
        status: s.status,
        plan: s.plan?.nickname || s.plan?.id || null,
        amount: s.plan?.amount ? s.plan.amount / 100 : null,
        interval: s.plan?.interval || null,
        customer: typeof s.customer === 'string' ? s.customer : s.customer?.id,
        created: unixToDate(s.created),
        current_period_end: unixToDate(s.current_period_end),
      }))
    case 'charges':
      return items.map((c) => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        paid: c.paid,
        customer: typeof c.customer === 'string' ? c.customer : c.customer?.id,
        created: unixToDate(c.created),
        description: (c.description || '').slice(0, 80),
      }))
    case 'customers':
      return items.map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        created: unixToDate(c.created),
        subscriptions_count: c.subscriptions?.total_count ?? null,
      }))
    case 'invoices':
      return items.map((i) => ({
        id: i.id,
        amount_due: i.amount_due / 100,
        amount_paid: i.amount_paid / 100,
        status: i.status,
        customer: typeof i.customer === 'string' ? i.customer : i.customer?.id,
        created: unixToDate(i.created),
      }))
    case 'refunds':
      return items.map((r) => ({
        id: r.id,
        amount: r.amount / 100,
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        created: unixToDate(r.created),
      }))
    case 'balance_transactions':
      return items.map((bt) => ({
        id: bt.id,
        amount: bt.amount / 100,
        fee: bt.fee / 100,
        net: bt.net / 100,
        type: bt.type,
        created: unixToDate(bt.created),
      }))
    default:
      return items
  }
}

async function queryStripe({ workspaceId, entity, dateRange, filters, limit }) {
  const params = { entity, dateRange, filters, limit }

  return cachedQuery(workspaceId, 'stripe', params, async () => {
    const conn = await getActiveConnector(workspaceId, 'stripe')
    if (!conn) return { error: 'no_connector', message: 'Aucun connecteur Stripe actif.' }

    const safeEntity = ALLOWED_ENTITIES.has(entity) ? entity : 'charges'
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25)

    const apiParams = {}
    if (dateRange) {
      if (dateRange.startDate) {
        const d = new Date(dateRange.startDate)
        if (!isNaN(d)) apiParams['created[gte]'] = Math.floor(d.getTime() / 1000)
      }
      if (dateRange.endDate) {
        const d = new Date(dateRange.endDate + 'T23:59:59Z')
        if (!isNaN(d)) apiParams['created[lte]'] = Math.floor(d.getTime() / 1000)
      }
      if (dateRange.days) {
        const days = Math.min(Math.max(Number(dateRange.days), 1), 90)
        apiParams['created[gte]'] = Math.floor((Date.now() - days * 86_400_000) / 1000)
      }
    }
    if (filters?.status) apiParams.status = filters.status

    let items
    try {
      items = await stripeFetchAll(conn.accessToken, `/${safeEntity}`, apiParams, safeLimit)
    } catch (err) {
      logger.warn({ event: 'stripe_live_fetch_failed', workspaceId, error: err.message })
      return { error: 'api_error', message: err.message }
    }

    const rows = summarizeEntity(safeEntity, items)
    return {
      source: 'stripe',
      entity: safeEntity,
      row_count: rows.length,
      rows,
    }
  })
}

module.exports = { queryStripe, ALLOWED_ENTITIES }
