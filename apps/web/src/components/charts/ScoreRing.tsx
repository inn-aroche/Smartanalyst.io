// ScoreRing — jauge circulaire 0-100 avec arc dégradé bleu→cyan.
// Implémentation : SVG natif, ~30 lignes, anim CSS sur stroke-dashoffset.
// Brief V2 §3.1 + handoff Claude Design (sa-charts.jsx → ScoreRing).

import { useId } from 'react'

type Props = {
  value: number
  size?: number
  stroke?: number
  label?: string
  delta?: number | null
}

export default function ScoreRing({ value, size = 132, stroke = 11, label, delta = null }: Props) {
  // useId garantit un id unique par instance — sinon plusieurs anneaux
  // partageraient le même <linearGradient> et la 2e instance hériterait
  // de la 1re (bug SVG classique).
  const reactId = useId().replace(/:/g, '')
  const gradId = `score-grad-${reactId}`
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const C = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, value))
  const off = C * (1 - clamped / 100)
  const deltaColor = (delta ?? 0) >= 0 ? 'text-brand-green' : 'text-brand-red'
  const valueSize = size * 0.3
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#5C8FFF" />
            <stop offset="1" stopColor="#2DD9EE" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E5EC" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="font-head font-extrabold leading-none tracking-[-0.03em] text-text-1"
          style={{ fontSize: valueSize }}
        >
          {Math.round(clamped)}
        </div>
        {label && (
          <div className="mt-[3px] font-mono text-[10px] tracking-[0.06em] text-text-3">
            {label}
          </div>
        )}
        {delta != null && (
          <div className={`mt-0.5 font-mono text-[11px] font-medium ${deltaColor}`}>
            {delta >= 0 ? '+' : ''}
            {delta} pts
          </div>
        )}
      </div>
    </div>
  )
}
