// Meta Ads live queries — breakdowns par campagne, audience, plateforme.

const { getActiveConnector } = require('./connector-resolver.service')
const { cachedQuery } = require('./live-cache.service')
const { logger } = require('../../lib/logger')

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

const ALLOWED_FIELDS = new Set([
  'spend',
  'impressions',
  'clicks',
  'cpc',
  'cpm',
  'cpp',
  'reach',
  'frequency',
  'actions',
  'action_values',
  'cost_per_action_type',
  'cost_per_unique_click',
  'unique_clicks',
  'unique_impressions',
  'campaign_name',
  'adset_name',
  'ad_name',
])

const ALLOWED_BREAKDOWNS = new Set([
  'age',
  'gender',
  'publisher_platform',
  'device_platform',
  'platform_position',
  'country',
  'region',
])

const ALLOWED_LEVELS = new Set(['account', 'campaign', 'adset', 'ad'])

function buildDateRange(dateRange) {
  if (dateRange?.startDate && dateRange?.endDate) {
    return { since: dateRange.startDate, until: dateRange.endDate }
  }
  const days = Math.min(Math.max(Number(dateRange?.days) || 7, 1), 90)
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { since: fmt(start), until: fmt(end) }
}

async function queryMetaAds({ workspaceId, metrics, breakdowns, dateRange, level, limit }) {
  const params = { metrics, breakdowns, dateRange, level, limit }

  return cachedQuery(workspaceId, 'meta_ads', params, async () => {
    const conn = await getActiveConnector(workspaceId, 'meta_ads')
    if (!conn) return { error: 'no_connector', message: 'Aucun connecteur Meta Ads actif.' }

    const adAccountId = conn.accountId.startsWith('act_') ? conn.accountId : `act_${conn.accountId}`

    const safeLevel = ALLOWED_LEVELS.has(level) ? level : 'account'
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25)

    const baseFields = ['spend', 'impressions', 'clicks']
    const requestedFields = Array.isArray(metrics)
      ? metrics.filter((f) => ALLOWED_FIELDS.has(f))
      : []
    const fields = [...new Set([...baseFields, ...requestedFields])]

    if (safeLevel === 'campaign') fields.push('campaign_name')
    if (safeLevel === 'adset') fields.push('campaign_name', 'adset_name')
    if (safeLevel === 'ad') fields.push('campaign_name', 'adset_name', 'ad_name')

    const range = buildDateRange(dateRange)

    const url = new URL(`${META_API_BASE}/${adAccountId}/insights`)
    url.searchParams.set('fields', [...new Set(fields)].join(','))
    url.searchParams.set('time_range', JSON.stringify(range))
    url.searchParams.set('level', safeLevel)
    url.searchParams.set('limit', String(safeLimit))
    url.searchParams.set('access_token', conn.accessToken)

    if (Array.isArray(breakdowns) && breakdowns.length > 0) {
      const safe = breakdowns.filter((b) => ALLOWED_BREAKDOWNS.has(b))
      if (safe.length > 0) url.searchParams.set('breakdowns', safe.join(','))
    }

    let response
    try {
      response = await fetch(url.toString(), { method: 'GET' })
    } catch (err) {
      logger.warn({ event: 'meta_live_fetch_failed', workspaceId, error: err.message })
      return { error: 'fetch_failed', message: err.message }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      logger.warn({
        event: 'meta_live_api_error',
        workspaceId,
        status: response.status,
        body: text.slice(0, 200),
      })
      return { error: 'api_error', status: response.status, message: text.slice(0, 200) }
    }

    const data = await response.json()
    const rows = (data.data || []).map((row) => {
      const entry = {}
      for (const [k, v] of Object.entries(row)) {
        if (k === 'actions' || k === 'action_values' || k === 'cost_per_action_type') {
          entry[k] = v
        } else if (k !== 'date_start' && k !== 'date_stop') {
          entry[k] = typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v
        }
      }
      entry.date_start = row.date_start
      entry.date_stop = row.date_stop
      return entry
    })

    return {
      source: 'meta_ads',
      dateRange: range,
      level: safeLevel,
      row_count: rows.length,
      rows,
    }
  })
}

module.exports = { queryMetaAds, ALLOWED_FIELDS, ALLOWED_BREAKDOWNS }
