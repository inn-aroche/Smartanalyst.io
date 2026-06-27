// GA4 live queries — requêtes ad-hoc avec métriques + dimensions arbitraires.
//
// Remplace l'ancien ga4-live.service.js (un seul endpoint traffic sources)
// par un service générique. L'IA compose la requête selon la question user.

const { getActiveConnector } = require('./connector-resolver.service')
const { cachedQuery } = require('./live-cache.service')
const { logger } = require('../../lib/logger')

const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta'

const ALLOWED_METRICS = new Set([
  'sessions',
  'activeUsers',
  'newUsers',
  'totalUsers',
  'conversions',
  'totalRevenue',
  'ecommercePurchases',
  'bounceRate',
  'averageSessionDuration',
  'engagedSessions',
  'screenPageViews',
  'screenPageViewsPerSession',
  'eventCount',
  'userEngagementDuration',
  'engagementRate',
  'addToCarts',
  'checkouts',
  'itemRevenue',
])

const ALLOWED_DIMENSIONS = new Set([
  'date',
  'sessionSource',
  'sessionMedium',
  'sessionDefaultChannelGroup',
  'sessionCampaignName',
  'firstUserSource',
  'firstUserMedium',
  'firstUserCampaignName',
  'pagePath',
  'pageTitle',
  'landingPage',
  'unifiedScreenName',
  'deviceCategory',
  'operatingSystem',
  'browser',
  'country',
  'city',
  'region',
  'newVsReturning',
])

function sanitizeList(arr, allowed, fallback) {
  if (!Array.isArray(arr) || arr.length === 0) return fallback
  return arr.filter((v) => allowed.has(v)).slice(0, 6)
}

function buildDateRange(dateRange) {
  if (dateRange?.startDate && dateRange?.endDate) {
    return { startDate: dateRange.startDate, endDate: dateRange.endDate }
  }
  const days = Math.min(Math.max(Number(dateRange?.days) || 7, 1), 90)
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { startDate: fmt(start), endDate: fmt(end) }
}

async function queryGA4({ workspaceId, metrics, dimensions, dateRange, dimensionFilter, limit }) {
  const params = { metrics, dimensions, dateRange, dimensionFilter, limit }

  return cachedQuery(workspaceId, 'ga4', params, async () => {
    const conn = await getActiveConnector(workspaceId, 'ga4')
    if (!conn) return { error: 'no_connector', message: 'Aucun connecteur GA4 actif.' }

    const safeMetrics = sanitizeList(metrics, ALLOWED_METRICS, ['sessions', 'activeUsers'])
    const safeDimensions = sanitizeList(dimensions, ALLOWED_DIMENSIONS, [])
    const range = buildDateRange(dateRange)
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25)

    const propertyPath = conn.accountId.startsWith('properties/')
      ? conn.accountId
      : `properties/${conn.accountId}`
    const url = `${GA4_API_BASE}/${propertyPath}:runReport`

    const body = {
      dateRanges: [range],
      metrics: safeMetrics.map((name) => ({ name })),
      limit: String(safeLimit),
    }
    if (safeDimensions.length > 0) {
      body.dimensions = safeDimensions.map((name) => ({ name }))
      body.orderBys = [{ metric: { metricName: safeMetrics[0] }, desc: true }]
    }
    if (dimensionFilter?.dimension && dimensionFilter?.value) {
      body.dimensionFilter = {
        filter: {
          fieldName: dimensionFilter.dimension,
          stringFilter: {
            matchType: dimensionFilter.matchType || 'CONTAINS',
            value: dimensionFilter.value,
            caseSensitive: false,
          },
        },
      }
    }

    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      logger.warn({ event: 'ga4_live_fetch_failed', workspaceId, error: err.message })
      return { error: 'fetch_failed', message: err.message }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      logger.warn({
        event: 'ga4_live_api_error',
        workspaceId,
        status: response.status,
        body: text.slice(0, 200),
      })
      return { error: 'api_error', status: response.status, message: text.slice(0, 200) }
    }

    const data = await response.json()
    const metricHeaders = (data.metricHeaders || []).map((h) => h.name)
    const dimHeaders = (data.dimensionHeaders || []).map((h) => h.name)

    const rows = (data.rows || []).map((row) => {
      const entry = {}
      for (let i = 0; i < dimHeaders.length; i++) {
        entry[dimHeaders[i]] = row.dimensionValues?.[i]?.value || ''
      }
      for (let i = 0; i < metricHeaders.length; i++) {
        entry[metricHeaders[i]] = Number(row.metricValues?.[i]?.value || 0)
      }
      return entry
    })

    return {
      source: 'ga4',
      dateRange: range,
      metrics: safeMetrics,
      dimensions: safeDimensions,
      row_count: rows.length,
      rows,
    }
  })
}

async function getTrafficSources({ workspaceId, days = 7 }) {
  const result = await queryGA4({
    workspaceId,
    metrics: ['sessions', 'activeUsers', 'conversions'],
    dimensions: ['sessionDefaultChannelGroup'],
    dateRange: { days },
    limit: 10,
  })
  if (result?.error) return null
  const channels = (result.rows || []).map((r) => ({
    channel: r.sessionDefaultChannelGroup || 'unknown',
    sessions: r.sessions || 0,
    users: r.activeUsers || 0,
    conversions: r.conversions || 0,
  }))
  const total = channels.reduce((s, c) => s + c.sessions, 0)
  return { channels, total, days }
}

module.exports = { queryGA4, getTrafficSources, ALLOWED_METRICS, ALLOWED_DIMENSIONS }
