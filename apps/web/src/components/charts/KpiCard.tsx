// KpiCard — pattern App v2 (handoff §"En un coup d'œil") :
// label + sous-titre mono · sparkline en haut à droite · valeur grosse +
// delta coloré · chip benchmark optionnel.

import Sparkline from './Sparkline'

export type Kpi = {
  label: string
  sub?: string
  value: string
  delta?: string
  up?: boolean
  spark?: number[]
  bench?: string | null
}

export default function KpiCard({ k, dense = false }: { k: Kpi; dense?: boolean }) {
  const up = !!k.up
  return (
    <div
      className="rounded-brief border border-border bg-card shadow-card"
      style={{ padding: dense ? '15px 16px' : '18px 20px' }}
    >
      <div className="mb-2.5 flex items-start justify-between">
        <div>
          <div className="text-[12.5px] font-semibold text-text-2">{k.label}</div>
          {k.sub && <div className="mt-0.5 font-mono text-[10.5px] text-text-3">{k.sub}</div>}
        </div>
        {k.spark && <Sparkline data={k.spark} up={up} w={64} h={26} />}
      </div>
      <div className="mb-2 flex items-baseline gap-2.5">
        <span
          className="whitespace-nowrap font-head font-bold leading-none tracking-[-0.02em] text-text-1"
          style={{ fontSize: dense ? 22 : 25 }}
        >
          {k.value}
        </span>
        {k.delta && (
          <span
            className={`font-mono text-[12.5px] font-medium ${up ? 'text-brand-green' : 'text-brand-red'}`}
          >
            {k.delta}
          </span>
        )}
      </div>
      {k.bench && (
        <span
          className={`sa-chip ${
            k.bench.includes('top')
              ? 'bg-brand-cyan/10 text-brand-cyan'
              : 'bg-text-2/10 text-text-2'
          }`}
          style={{ fontSize: 10.5, padding: '2px 8px' }}
        >
          ⌖ {k.bench}
        </span>
      )}
    </div>
  )
}
