// SourceHealthBadge — cahier §4.7 (Sources) + §3 Lot 0.
//
// Rend visible le vrai état de santé d'un connecteur (healthy / stale /
// expired / failing / unknown) calculé côté API par
// services/connectors/connector-health.service.js. Le but : qu'un échec
// silencieux ne le reste jamais une fois sur la page Sources/Connectors.
//
// Pour éviter une dérive d'apparence entre les écrans, le composant est
// le seul endroit où la couleur/icône d'un état est décidée.

import type { HealthState, HealthStateName } from '@/lib/connector-health'
import { useT } from '@/lib/i18n'

type StateStyle = {
  chipClass: string
  dotClass: string
  symbol: string
  ariaSeverity: 'good' | 'warn' | 'bad' | 'neutral'
}

const STYLES: Record<HealthStateName, StateStyle> = {
  healthy: {
    chipClass: 'bg-brand-green/10 text-brand-green',
    dotClass: 'bg-brand-green',
    symbol: '',
    ariaSeverity: 'good',
  },
  stale: {
    chipClass: 'bg-brand-amber/10 text-brand-amber',
    dotClass: 'bg-brand-amber',
    symbol: '!',
    ariaSeverity: 'warn',
  },
  expired: {
    chipClass: 'bg-brand-amber/10 text-brand-amber',
    dotClass: 'bg-brand-amber',
    symbol: '!',
    ariaSeverity: 'warn',
  },
  failing: {
    chipClass: 'bg-brand-red/10 text-brand-red',
    dotClass: 'bg-brand-red',
    symbol: '!',
    ariaSeverity: 'bad',
  },
  unknown: {
    chipClass: 'bg-bg-3 text-text-3',
    dotClass: 'bg-text-3',
    symbol: '',
    ariaSeverity: 'neutral',
  },
}

export default function SourceHealthBadge({
  health,
  freshness,
  size = 'md',
}: {
  health: HealthState | null | undefined
  // Texte de fraîcheur déjà formaté ("2 h ago", "il y a 5 min", "never"…).
  // Géré par l'appelant pour rester compatible avec ses propres helpers
  // de date (formatRelative côté Sources, etc.).
  freshness?: string | null
  size?: 'sm' | 'md'
}) {
  const t = useT()
  const state: HealthStateName = health?.state ?? 'unknown'
  const style = STYLES[state]
  const label = t(`sources.health.${state}` as never)
  // Un état "failing" ou "stale" peut avoir une raison technique
  // (sync_overdue, INVALID_GRANT…). On l'expose en aria-label pour ne pas
  // surcharger le chip mais rester accessible.
  const reason = health?.reason ?? null

  const sizeClass = size === 'sm' ? 'text-[10.5px] px-1.5 py-0.5' : 'text-[11px]'

  return (
    <span
      className={`sa-chip ${style.chipClass} ${sizeClass}`}
      role="status"
      aria-label={reason ? `${label} (${reason})` : label}
      title={reason ?? undefined}
      data-health-state={state}
      data-aria-severity={style.ariaSeverity}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dotClass}`} aria-hidden="true" />
      <span>{label}</span>
      {freshness ? <span className="text-text-3"> · {freshness}</span> : null}
    </span>
  )
}
