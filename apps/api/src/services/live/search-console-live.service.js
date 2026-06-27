// Search Console live queries — mots-clés, pages, pays, devices.

const { getActiveConnector } = require('./connector-resolver.service')
const { cachedQuery } = require('./live-cache.service')
const { logger } = require('../../lib/logger')

const GSC_API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3'

const ALLOWED_DIMENSIONS = new Set(['date', 'query', 'page', 'country', 'device'])

async function querySearchConsole({ workspaceId, dimensions, dateRange, dimensionFilter, limit }) {
  const params = { dimensions, dateRange, dimensionFilter, limit }

  return cachedQuery(workspaceId, 'search_console', params, async () => {
    const conn = await getActiveConnector(workspaceId, 'search_console')
    if (!conn) return { error: 'no_connector', message: 'Aucun connecteur Search Console actif.' }

    const safeDimensions = Array.isArray(dimensions)
      ? dimensions.filter((d) => ALLOWED_DIMENSIONS.has(d)).slice(0, 4)
      : ['query']
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25)

    let startDate, endDate
    if (dateRange?.startDate && dateRange?.endDate) {
      startDate = dateRange.startDate
      endDate = dateRange.endDate
    } else {
      const days = Math.min(Math.max(Number(dateRange?.days) || 28, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86_400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      startDate = fmt(start)
      endDate = fmt(end)
    }

    const siteUrl = conn.accountId
    const url = `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

    const body = {
      startDate,
      endDate,
      dimensions: safeDimensions,
      rowLimit: safeLimit,
    }

    if (dimensionFilter?.dimension && dimensionFilter?.expression) {
      body.dimensionFilterGroups = [
        {
          filters: [
            {
              dimension: dimensionFilter.dimension,
              operator: dimensionFilter.operator || 'contains',
              expression: dimensionFilter.expression,
            },
          ],
        },
      ]
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
      logger.warn({ event: 'gsc_live_fetch_failed', workspaceId, error: err.message })
      return { error: 'fetch_failed', message: err.message }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      logger.warn({
        event: 'gsc_live_api_error',
        workspaceId,
        status: response.status,
        body: text.slice(0, 200),
      })
      return { error: 'api_error', status: response.status, message: text.slice(0, 200) }
    }

    const data = await response.json()
    const rows = (data.rows || []).map((row) => {
      const entry = {}
      for (let i = 0; i < safeDimensions.length; i++) {
        entry[safeDimensions[i]] = row.keys?.[i] || ''
      }
      entry.clicks = row.clicks || 0
      entry.impressions = row.impressions || 0
      entry.ctr = Math.round((row.ctr || 0) * 10000) / 100
      entry.position = Math.round((row.position || 0) * 10) / 10
      return entry
    })

    return {
      source: 'search_console',
      dateRange: { startDate, endDate },
      dimensions: safeDimensions,
      row_count: rows.length,
      rows,
    }
  })
}

module.exports = { querySearchConsole, ALLOWED_DIMENSIONS }
