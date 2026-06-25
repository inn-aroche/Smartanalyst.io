// ProportionalTable — vue d'ensemble interactive. Cahier 22c §3.
// 5-7 lignes max (cap cote backend). Chaque ligne : nom + barre proportion-
// nelle + metrique principale + badge statut + secondaire optionnelle.
//
// Phase 3 : row cliquable si elle porte des metrics ou un insight → DetailPanel.

import { useMemo, useState } from 'react'

import DetailPanel from './DetailPanel'
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
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const openRow = openRowId ? rows.find((r) => r.id === openRowId) || null : null
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
        {rows.map((row) => {
          // Une row est cliquable si elle porte du detail exploitable.
          const hasDetail = Boolean((row.metrics && row.metrics.length > 0) || row.insight)
          const content = (
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
          )
          return (
            <li key={row.id} className="py-3 first:pt-0 last:pb-0">
              {hasDetail ? (
                <button
                  type="button"
                  onClick={() => setOpenRowId(row.id)}
                  className="-mx-2 block w-full rounded-lg px-2 py-1 text-left transition-colors hover:bg-gray-50"
                  aria-label={`Voir le détail de ${row.name}`}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ul>
      {openRow && <DetailPanel row={openRow} onClose={() => setOpenRowId(null)} />}
    </div>
  )
}
