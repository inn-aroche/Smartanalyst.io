// GA4 (Google Analytics 4) connector.
//
// Source: docs/10_CONNECTOR_GA4.md, docs/03_ARCHITECTURE_GLOBALE.md §2.2
//
// Auth: OAuth 2.0 Google (scope analytics.readonly)
// API:  Analytics Data API v1beta — POST properties/{id}:runReport
// Refresh: oauth2.googleapis.com/token

const BaseConnector = require('./base.connector')
const { logger } = require('../lib/logger')
const vault = require('../lib/vault')
const { mapToCanonical } = require('./canonical-metrics-mapping')
const { refreshAccessToken } = require('../services/auth/google-oauth.service')
const { getServiceRoleClient } = require('../lib/supabase')

const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta'

// Métriques GA4 récupérées par défaut.
// Chaque entrée doit avoir un mapping dans canonical-metrics-mapping.js (sinon ignorée).
const GA4_METRICS = [
  'sessions',
  'activeUsers',
  'newUsers',
  'conversions',
  'conversionValue',
  'bounceRate',
  'averageSessionDuration',
  'screenPageViewsPerSession',
]

class GA4Connector extends BaseConnector {
  async fetchData({ startDate, endDate }) {
    const accessToken = await vault.decrypt(this.connector.access_token)
    if (!accessToken) {
      const err = new Error('GA4 access token missing')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }

    const propertyId = this.connector.account_id
    if (!propertyId) {
      const err = new Error('GA4 property ID missing on connector record')
      err.code = 'INVALID_CONNECTOR'
      throw err
    }

    const url = `${GA4_API_BASE}/properties/${propertyId}:runReport`
    const body = {
      dateRanges: [{ startDate, endDate }],
      metrics: GA4_METRICS.map((name) => ({ name })),
      dimensions: [{ name: 'date' }],
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      const err = new Error(`GA4 API error (${response.status}): ${text}`)
      err.statusCode = response.status
      err.code = response.status === 401 ? 'INVALID_CREDENTIALS' : 'API_ERROR'
      throw err
    }

    return response.json()
  }

  /**
   * GA4 retourne les dates au format 'YYYYMMDD'. On convertit en 'YYYY-MM-DD'
   * (format ISO attendu par canonical_metrics).
   */
  async normalizeData(rawData) {
    const metrics = []
    const headerNames = (rawData.metricHeaders || []).map((h) => h.name)

    for (const row of rawData.rows || []) {
      const dateRaw = row.dimensionValues?.[0]?.value
      if (!dateRaw || dateRaw.length !== 8) continue
      const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`

      for (let i = 0; i < headerNames.length; i++) {
        const sourceKey = headerNames[i]
        const mapping = mapToCanonical('ga4', sourceKey)
        if (!mapping) continue // métrique non mappée → ignorée

        const rawValue = row.metricValues?.[i]?.value
        const numValue = parseFloat(rawValue)
        if (!Number.isFinite(numValue)) continue

        metrics.push({
          date,
          metricKey: mapping.canonicalKey,
          metricValue: numValue,
          confidenceScore: mapping.confidenceDefault,
        })
      }
    }

    return { metrics }
  }

  /**
   * Test rapide: tente une requête sur les dernières 24h.
   * Renvoie true si l'API répond 200, false sinon (jamais throw).
   */
  async testConnection() {
    try {
      const today = new Date()
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      await this.fetchData({ startDate: fmt(yesterday), endDate: fmt(today) })
      return true
    } catch (err) {
      logger.warn(
        {
          event: 'ga4_test_connection_failed',
          connectorId: this.connector.id,
          error: err.message,
          code: err.code,
        },
        'GA4 testConnection failed',
      )
      return false
    }
  }

  async _doRefresh() {
    const refreshToken = await vault.decrypt(this.connector.refresh_token)
    if (!refreshToken) {
      const err = new Error('GA4 refresh token missing — user must reauthorize')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }

    const { accessToken, expiresIn } = await refreshAccessToken(refreshToken)

    const encryptedAccess = await vault.encrypt(accessToken)
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

    // Reflète l'update en mémoire (le BaseConnector.refreshTokenIfNeeded check token_expires_at)
    this.connector.access_token = encryptedAccess
    this.connector.token_expires_at = expiresAt
  }
}

module.exports = GA4Connector
