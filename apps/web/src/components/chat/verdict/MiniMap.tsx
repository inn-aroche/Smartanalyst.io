// MiniMap — silhouette horizontale du parcours. Cahier 22c §4.7.
// Donne la forme du funnel d'un coup d'œil (dots + arrows colores) avant le
// detail metrique. Complement non redondant du FunnelBar : le FunnelBar
// concentre les chiffres, la MiniMap concentre la trajectoire.

import { STATUS_CONFIG, type JourneyStep } from './types'

export default function MiniMap({ steps }: { steps: JourneyStep[] }) {
  if (!steps || steps.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Parcours</p>
      <ol
        className="flex items-center gap-0 overflow-x-auto"
        aria-label="Étapes du parcours utilisateur"
      >
        {steps.map((step, i) => {
          const cfg = STATUS_CONFIG[step.status]
          const isLast = i === steps.length - 1
          return (
            <li key={i} className="flex flex-1 items-center gap-2 min-w-0">
              <div className="flex min-w-0 flex-col items-center gap-1">
                <span
                  className={`block h-3 w-3 rounded-full ring-2 ring-white ${cfg.dot}`}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[7rem] text-center text-xs font-medium text-gray-700">
                  {step.label}
                </span>
                {step.retentionPct != null && (
                  <span className="font-mono text-[10px] tabular-nums text-gray-400">
                    {step.retentionPct.toString().replace('.', ',')}%
                  </span>
                )}
              </div>
              {!isLast && (
                <div className="flex-1">
                  <div className="h-px w-full bg-gray-200" aria-hidden="true" />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
