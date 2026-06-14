// Sparkline — mini-tendance SVG inline (handoff Claude Design sa-charts.jsx).
// Vert si haussier, rouge si baissier (selon prop `up`). Point signal en fin
// de série pour ancrer l'œil sur la valeur courante.

import { useId } from 'react'

type Props = {
  data: number[]
  up?: boolean
  w?: number
  h?: number
  fill?: boolean
}

export default function Sparkline({ data, up = true, w = 88, h = 28, fill = true }: Props) {
  const reactId = useId().replace(/:/g, '')
  const gradId = `spark-grad-${reactId}`
  if (!data || data.length < 2) {
    return <svg width={w} height={h} aria-hidden="true" />
  }
  const color = up ? '#1FA873' : '#E0495C'
  const min = Math.min(...data)
  const max = Math.max(...data)
  const rng = max - min || 1
  const pts = data.map(
    (v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / rng) * (h - 5)] as const,
  )
  const line = pts
    .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
    .join(' ')
  const area = `${line} L ${w} ${h} L 0 ${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg width={w} height={h} className="block overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradId})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  )
}
