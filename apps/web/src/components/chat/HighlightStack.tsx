// HighlightStack — empile 0-3 "highlights" visuels sous une réponse assistant.
// Le backend (chat-highlights.service) extrait ces highlights via une 2e passe
// Gemini structurée à partir de la prose finale. Côté UI, on les rend en
// cartes design pour rendre le chat lisible "pour tous les niveaux" sans
// noyer l'user de chiffres dans le texte.

import { Link } from 'react-router-dom'

import Sparkline from '@/components/charts/Sparkline'

export type Highlight = {
  type: 'kpi' | 'callout' | 'chart'
  title: string
  value?: string | null
  delta?: string | null
  deltaUp?: boolean | null
  tone?: 'good' | 'mid' | 'bad' | 'info'
  icon?: string | null
  summary?: string | null
  metricKey?: string | null
  sourceIds?: number[]
  sparkline?: number[] | null
  cta?: { href: string; label: string } | null
  // Pour type='chart' (auto-injecté backend quand un tool retourne une série
  // temporelle) : série complète + labels x. Permet un vrai histogramme/courbe
  // pleine largeur dans la réponse.
  series?: Array<{ date: string; value: number }> | null
  chartKind?: 'bar' | 'line' | null
  unit?: string | null
}

export default function HighlightStack({ highlights }: { highlights: Highlight[] }) {
  if (!highlights || highlights.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {highlights.map((h, i) => {
        if (h.type === 'chart') return <ChartHighlight key={i} h={h} />
        if (h.type === 'kpi') return <KpiHighlight key={i} h={h} />
        return <CalloutHighlight key={i} h={h} />
      })}
    </div>
  )
}

// ─── Chart (auto-injecté quand un tool retourne une série temporelle) ────
// Pleine largeur, axe x = dates abrégées, axe y = max auto. Bar par défaut
// (plus lisible pour les daily breakdowns courts) ; line si chartKind='line'.

function ChartHighlight({ h }: { h: Highlight }) {
  const data = h.series && h.series.length >= 2 ? h.series : null
  if (!data) return null
  const max = Math.max(...data.map((p) => p.value), 1)
  const kind = h.chartKind || 'bar'
  return (
    <div className="rounded-brief border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-semibold text-text-1">{h.title}</div>
        {h.summary && <div className="truncate text-[11.5px] text-text-3">{h.summary}</div>}
      </div>
      {kind === 'bar' ? <BarChart data={data} max={max} /> : <LineChart data={data} max={max} />}
    </div>
  )
}

function BarChart({ data, max }: { data: Array<{ date: string; value: number }>; max: number }) {
  // Hauteur fixe 120px, largeur des barres calculée pour occuper toute la
  // largeur du container avec un gap de 6px. SVG rendu inline pour le contrôle
  // pixel-parfait + accessible via aria-label.
  const barW = `calc((100% - ${(data.length - 1) * 6}px) / ${data.length})`
  return (
    <div
      className="flex h-[120px] items-end gap-1.5"
      role="img"
      aria-label={`Bar chart, ${data.length} points, max ${max}`}
    >
      {data.map((p) => {
        const hPct = max > 0 ? (p.value / max) * 100 : 0
        return (
          <div
            key={p.date}
            className="flex flex-col items-center"
            style={{ width: barW }}
            title={`${p.date} — ${formatValue(p.value)}`}
          >
            <div className="flex h-full w-full flex-col justify-end">
              <div
                className="w-full rounded-t-[3px] bg-brand-blue-deep transition-all"
                style={{ height: `${Math.max(hPct, 2)}%` }}
              />
            </div>
            <div
              className="mt-1 truncate font-mono text-[9px] uppercase text-text-3"
              style={{ maxWidth: '100%' }}
            >
              {formatDateShort(p.date)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LineChart({ data, max }: { data: Array<{ date: string; value: number }>; max: number }) {
  const w = 100
  const h = 30
  const step = data.length > 1 ? w / (data.length - 1) : 0
  const points = data
    .map((p, i) => `${i * step},${h - (max > 0 ? (p.value / max) * h : 0)}`)
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-[120px] w-full"
      role="img"
      aria-label={`Line chart, ${data.length} points, max ${max}`}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
        className="text-brand-blue-deep"
      />
    </svg>
  )
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000)
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
  return String(Math.round(v * 100) / 100)
}

function formatDateShort(iso: string): string {
  // "2026-06-14" → "14/6"
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${parseInt(m[2], 10)}/${parseInt(m[1], 10)}`
}

// ─── KPI ────────────────────────────────────────────────────────────────

function KpiHighlight({ h }: { h: Highlight }) {
  // Si l'IA a marqué `deltaUp` on l'utilise tel quel ; sinon on fait au mieux
  // en sniffant le signe du delta ("+8%" → up, "-3%" → down).
  const up = h.deltaUp ?? (h.delta ? !h.delta.trimStart().startsWith('-') : true)
  return (
    <div className="flex items-center justify-between gap-4 rounded-brief border border-border bg-card p-4 shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider ${toneText(h.tone)}`}
          >
            {h.title}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2.5">
          {h.value && (
            <span className="whitespace-nowrap font-head text-[26px] font-bold leading-none tracking-[-0.02em] text-text-1">
              {h.value}
            </span>
          )}
          {h.delta && (
            <span
              className={`font-mono text-[13px] font-medium ${up ? 'text-brand-green' : 'text-brand-red'}`}
            >
              {h.delta}
            </span>
          )}
        </div>
        {h.summary && (
          <div className="mt-1.5 text-[12.5px] leading-snug text-text-2">{h.summary}</div>
        )}
      </div>
      {h.sparkline && h.sparkline.length >= 2 && (
        <Sparkline data={h.sparkline} up={up} w={88} h={32} />
      )}
    </div>
  )
}

// ─── Callout ────────────────────────────────────────────────────────────

function CalloutHighlight({ h }: { h: Highlight }) {
  const tone = h.tone || 'info'
  const palette = TONE_STYLES[tone]
  return (
    <div
      className={`flex items-start gap-3 rounded-brief border p-3.5 ${palette.bg} ${palette.border}`}
    >
      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] font-head text-sm font-bold ${palette.iconBg} ${palette.iconText}`}
      >
        {iconGlyph(h.icon, tone)}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[13.5px] font-semibold leading-tight ${palette.titleText}`}>
          {h.title}
        </div>
        {h.summary && (
          <div className="mt-1 text-[12.5px] leading-snug text-text-2">{h.summary}</div>
        )}
        {h.cta && (
          <Link
            to={h.cta.href}
            className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-blue-deep hover:underline"
          >
            {h.cta.label} →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Tone palette ───────────────────────────────────────────────────────

const TONE_STYLES = {
  good: {
    bg: 'bg-brand-green/8',
    border: 'border-brand-green/25',
    iconBg: 'bg-brand-green/15',
    iconText: 'text-brand-green',
    titleText: 'text-text-1',
  },
  bad: {
    bg: 'bg-brand-red/8',
    border: 'border-brand-red/25',
    iconBg: 'bg-brand-red/15',
    iconText: 'text-brand-red',
    titleText: 'text-text-1',
  },
  mid: {
    bg: 'bg-brand-amber/8',
    border: 'border-brand-amber/25',
    iconBg: 'bg-brand-amber/15',
    iconText: 'text-brand-amber',
    titleText: 'text-text-1',
  },
  info: {
    bg: 'bg-brand-blue-dim',
    border: 'border-brand-blue-deep/25',
    iconBg: 'bg-brand-blue-deep/15',
    iconText: 'text-brand-blue-deep',
    titleText: 'text-text-1',
  },
} as const

function toneText(tone: Highlight['tone']) {
  switch (tone) {
    case 'good':
      return 'text-brand-green'
    case 'bad':
      return 'text-brand-red'
    case 'mid':
      return 'text-brand-amber'
    default:
      return 'text-brand-blue-deep'
  }
}

function iconGlyph(icon: string | null | undefined, tone: Highlight['tone']) {
  switch (icon) {
    case 'trending_up':
      return '↗'
    case 'trending_down':
      return '↘'
    case 'warning':
      return '!'
    case 'check':
      return '✓'
    case 'lightbulb':
      return '✦'
    case 'info':
      return 'i'
    default:
      // Fallback selon la tonalité.
      return tone === 'good' ? '✓' : tone === 'bad' ? '!' : tone === 'mid' ? '!' : 'i'
  }
}
