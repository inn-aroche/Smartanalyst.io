// Meta Ads (Facebook + Instagram) connector.
//
// Auth: OAuth 2.0 Facebook for Developers — scopes ads_read + business_management.
//       Tokens long-lived ~60 jours. Refresh via le même token_url avec
//       grant_type=fb_exchange_token (géré côté oauth-generic standard).
// API:  Graph API v18.0 — endpoint /act_{ad_account_id}/insights
// Stockage: `connectors.account_id` = ad_account_id Meta (avec ou sans
//           préfixe 'act_'). On normalise au moment de la requête.
//
// Métriques (cf. canonical-metrics-mapping):
//   - spend, impressions, clicks (directes)
//   - cpc, cpm (calculées : spend/clicks*1, spend/impressions*1000)
//   - actions (conversions cumulées, types filtrables via extra_config)

const BaseConnector = require('./base.connector')
const { logger } = require('../lib/logger')
const vault = require('../lib/vault')
const { mapToCanonical } = require('./canonical-metrics-mapping')
const oauthGeneric = require('../services/auth/oauth-generic.service')
const { getServiceRoleClient } = require('../lib/supabase')

const META_API_VERSION = 'v18.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// Action types Meta considérés comme "conversion" (sommés pour la métrique
// canonique). Liste configurable via integration_providers.extra_config.conversion_action_types,
// par défaut on prend les achats e-commerce + leads classiques.
const DEFAULT_CONVERSION_ACTIONS = new Set([
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'lead',
  'complete_registration',
])

class MetaAdsConnector extends BaseConnector {
  async _getAccessToken() {
    const token = await vault.decrypt(this.connector.access_token, {
      secretType: 'connector_oauth_token',
      field: 'access_token',
      workspaceId: this.connector.workspace_id,
      connectorId: this.connector.id,
      source: 'meta_ads',
    })
    if (!token) {
      const err = new Error('Meta access token missing')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }
    return token
  }

  _adAccountPath() {
    const id = String(this.connector.account_id || '').trim()
    if (!id) {
      const err = new Error('Meta ad_account_id missing on connector record')
      err.code = 'INVALID_CONNECTOR'
      throw err
    }
    return id.startsWith('act_') ? id : `act_${id}`
  }

  async _metaGet(path, params = {}) {
    const token = await this._getAccessToken()
    const url = new URL(`${META_API_BASE}${path}`)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
    url.searchParams.set('access_token', token)

    const response = await fetch(url.toString(), { method: 'GET' })

    if (!response.ok) {
      const text = await response.text()
      const err = new Error(`Meta Graph API error (${response.status}): ${text.slice(0, 500)}`)
      err.statusCode = response.status
      // Meta renvoie 400 avec error.code=190 pour token expiré
      const isAuth = response.status === 401 || /token|access/i.test(text)
      err.code = isAuth ? 'INVALID_CREDENTIALS' : 'API_ERROR'
      throw err
    }
    return response.json()
  }

  async fetchData({ startDate, endDate }) {
    // Insights agrégés par jour pour la période demandée.
    // fields : spend, impressions, clicks, actions
    const data = await this._metaGet(`/${this._adAccountPath()}/insights`, {
      fields: 'spend,impressions,clicks,actions',
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      time_increment: 1, // une ligne par jour
      level: 'account',
    })
    return data
  }

  async normalizeData(rawData) {
    const metrics = []
    const rows = rawData?.data || []

    for (const row of rows) {
      const date = row.date_start
      if (!date) continue

      const spend = parseFloat(row.spend || '0')
      const impressions = parseInt(row.impressions || '0', 10)
      const clicks = parseInt(row.clicks || '0', 10)

      _push(metrics, 'spend', date, spend)
      _push(metrics, 'impressions', date, impressions)
      _push(metrics, 'clicks', date, clicks)

      // CPC / CPM dérivés
      if (clicks > 0) _push(metrics, 'cpc', date, spend / clicks)
      if (impressions > 0) _push(metrics, 'cpm', date, (spend / impressions) * 1000)

      // Conversions cumulées : somme des actions dont l'action_type matche
      // la liste configurée (purchases + leads par défaut).
      const conversionTypes = this._conversionActionTypes()
      let conversions = 0
      for (const action of row.actions || []) {
        if (conversionTypes.has(action.action_type)) {
          conversions += parseFloat(action.value || '0')
        }
      }
      if (conversions > 0) _push(metrics, 'actions', date, conversions)
    }

    return { metrics }
  }

  _conversionActionTypes() {
    // L'extra_config provider peut surcharger la liste par défaut.
    // (Lecture asynchrone évitée ici : on tolère la défault, le surcharge
    // se fait plus tard via une feature de configuration par workspace.)
    return DEFAULT_CONVERSION_ACTIONS
  }

  async testConnection() {
    try {
      // Endpoint léger : me + info compte
      await this._metaGet(`/${this._adAccountPath()}`, { fields: 'id,name,currency' })
      return true
    } catch (err) {
      logger.warn(
        {
          event: 'meta_ads_test_connection_failed',
          connectorId: this.connector.id,
          error: err.message,
          code: err.code,
        },
        'Meta Ads testConnection failed',
      )
      return false
    }
  }

  async _doRefresh() {
    // Meta utilise le même endpoint OAuth pour le refresh — oauth-generic
    // gère le grant_type=refresh_token standard. Quelques apps Meta n'ont
    // pas de refresh_token (utilisent fb_exchange_token), à ajuster dans
    // un second temps si besoin.
    const ctx = {
      secretType: 'connector_oauth_token',
      workspaceId: this.connector.workspace_id,
      connectorId: this.connector.id,
      source: 'meta_ads',
    }
    const refreshToken = await vault.decrypt(this.connector.refresh_token, {
      ...ctx,
      field: 'refresh_token',
    })
    if (!refreshToken) {
      const err = new Error('Meta refresh token missing — user must reauthorize')
      err.code = 'INVALID_CREDENTIALS'
      err.statusCode = 401
      throw err
    }

    const { accessToken, expiresIn } = await oauthGeneric.refreshAccessToken({
      source: 'meta_ads',
      refreshToken,
    })

    const encryptedAccess = await vault.encrypt(accessToken, {
      ...ctx,
      field: 'access_token',
    })
    const expiresAt = new Date(Date.now() + (expiresIn || 60 * 24 * 60 * 60) * 1000).toISOString()

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

function _push(metrics, sourceKey, date, value) {
  const mapping = mapToCanonical('meta_ads', sourceKey)
  if (!mapping || !Number.isFinite(value)) return
  metrics.push({
    date,
    metricKey: mapping.canonicalKey,
    metricValue: value,
    confidenceScore: mapping.confidenceDefault,
  })
}

module.exports = MetaAdsConnector
