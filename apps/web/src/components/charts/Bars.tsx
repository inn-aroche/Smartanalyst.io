// Bars — barres verticales avec dernière (ou indexée) accentuée
// (handoff Claude Design sa-charts.jsx → Bars).
//
// Usage : répartition catégorielle (channels, périodes…). Accent visuel
// sur la barre "active" pour ancrer l'œil sur le dernier point / la
// catégorie en focus.

import { useMemo } from 'react'

type Bar = { label: string; value: number }

type Props = {
  data: Bar[]
  height?: number
  color?: string
  activeIndex?: number
  emptyLabel?: string
}

const DEFAULT_COLOR = '#5C8FFF'

export default function Bars({
  data,
  height = 150,
  color = DEFAULT_COLOR,
  activeIndex,
  emptyLabel = '—',
}: Props) {
  const { bars, ymax } = useMemo(() => {
    if (!data || data.length === 0) return { bars: [], ymax: 0 }
    const ymax = Math.max(...data.map((d) => d.value), 1)
    const activeIdx = typeof activeIndex === 'number' ? activeIndex : data.length - 1
    return {
      bars: data.map((d, i) => ({
        ...d,
        h: (d.value / ymax) * 100,
        active: i === activeIdx,
      })),
      ymax,
    }
  }, [data, activeIndex])

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[10px] border border-dashed border-border bg-bg-2 text-sm text-text-3"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex h-[calc(100%-20px)] items-end gap-1.5">
        {bars.map((b, i) => (
          <div
            key={i}
            className="group relative flex flex-1 flex-col items-center justify-end"
            title={`${b.label} : ${formatValue(b.value)}`}
          >
            <span
              className={[
                'mb-1 font-mono text-[10px] transition-opacity',
                b.active
                  ? 'text-text-1 opacity-100'
                  : 'text-text-3 opacity-0 group-hover:opacity-100',
              ].join(' ')}
            >
              {formatValue(b.value)}
            </span>
            <div
              className="w-full rounded-t-md transition-all"
              style={{
                height: `${b.h}%`,
                background: b.active ? color : `${color}55`,
                minHeight: 2,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {bars.map((b, i) => (
          <span
            key={i}
            className={[
              'flex-1 truncate text-center font-mono text-[10px]',
              b.active ? 'font-semibold text-text-1' : 'text-text-3',
            ].join(' ')}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
  }
  return v.toFixed(Math.abs(v) >= 100 ? 0 : 1).replace('.', ',')
}
