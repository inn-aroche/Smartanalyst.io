// ProportionalTable — vue d'ensemble interactive. Cahier 22c §3.
// 5-7 lignes max (cap cote backend). Chaque ligne : nom + barre proportion-
// nelle + metrique principale + badge statut + secondaire optionnelle.
//
// Phase 1 : statique (non cliquable). Phase 3 : detail panel au clic.

import { useMemo } from 'react'

import ProportionalBar from './ProportionalBar'
import StatusBadge from './StatusBadge'
import type { Row } from './types'

export default function ProportionalTable({
  rows,
  metricLabel,
}: {
  rows: Row[]
  /** Label affiche au-dessus de la metric column (ex: "Leads", "CVR"). */
  metricLabel?: string
}) {
  const max = useMemo(() => Math.max(...rows.map((r) => r.value), 1), [rows])
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {metricLabel && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Vue d&apos;ensemble
          </p>
          <p className="text-xs text-gray-400">{metricLabel}</p>
        </div>
      )}
      <ul className="divide-y divide-gray-50">
        {rows.map((row) => (
          <li key={row.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-gray-900">{row.name}</span>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div className="flex-1">
                    <ProportionalBar value={row.value} max={max} status={row.status} />
                  </div>
                  <span className="shrink-0 text-xs font-mono tabular-nums text-gray-700">
                    {row.valueLabel}
                  </span>
                </div>
                {row.secondary && <p className="mt-0.5 text-xs text-gray-400">{row.secondary}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
