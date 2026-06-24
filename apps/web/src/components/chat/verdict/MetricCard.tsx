// MetricCard — carte metrique individuelle. Utilisee en grid de 3 ou 4
// dans WinnerCard et DetailPanel. Cahier 22c §4.1.

import type { Metric } from './types'

export default function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        metric.highlight ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-gray-100'
      }`}
    >
      <p className="text-xs text-gray-400 mb-0.5">{metric.label}</p>
      <p
        className={`text-xl font-black ${metric.highlight ? 'text-emerald-700' : 'text-gray-900'}`}
      >
        {metric.value}
      </p>
      {metric.sub && <p className="text-xs text-gray-400 mt-0.5">{metric.sub}</p>}
    </div>
  )
}
