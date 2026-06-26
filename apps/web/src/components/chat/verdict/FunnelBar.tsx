// FunnelBar — etapes de funnel empilees avec retention %. Cahier 22c §4.5.
// La couleur de la barre + du badge suit le status de l'etape (TOP / BON /
// MOYEN / FAIBLE) calcule cote backend selon les seuils de retention. La
// largeur est proportionnelle a la valeur (premiere etape = 100%).

import StatusBadge from './StatusBadge'
import { STATUS_CONFIG, type JourneyStep } from './types'

export default function FunnelBar({ steps }: { steps: JourneyStep[] }) {
  if (!steps || steps.length === 0) return null
  const max = Math.max(...steps.map((s) => s.value), 1)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Funnel</p>
        <p className="text-xs text-gray-400">{steps.length} étapes</p>
      </div>
      <ul className="space-y-3">
        {steps.map((step, i) => {
          const widthPct = Math.max(2, Math.round((step.value / max) * 100))
          const cfg = STATUS_CONFIG[step.status]
          // Le drop-off vs etape precedente est l'info qui pique : on l'affiche
          // a droite en chip rouge si > 45%, sinon discret.
          const lossPct = step.retentionPct == null ? null : Math.round(100 - step.retentionPct)
          const lossSevere = lossPct != null && lossPct >= 45
          return (
            <li key={i}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusBadge status={step.status} />
                  <span className="truncate font-medium text-gray-900">{step.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {step.retentionPct != null && (
                    <span className="font-mono text-xs tabular-nums text-gray-400">
                      {step.retentionPct.toString().replace('.', ',')}%
                    </span>
                  )}
                  <span className="font-mono text-xs tabular-nums text-gray-700">
                    {step.valueLabel}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full ${cfg.bar}`} style={{ width: `${widthPct}%` }} />
              </div>
              {lossSevere && (
                <p className="mt-1 text-xs text-red-600">
                  −{lossPct}% vs étape précédente — point de fuite majeur
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
