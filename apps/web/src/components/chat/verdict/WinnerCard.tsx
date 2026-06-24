// WinnerCard — carte gagnant qui ouvre tout verdict. Cahier 22c §3.
// Header : badge statut + nom de l'element gagnant.
// Body : grid de 3-4 metriques + insight 2-3 lignes.

import MetricCard from './MetricCard'
import StatusBadge from './StatusBadge'
import type { Winner } from './types'

export default function WinnerCard({ winner }: { winner: Winner }) {
  // Tailwind backgrounds par statut — coherent avec STATUS_CONFIG mais sur le
  // CONTAINER (plus large, plus saturé que le simple badge).
  const bgByStatus: Record<Winner['status'], string> = {
    TOP: 'bg-emerald-50 border-emerald-100',
    BON: 'bg-blue-50 border-blue-100',
    MOYEN: 'bg-amber-50 border-amber-100',
    FAIBLE: 'bg-red-50 border-red-100',
  }
  return (
    <div className={`rounded-xl border p-5 ${bgByStatus[winner.status]}`}>
      <div className="flex items-center gap-2.5">
        <StatusBadge status={winner.status} />
        <h3 className="font-bold text-gray-900 text-base">{winner.name}</h3>
      </div>

      {winner.metrics.length > 0 && (
        <div
          className={`mt-4 grid gap-2.5 ${
            winner.metrics.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
          }`}
        >
          {winner.metrics.map((m, i) => (
            <MetricCard key={i} metric={m} />
          ))}
        </div>
      )}

      {winner.insight && (
        <p className="mt-4 text-sm text-gray-600 leading-relaxed">{winner.insight}</p>
      )}
    </div>
  )
}
