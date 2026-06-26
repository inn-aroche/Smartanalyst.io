// SpectrumBar — positionnement d'une valeur user sur un axe P25-P75. Cahier 22c §4.8.
// Gradient subtil rouge → ambre → vert (selon direction), 3 ticks P25/P50/P75,
// marqueur user epais.

import StatusBadge from './StatusBadge'
import type { BenchmarkSpectrum } from './types'

export default function SpectrumBar({ benchmark }: { benchmark: BenchmarkSpectrum }) {
  // Pour higher_better : rouge a gauche, vert a droite. Inverse en lower_better.
  const gradient =
    benchmark.direction === 'higher_better'
      ? 'bg-gradient-to-r from-red-200 via-amber-200 to-emerald-300'
      : 'bg-gradient-to-r from-emerald-300 via-amber-200 to-red-200'
  // Position est deja borne 0..100 cote backend.
  const pos = benchmark.positionPct
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {benchmark.metricLabel}
        </p>
        <StatusBadge status={benchmark.status} />
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-2xl font-black text-gray-900">{benchmark.userValueLabel}</span>
        <span className="text-xs text-gray-400">médiane secteur : {benchmark.p50Label}</span>
      </div>

      {/* Barre spectrum */}
      <div className="relative mt-4 h-8">
        <div className={`absolute inset-x-0 top-3 h-2 rounded-full ${gradient}`} />
        {/* Marqueur user (epais, opaque) */}
        <div
          className="absolute top-1.5 -ml-[3px] h-5 w-1.5 rounded-sm bg-gray-900 shadow-sm"
          style={{ left: `${pos}%` }}
          aria-label={`Position user : ${pos}%`}
        />
      </div>

      {/* Ticks P25 / P50 / P75 */}
      <div className="relative mt-1 h-4">
        <span className="absolute left-0 text-[10px] font-mono text-gray-400">
          P25 · {benchmark.p25Label}
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-400">
          P50 · {benchmark.p50Label}
        </span>
        <span className="absolute right-0 text-[10px] font-mono text-gray-400">
          P75 · {benchmark.p75Label}
        </span>
      </div>
    </div>
  )
}
