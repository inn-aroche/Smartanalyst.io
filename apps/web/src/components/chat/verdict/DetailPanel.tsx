// DetailPanel — drawer drill-in au clic sur une row. Cahier 22c §3 Phase 3.
// Affiche les metrics + insight retournes par analyze_performance pour cette
// row. Aucun appel reseau : tout est deja dans le VerdictSpec.
//
// Pourquoi un drawer plutot qu'un panneau inline : preserve la lisibilite du
// tableau principal (vue d'ensemble = la valeur premiere) et laisse le drill
// vivre dans un espace dedie qui peut respirer sur mobile comme sur desktop.

import { useEffect } from 'react'

import MetricCard from './MetricCard'
import StatusBadge from './StatusBadge'
import type { Row } from './types'

export default function DetailPanel({ row, onClose }: { row: Row; onClose: () => void }) {
  // Escape ferme le panel — accessibilite clavier minimale.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Détail ${row.name}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <StatusBadge status={row.status} />
              <h3 className="truncate text-base font-bold text-gray-900">{row.name}</h3>
            </div>
            <p className="mt-1 text-xs text-gray-400">{row.valueLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fermer"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {row.metrics && row.metrics.length > 0 && (
          <div
            className={`mt-4 grid gap-2.5 ${
              row.metrics.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
            }`}
          >
            {row.metrics.map((m, i) => (
              <MetricCard key={i} metric={m} />
            ))}
          </div>
        )}

        {row.insight && <p className="mt-4 text-sm leading-relaxed text-gray-600">{row.insight}</p>}
        {!row.insight && row.secondary && (
          <p className="mt-4 text-sm leading-relaxed text-gray-600">{row.secondary}</p>
        )}
      </div>
    </div>
  )
}
