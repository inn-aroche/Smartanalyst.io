// Donut — répartition (mix canaux, sources de trafic…) avec légende +
// centre informatif (handoff Claude Design sa-charts.jsx → Donut).
//
// SVG natif, segments arrondis (stroke-linecap). Couleurs depuis une
// palette brand-aware, mais override possible par segment.

import { useId, useMemo } from 'react'

export type DonutSegment = {
  label: string
  value: number
  color?: string
}

type Props = {
  segments: DonutSegment[]
  size?: number
  stroke?: number
  center?: { title?: string; value: string }
  emptyLabel?: string
}

// Palette par défaut : brand + accents. Cycle si plus de segments.
const PALETTE = ['#3D6BE0', '#2DD9EE', '#1FA873', '#C2820E', '#7A5BD8', '#5C5C78']

export default function Donut({
  segments,
  size = 148,
  stroke = 22,
  center,
  emptyLabel = '—',
}: Props) {
  const reactId = useId().replace(/:/g, '')
  const { segs, total } = useMemo(() => {
    if (!segments || segments.length === 0) return { segs: [], total: 0 }
    const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
    if (total === 0) return { segs: [], total: 0 }
    let cumulated = 0
    const segs = segments.map((s, i) => {
      const fraction = Math.max(0, s.value) / total
      const dasharray = fraction * 100
      const offset = -cumulated
      cumulated += dasharray
      return {
        ...s,
        color: s.color ?? PALETTE[i % PALETTE.length],
        pct: fraction * 100,
        dasharray,
        offset,
      }
    })
    return { segs, total }
  }, [segments])

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[10px] border border-dashed border-border bg-bg-2 text-sm text-text-3"
        style={{ height: size }}
      >
        {emptyLabel}
      </div>
    )
  }

  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const C = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E5EC" strokeWidth={stroke} />
          {segs.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${(s.dasharray / 100) * C} ${C}`}
              strokeDashoffset={(s.offset / 100) * C}
              style={{ transition: 'stroke-dasharray .5s, stroke-dashoffset .5s' }}
            />
          ))}
          {/* Halo subtil au centre */}
          <radialGradient id={`donut-glow-${reactId}`}>
            <stop offset="0" stopColor="rgba(255,255,255,0)" />
            <stop offset="0.85" stopColor="rgba(18,18,38,0.03)" />
          </radialGradient>
        </svg>
        {center && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {center.title && (
              <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-3">
                {center.title}
              </div>
            )}
            <div className="font-head text-xl font-bold leading-none text-text-1">
              {center.value}
            </div>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span
              className="block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="flex-1 truncate text-[12.5px] text-text-1">{s.label}</span>
            <span className="font-mono text-[11px] text-text-3">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
