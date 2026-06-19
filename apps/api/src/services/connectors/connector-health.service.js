// Connector health service — cahier des charges §3 Lot 0 + §4.7.
//
// Calcule un `health_state` synthétique à partir des champs déjà tenus à
// jour par BaseConnector (status, status_reason, last_synced_at,
// last_error_at). Pas de nouvelle colonne en DB : c'est un dérivé pur,
// recalculable à tout instant.
//
// L'objectif est qu'un connecteur **qui foire silencieusement** (sync KO
// répété sans qu'aucun alerting ne sorte) soit visible :
// - dans l'UI (badge sur Sources / Connectors)
// - dans les logs (event `connector_health_alert` posé par
//   alerts.handler.js → checkWorkspace)
//
// Sémantique des états :
//   - healthy  : sync OK et récent
//   - stale    : sync OK mais ancien (manqué au moins 1 sync quotidien)
//   - expired  : token OAuth expiré → besoin de reconnect
//   - failing  : sync en erreur depuis assez longtemps pour qualifier
//                d'échec silencieux
//   - unknown  : pas assez d'info (jamais syncé etc.)

// Seuils calibrés sur la fréquence de sync quotidienne (cron 3 h UTC).
// On laisse 36 h avant de qualifier "stale" — couvre les 1-2 sync ratés
// sans paniquer pour un retard ponctuel.
const STALE_AFTER_MS = 36 * 60 * 60 * 1000

// Une erreur de moins de 12 h reste un incident transient ; au-delà, on
// considère que le user doit être averti (silent failure).
const FAILING_AFTER_MS = 12 * 60 * 60 * 1000

function tsMs(value) {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * @param {Object} connector — colonnes connectors (status, status_reason,
 *   last_synced_at, last_error_at, created_at).
 * @param {number} [now=Date.now()] — pour les tests.
 * @returns {{
 *   state: 'healthy'|'stale'|'expired'|'failing'|'unknown',
 *   reason: string|null,
 *   silent_failure: boolean,
 *   last_synced_at: string|null,
 * }}
 */
function computeHealthState(connector, now = Date.now()) {
  if (!connector)
    return { state: 'unknown', reason: null, silent_failure: false, last_synced_at: null }

  const status = connector.status || 'active'
  const reason = connector.status_reason || null
  const lastSyncMs = tsMs(connector.last_synced_at)
  const lastErrorMs = tsMs(connector.last_error_at)

  // Token KO → l'utilisateur doit reconnecter, indépendamment de la
  // fraîcheur. C'est explicite : pas un échec silencieux.
  if (status === 'expired') {
    return {
      state: 'expired',
      reason,
      silent_failure: false,
      last_synced_at: connector.last_synced_at || null,
    }
  }

  // Erreur de sync : silencieuse si elle dure depuis > FAILING_AFTER_MS.
  if (status === 'error') {
    const errAgeMs = lastErrorMs ? now - lastErrorMs : null
    const isSilent = errAgeMs !== null && errAgeMs > FAILING_AFTER_MS
    return {
      state: 'failing',
      reason,
      silent_failure: isSilent,
      last_synced_at: connector.last_synced_at || null,
    }
  }

  // Status='active' : on regarde la fraîcheur.
  if (status === 'active') {
    if (lastSyncMs === null) {
      // Jamais syncé. Si le connecteur vient d'être créé (< 6 h), on lui
      // laisse le bénéfice du doute. Sinon, c'est suspect.
      const createdMs = tsMs(connector.created_at)
      const ageMs = createdMs ? now - createdMs : null
      if (ageMs !== null && ageMs > STALE_AFTER_MS) {
        return {
          state: 'stale',
          reason: 'never_synced',
          silent_failure: true,
          last_synced_at: null,
        }
      }
      return { state: 'unknown', reason: null, silent_failure: false, last_synced_at: null }
    }
    const ageMs = now - lastSyncMs
    if (ageMs > STALE_AFTER_MS) {
      return {
        state: 'stale',
        reason: 'sync_overdue',
        silent_failure: true,
        last_synced_at: connector.last_synced_at,
      }
    }
    return {
      state: 'healthy',
      reason: null,
      silent_failure: false,
      last_synced_at: connector.last_synced_at,
    }
  }

  // status='disconnected' ou autre : pas une alerte, juste un état.
  return {
    state: 'unknown',
    reason: status,
    silent_failure: false,
    last_synced_at: connector.last_synced_at || null,
  }
}

/**
 * Enrichit une liste de connecteurs avec `health_state` (objet imbriqué).
 * Idempotent — réécrit la clé si déjà présente.
 */
function enrichWithHealth(connectors, now = Date.now()) {
  return (connectors || []).map((c) => ({
    ...c,
    health_state: computeHealthState(c, now),
  }))
}

module.exports = {
  computeHealthState,
  enrichWithHealth,
  // Exportés pour les tests / un éventuel ajustement de seuil par workspace.
  STALE_AFTER_MS,
  FAILING_AFTER_MS,
}
