// Types partagés pour le health state des connecteurs (calculé côté API
// par services/connectors/connector-health.service.js, exposé sur
// GET /api/v1/connectors).

export type HealthStateName = 'healthy' | 'stale' | 'expired' | 'failing' | 'unknown'

export type HealthState = {
  state: HealthStateName
  reason: string | null
  silent_failure: boolean
  last_synced_at: string | null
}

// Mapping vers les clés i18n. On ne hardcode pas les libellés ici pour
// rester aligné sur le contrat FR/EN structurel (strings.ts).
export function healthLabelKey(state: HealthStateName): string {
  return `sources.health.${state}`
}

export function healthHintKey(state: HealthStateName): string {
  return `sources.health.${state}.hint`
}
