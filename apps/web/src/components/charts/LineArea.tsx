// LineArea — courbe + aire dégradée + point signal cyan en fin de série
// (handoff Claude Design sa-charts.jsx → LineArea). Réutilisable Dashboard
// ↔ futur Rapports PDF (cohérence visuelle web/print).
//
// SVG natif : pas de dep, ~80 lignes, scaling automatique des données.
// Affiche 3 gridlines + labels mono pour les abscisses (1ère/milieu/dernière).

import { useId, useMemo } from 'react'

type Point = { date: string; value: number }

type Props = {
  data: Point[]
  height?: number
  color?: string
  unit?: string
  title?: string
  emptyLabel?: string
}

const DEFAULT_COLOR = '#5C8FFF' // brand blueBright (handoff token)

export default function LineArea({
  data,
  height = 180,
  color = DEFAULT_COLOR,
  unit = '',
  title,
  emptyLabel = '—',
}: Props) {
  const reactId = useId().replace(/:/g, '')
  const areaGradId = `linearea-grad-${reactId}`

  const { line, area, ymin, ymax, lastPoint, xLabels } = useMemo(() => {
    if (!data || data.length < 2) {
      return { line: '', area: '', ymin: 0, ymax: 0, lastPoint: null, xLabels: [] }
    }
    const values = data.map((p) => p.value)
    const ymin = Math.min(...values)
    const ymax = Math.max(...values)
    const yrange = ymax - ymin || 1

    const W = 100 // viewBox arbitraire — le SVG scale via CSS width/height
    const H = 100
    const pad = 6
    const points = data.map((p, i) => {
      const x = pad + (i / (data.length - 1)) * (W - 2 * pad)
      const y = H - pad - ((p.value - ymin) / yrange) * (H - 2 * pad - 18)
      return [x, y, p] as const
    })
    const line = points
      .map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2))
      .join(' ')
    const lastX = points[points.length - 1][0]
    const area = `${line} L ${lastX.toFixed(2)} ${H - pad} L ${pad} ${H - pad} Z`
    const lastPoint = points[points.length - 1]
    // 3 labels d'abscisse : 1er / milieu / dernier
    const mid = Math.floor(points.length / 2)
    const xLabels = [
      { x: points[0][0], label: data[0].date },
      { x: points[mid][0], label: data[mid].date },
      { x: lastX, label: data[data.length - 1].date },
    ]
    return { line, area, ymin, ymax, lastPoint, xLabels }
  }, [data])

  if (!data || data.length < 2) {
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
      {title && (
        <div className="mb-2 flex items-baseline justify-between">
          <span className="sa-eyebrow">{title}</span>
          <span className="font-mono text-[11px] text-text-3">
            {formatValue(ymin)}
            {unit} · {formatValue(ymax)}
            {unit}
          </span>
        </div>
      )}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height: title ? height - 22 : height }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={color} stopOpacity="0.18" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 3 gridlines (25 / 50 / 75 %) */}
        {[25, 50, 75].map((g) => (
          <line
            key={g}
            x1="6"
            x2="94"
            y1={g + 6}
            y2={g + 6}
            stroke="rgba(18,18,38,0.06)"
            strokeWidth="0.2"
          />
        ))}
        <path d={area} fill={`url(#${areaGradId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Point signal en fin de série */}
        {lastPoint && (
          <>
            <circle cx={lastPoint[0]} cy={lastPoint[1]} r="1.6" fill="#2DD9EE" />
            <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3.5" fill="#2DD9EE" opacity="0.25" />
          </>
        )}
        {/* Labels d'abscisse */}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y="99"
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
            fontSize="3.5"
            fontFamily="'DM Mono',monospace"
            fill="#9C9CB4"
          >
            {l.label.slice(5).replace('-', '/')}
          </text>
        ))}
      </svg>
    </div>
  )
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
  }
  return v.toFixed(Math.abs(v) >= 100 ? 0 : 1).replace('.', ',')
}
