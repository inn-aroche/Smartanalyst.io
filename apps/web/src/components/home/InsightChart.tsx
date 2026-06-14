import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

type ChartPoint = { date: string; value: number }
type ChartData = {
  chart_type: 'line' | 'bar' | 'donut' | 'funnel' | 'sparkline'
  title: string | null
  source: string | null
  metric_key: string
  points: ChartPoint[]
}

// Mini graphe SVG fait main (zéro dépendance — pas de Recharts +50kb).
// Supporte line/bar/sparkline ; donut/funnel retombent sur line (le V1
// produit surtout des séries temporelles single-metric).
export default function InsightChart({
  workspaceId,
  insightId,
}: {
  workspaceId: string
  insightId: string
}) {
  const q = useQuery({
    queryKey: ['insights', 'chart', workspaceId, insightId],
    enabled: Boolean(workspaceId && insightId),
    queryFn: () =>
      apiFetch<{ chart: ChartData | null }>(
        `/api/v1/insights/${insightId}/chart?workspaceId=${workspaceId}`,
      ),
    staleTime: 5 * 60_000,
  })

  // Pas de chart_spec exploitable, erreur, ou <2 points → on n'affiche rien.
  const chart = q.data?.chart
  if (q.isError || !chart || chart.points.length < 2) return null

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      {chart.title && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-text-1">{chart.title}</span>
          {chart.source && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-3">
              {chart.source}
            </span>
          )}
        </div>
      )}
      <Sparkbars points={chart.points} type={chart.chart_type} />
    </div>
  )
}

function Sparkbars({ points, type }: { points: ChartPoint[]; type: ChartData['chart_type'] }) {
  const W = 320
  const H = 64
  const PAD = 4
  const values = points.map((p) => p.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const range = max - min || 1
  const innerW = W - PAD * 2
  const innerH = H - PAD * 2

  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD + innerH - ((v - min) / range) * innerH

  const asBars = type === 'bar'
  const last = points[points.length - 1]
  const first = points[0]
  const delta =
    first.value !== 0 ? ((last.value - first.value) / Math.abs(first.value)) * 100 : null
  const up = (delta ?? 0) >= 0
  const stroke = up ? 'var(--brand-green, #34d399)' : 'var(--brand-red, #f87171)'

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
        {asBars ? (
          points.map((p, i) => {
            const bw = Math.max(1.5, innerW / points.length - 2)
            const yy = y(p.value)
            return (
              <rect
                key={p.date}
                x={x(i) - bw / 2}
                y={yy}
                width={bw}
                height={H - PAD - yy}
                rx={1}
                fill={stroke}
                opacity={0.55}
              />
            )
          })
        ) : (
          <>
            <polyline
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
            />
            {/* dernier point */}
            <circle cx={x(points.length - 1)} cy={y(last.value)} r={2.5} fill={stroke} />
          </>
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-text-3">
        <span>{first.date}</span>
        {delta !== null && (
          <span className={up ? 'text-brand-green' : 'text-brand-red'}>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
        <span>{last.date}</span>
      </div>
    </div>
  )
}
