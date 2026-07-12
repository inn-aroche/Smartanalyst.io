// BaseConnector: classe abstraite que tous les connecteurs concrets étendent.
//
// Source: docs/03_ARCHITECTURE_GLOBALE.md §2, docs/15_BASE_CONNECTOR_CLASSE.md
//
// Contrat:
//   - fetchData()      → données brutes de l'API source (subclass)
//   - normalizeData()  → mappe vers canonical_metrics (subclass)
//   - testConnection() → vérifie que les credentials sont vivants (subclass)
//   - _doRefresh()     → refresh OAuth token (subclass, optionnel pour connecteurs API-key)
//   - sync()           → orchestre tout (commun, ne pas override)

const { getServiceRoleClient } = require('../lib/supabase')
const { logger } = require('../lib/logger')
const canonicalMetricsService = require('../services/metrics/canonical-metrics.service')
const connectorAlert = require('../services/connectors/connector-alert.service')

const TOKEN_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000 // 7 jours

class BaseConnector {
  /**
   * @param {string} workspaceId
   * @param {Object} connectorRecord - Row de la table `connectors`
   */
  constructor(workspaceId, connectorRecord) {
    if (this.constructor === BaseConnector) {
      throw new Error('BaseConnector is abstract — extend it, do not instantiate directly')
    }
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!connectorRecord || !connectorRecord.id) {
      throw new Error('connectorRecord with id is required')
    }
    this.workspaceId = workspaceId
    this.connector = connectorRecord
    this.source = connectorRecord.source
  }

  // ━━━ Abstract methods (à implémenter par les sous-classes) ━━━

  /**
   * @abstract
   * @param {{ startDate: string, endDate: string }} range
   * @returns {Promise<any>} Données brutes (forme libre, propre au connecteur)
   */
  // eslint-disable-next-line no-unused-vars
  async fetchData(range) {
    throw new Error(`${this.constructor.name}.fetchData() must be implemented`)
  }

  /**
   * @abstract
   * @param {any} rawData - sortie de fetchData()
   * @returns {Promise<{ metrics: import('../services/metrics/canonical-metrics.service').CanonicalMetricRow[] }>}
   */
  // eslint-disable-next-line no-unused-vars
  async normalizeData(rawData) {
    throw new Error(`${this.constructor.name}.normalizeData() must be implemented`)
  }

  /**
   * @abstract
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    throw new Error(`${this.constructor.name}.testConnection() must be implemented`)
  }

  /**
   * @abstract pour les connecteurs OAuth uniquement.
   * Doit mettre à jour `connectors.access_token`, `refresh_token`, `token_expires_at`.
   */
  async _doRefresh() {
    throw new Error(
      `${this.constructor.name}._doRefresh() must be implemented for OAuth connectors`,
    )
  }

  // ━━━ Concrete helpers (logique partagée) ━━━

  /**
   * Refresh le token si il expire dans les 7 jours.
   * Source: docs/03 §2.1
   */
  async refreshTokenIfNeeded() {
    if (!this.connector.token_expires_at) return false

    const expiresAt = new Date(this.connector.token_expires_at).getTime()
    const threshold = Date.now() + TOKEN_REFRESH_THRESHOLD_MS

    if (expiresAt >= threshold) return false

    logger.info(
      {
        event: 'token_refresh_started',
        workspaceId: this.workspaceId,
        connectorId: this.connector.id,
        source: this.source,
        expiresAt: this.connector.token_expires_at,
      },
      'Refreshing OAuth token (expiring within 7 days)',
    )

    await this._doRefresh()
    return true
  }

  /**
   * Patch la ligne connectors avec les champs fournis.
   */
  async updateStatus(patch) {
    const supabase = getServiceRoleClient()
    const { error } = await supabase
      .from('connectors')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', this.connector.id)

    if (error) {
      logger.warn(
        {
          event: 'connector_status_update_failed',
          connectorId: this.connector.id,
          error: error.message,
        },
        'Failed to update connector status',
      )
    }
  }

  async logError(context, error) {
    logger.error(
      {
        event: 'connector_error',
        workspaceId: this.workspaceId,
        connectorId: this.connector.id,
        source: this.source,
        ...context,
        errorMessage: error.message,
        errorStack: error.stack,
      },
      `Connector error: ${error.message}`,
    )
  }

  // ━━━ Orchestration (ne pas override) ━━━

  /**
   * Sync complet: refresh token → fetch → normalize → ingest dans canonical_metrics.
   * Met à jour le status du connecteur en fin de cycle (active / error).
   *
   * @param {{ startDate: string, endDate: string }} range
   * @returns {Promise<{ ok: boolean, metricsCount: number, durationMs: number }>}
   */
  async sync(range) {
    const startTs = Date.now()
    try {
      await this.refreshTokenIfNeeded()

      const raw = await this.fetchData(range)
      const { metrics = [] } = await this.normalizeData(raw)

      const { inserted } = await canonicalMetricsService.ingest({
        workspaceId: this.workspaceId,
        source: this.source,
        connectorId: this.connector.id,
        rows: metrics,
      })

      const durationMs = Date.now() - startTs
      await this.updateStatus({
        status: 'active',
        status_reason: null,
        last_error_message: null,
        last_error_at: null,
        last_synced_at: new Date().toISOString(),
        last_sync_duration_ms: durationMs,
      })

      logger.info(
        {
          event: 'connector_sync_success',
          workspaceId: this.workspaceId,
          connectorId: this.connector.id,
          source: this.source,
          metricsCount: inserted,
          durationMs,
        },
        'Connector sync completed',
      )

      return { ok: true, metricsCount: inserted, durationMs }
    } catch (error) {
      await this.logError({ operation: 'sync', range }, error)

      // Status spécifique selon l'erreur
      const isAuthError =
        error.code === 'INVALID_CREDENTIALS' || error.statusCode === 401 || error.statusCode === 403
      const statusReason = error.code || error.name || 'sync_failed'
      await this.updateStatus({
        status: isAuthError ? 'expired' : 'error',
        status_reason: statusReason,
        last_error_message: error.message,
        last_error_at: new Date().toISOString(),
      })

      // Best-effort : prévient l'utilisateur (in-app + email) qu'il doit
      // reconnecter la source. Ne bloque jamais le throw ci-dessous.
      void connectorAlert.notifyConnectorDown({
        workspaceId: this.workspaceId,
        connectorId: this.connector.id,
        source: this.source,
        reason: statusReason,
      })

      throw error
    }
  }
}

module.exports = BaseConnector
