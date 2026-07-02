// Google Search Console connector (brief V2 §3.7A P1).
//
// Auth   : OAuth 2.0 Google (scope webmasters.readonly)
// API    : Search Analytics API — POST /webmasters/v3/sites/{siteUrl}/searchAnalytics/query
// Refresh: oauth2.googleapis.com/token (même flow que GA4)
//
// account_id stocké = URL du site (ex: "https://m2benergy.be/") car GSC
// indexe par site. Le resolver (account-resolver.service) pickera le 1er
// site validé par l'utilisateur.

const BaseConnector = require('./base.connector')
const { logger } = require('../lib/logger')
const vault = require('../lib/vault')
const { mapToCanonical } = require('./canonical-metrics-mapping')
const oauthGeneric = require('../services/auth/oauth-generic.service')
const { getServiceRoleClient } = require('../lib/supabase')
const { fetchWithRetry } = require('../lib/fetch-retry')

const GSC_API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3'

// On agrège par date (dimension unique) → ça donne une série temporelle
// avec clicks, impressions, ctr, position.
class SearchConsoleConnector extends BaseConnector {
  async fetchData({ startDate, endDate }) {
    const accessToken = await vault.decrypt(this.connector.access_token, {
      secretType: 'connector_oauth_token',
      field: 'access_token',
      workspaceId: this.connector.workspace_id,
      connectorId: this.connector.id,
      source: 'search_console',
    })
    if (!accessToken) {
      const err = new Error('Search Console access token missing')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }

    const siteUrl = this.connector.account_id
    if (!siteUrl) {
      const err = new Error('Search Console site URL missing on connector record')
      err.code = 'INVALID_CONNECTOR'
      throw err
    }

    const url = `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
    const body = {
      startDate,
      endDate,
      dimensions: ['date'],
      rowLimit: 5000,
    }

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      { label: 'gsc:searchAnalytics' },
    )

    if (!response.ok) {
      const text = await response.text()
      const err = new Error(`Search Console API error (${response.status}): ${text.slice(0, 400)}`)
      err.statusCode = response.status
      err.code = response.status === 401 ? 'INVALID_CREDENTIALS' : 'API_ERROR'
      throw err
    }

    return response.json()
  }

  /**
   * GSC renvoie : { rows: [{ keys: ['YYYY-MM-DD'], clicks, impressions, ctr, position }] }
   * On émet 4 metrics par row (clicks/impressions/ctr/position).
   */
  async normalizeData(rawData) {
    const metrics = []
    const fields = ['clicks', 'impressions', 'ctr', 'position']

    for (const row of rawData.rows || []) {
      const date = row.keys?.[0]
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

      for (const field of fields) {
        const mapping = mapToCanonical('search_console', field)
        if (!mapping) continue
        const value = row[field]
        if (typeof value !== 'number' || !Number.isFinite(value)) continue
        metrics.push({
          date,
          metricKey: mapping.canonicalKey,
          metricValue: value,
          confidenceScore: mapping.confidenceDefault,
        })
      }
    }

    return { metrics }
  }

  async testConnection() {
    try {
      const today = new Date()
      const yesterday = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      await this.fetchData({ startDate: fmt(yesterday), endDate: fmt(today) })
      return true
    } catch (err) {
      logger.warn(
        {
          event: 'search_console_test_connection_failed',
          connectorId: this.connector.id,
          error: err.message,
          code: err.code,
        },
        'Search Console testConnection failed',
      )
      return false
    }
  }

  async _doRefresh() {
    const ctx = {
      secretType: 'connector_oauth_token',
      workspaceId: this.connector.workspace_id,
      connectorId: this.connector.id,
      source: 'search_console',
    }
    const refreshToken = await vault.decrypt(this.connector.refresh_token, {
      ...ctx,
      field: 'refresh_token',
    })
    if (!refreshToken) {
      const err = new Error('Search Console refresh token missing — user must reauthorize')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }

    const { accessToken, expiresIn } = await oauthGeneric.refreshAccessToken({
      source: 'search_console',
      refreshToken,
    })

    const encryptedAccess = await vault.encrypt(accessToken, { ...ctx, field: 'access_token' })
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    const supabase = getServiceRoleClient()
    const { error } = await supabase
      .from('connectors')
      .update({
        access_token: encryptedAccess,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.connector.id)
    if (error) throw error

    this.connector.access_token = encryptedAccess
    this.connector.token_expires_at = expiresAt
  }
}

module.exports = SearchConsoleConnector
