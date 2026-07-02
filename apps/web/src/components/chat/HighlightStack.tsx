// HighlightStack — empile 0-3 "highlights" visuels sous une réponse assistant.
// Le backend (chat-highlights.service) extrait ces highlights via une 2e passe
// Gemini structurée à partir de la prose finale. Côté UI, on les rend en
// cartes design pour rendre le chat lisible "pour tous les niveaux" sans
// noyer l'user de chiffres dans le texte.

import { useState } from 'react'
import { Link } from 'react-router-dom'

import Sparkline from '@/components/charts/Sparkline'
import { apiFetch } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'
import VerdictHighlight from './verdict/VerdictHighlight'
import type { VerdictSpec } from './verdict/types'

export type ActionPlanStep = {
  title: string
  description?: string | null
  priority?: 'critical' | 'high' | 'medium' | 'low'
  impact?: number | null
  effort?: number | null
}

export type Highlight = {
  // Lot V2.3 — types funnel / dashboard ; Cahier 22c — type `verdict` ;
  // C1 — type `action_plan` (plan séquencé matérialisable en tâches).
  type:
    | 'kpi'
    | 'callout'
    | 'chart'
    | 'table'
    | 'compare'
    | 'funnel'
    | 'dashboard'
    | 'verdict'
    | 'action_plan'
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
  // Pour type='table' (Lot V2.2) — auto-inject par compute_table_from_metrics.
  // columns[] = noms de colonnes (1ere = dim, suivantes = metrics).
  // rows[] = objets {[col]: value}. truncated = true si le backend a coupe a 10.
  columns?: string[] | null
  rows?: Array<Record<string, string | number | null>> | null
  truncated?: boolean | null
  // Pour type='compare' (Lot V2.2) — auto-inject par compare_metrics.
  left?: { source: string; total: number; series: Array<{ date: string; value: number }> } | null
  right?: { source: string; total: number; series: Array<{ date: string; value: number }> } | null
  // Pour type='funnel' (Lot V2.3) — auto-inject par compute_funnel.
  steps?: Array<{ label: string; value: number; retentionPct: number | null }> | null
  // Pour type='dashboard' (Lot V2.3) — auto-inject par build_dashboard_preview.
  cards?: Array<{
    metricKey: string
    value: number
    previousValue?: number | null
    deltaPct?: number | null
  }> | null
  // Pour type='verdict' (Cahier 22c) — verdict analyste structure.
  // Le shape complet est defini dans ./verdict/types.ts. On accepte unknown
  // ici pour eviter une dependance circulaire dans le type Highlight.
  spec?: unknown
  // Pour type='action_plan' (C1) — étapes du plan proposé par l'assistant.
  // `title` porte l'objectif du plan. Nommé planSteps pour ne pas entrer en
  // collision avec `steps` (funnel).
  planSteps?: ActionPlanStep[] | null
}

export default function HighlightStack({
  highlights,
  onPin,
  canPin = false,
  workspaceId = null,
}: {
  highlights: Highlight[]
  /** Callback Pin to dashboard (cahier 22b §3.4). Optionnel : si absent, pas de bouton. */
  onPin?: (spec: { kind: 'kpi' | 'chart'; spec: Record<string, unknown> }) => void
  /** Plan Pro requis pour Pin — sinon bouton montre un cadenas. */
  canPin?: boolean
  /** Requis pour matérialiser un action_plan en tâches (POST /insights/actions). */
  workspaceId?: string | null
}) {
  if (!highlights || highlights.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {highlights.map((h, i) => {
        // Cahier 22c — verdict est le top du stack (place EN PREMIER quand
        // present). Ici on respecte juste l'ordre du backend.
        if (h.type === 'verdict' && h.spec) {
          return <VerdictHighlight key={i} spec={h.spec as VerdictSpec} />
        }
        if (h.type === 'action_plan') {
          return <ActionPlanHighlight key={i} h={h} workspaceId={workspaceId} />
        }
        if (h.type === 'dashboard')
          return <DashboardHighlight key={i} h={h} onPin={onPin} canPin={canPin} />
        if (h.type === 'funnel') return <FunnelHighlight key={i} h={h} />
        if (h.type === 'compare') return <CompareHighlight key={i} h={h} />
        if (h.type === 'table') return <TableHighlight key={i} h={h} />
        if (h.type === 'chart')
          return <ChartHighlight key={i} h={h} onPin={onPin} canPin={canPin} />
        if (h.type === 'kpi') return <KpiHighlight key={i} h={h} onPin={onPin} canPin={canPin} />
        return <CalloutHighlight key={i} h={h} />
      })}
    </div>
  )
}

// ─── Action plan (C1 — crochet d'action principal) ───────────────────────
// Plan séquencé proposé par l'assistant : l'user coche les étapes puis les
// matérialise en tâches d'un clic. AUCUNE écriture tant qu'il n'a pas cliqué
// (idempotence par design).

const PLAN_PRIORITY_STYLE: Record<string, string> = {
  critical: 'bg-brand-red/10 text-brand-red',
  high: 'bg-brand-red/10 text-brand-red',
  medium: 'bg-brand-amber/10 text-brand-amber',
  low: 'bg-brand-blue-dim text-brand-blue-deep',
}

function ActionPlanHighlight({ h, workspaceId }: { h: Highlight; workspaceId?: string | null }) {
  const t = useT()
  const steps = h.planSteps ?? []
  const [checked, setChecked] = useState<boolean[]>(() => steps.map(() => true))
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  if (steps.length === 0) return null
  const selectedCount = checked.filter(Boolean).length

  async function addTasks() {
    if (!workspaceId || selectedCount === 0 || state === 'pending' || state === 'done') return
    setState('pending')
    try {
      for (let i = 0; i < steps.length; i++) {
        if (!checked[i]) continue
        await apiFetch('/api/v1/insights/actions', {
          method: 'POST',
          body: {
            workspaceId,
            title: steps[i].title,
            ...(steps[i].description ? { description: steps[i].description } : {}),
            priority: steps[i].priority || 'medium',
            ...(steps[i].impact ? { impact: steps[i].impact } : {}),
            ...(steps[i].effort ? { effort: steps[i].effort } : {}),
            source: 'chat',
          },
        })
      }
      track('chat_action_taken', { tool: 'propose_action_plan', steps: selectedCount })
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="rounded-brief border border-brand-blue-deep/25 bg-card p-4 shadow-card">
      <div className="font-mono text-[10px] uppercase tracking-widest text-brand-blue-deep">
        {t('chat.actionPlan.badge')}
      </div>
      <div className="mt-1 text-[14px] font-semibold text-text-1">{h.title}</div>
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 rounded-[10px] border border-border bg-bg-2 px-3 py-2.5"
          >
            <input
              type="checkbox"
              checked={checked[i]}
              disabled={state === 'done' || state === 'pending'}
              onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
              className="mt-0.5 accent-brand-blue-deep"
              aria-label={s.title}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-text-1">
                  <span className="mr-1.5 font-mono text-[10.5px] text-text-3">{i + 1}.</span>
                  {s.title}
                </span>
                {s.priority && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${
                      PLAN_PRIORITY_STYLE[s.priority] || PLAN_PRIORITY_STYLE.medium
                    }`}
                  >
                    {t(`chat.actionPlan.prio.${s.priority}` as never)}
                  </span>
                )}
                {(s.impact || s.effort) && (
                  <span className="font-mono text-[10px] text-text-3">
                    {s.impact ? `${t('chat.actionPlan.impact')} ${s.impact}/5` : ''}
                    {s.impact && s.effort ? ' · ' : ''}
                    {s.effort ? `${t('chat.actionPlan.effort')} ${s.effort}/5` : ''}
                  </span>
                )}
              </div>
              {s.description && (
                <p className="mt-0.5 text-[12px] leading-snug text-text-2">{s.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-2.5">
        {state === 'done' ? (
          <>
            <span className="text-[12.5px] font-medium text-brand-green">
              ✓ {t('chat.actionPlan.added')}
            </span>
            <Link
              to="/tasks"
              className="text-[12.5px] text-brand-blue-deep underline underline-offset-2"
            >
              {t('chat.actionPlan.viewTasks')}
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void addTasks()}
              disabled={selectedCount === 0 || state === 'pending' || !workspaceId}
              className="sa-btn sa-btn-primary !py-1.5 !text-xs disabled:opacity-50"
            >
              {state === 'pending' ? '…' : `${t('chat.actionPlan.add')} (${selectedCount})`}
            </button>
            {state === 'error' && (
              <span className="text-[12px] text-brand-red">{t('chat.actionPlan.failed')}</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Chart (auto-injecté quand un tool retourne une série temporelle) ────
// Pleine largeur, axe x = dates abrégées, axe y = max auto. Bar par défaut
// (plus lisible pour les daily breakdowns courts) ; line si chartKind='line'.

function ChartHighlight({
  h,
  onPin,
  canPin,
}: {
  h: Highlight
  onPin?: (spec: { kind: 'kpi' | 'chart'; spec: Record<string, unknown> }) => void
  canPin?: boolean
}) {
  const data = h.series && h.series.length >= 2 ? h.series : null
  if (!data) return null
  const max = Math.max(...data.map((p) => p.value), 1)
  const kind = h.chartKind || 'bar'
  return (
    <div className="group/highlight relative rounded-brief border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-semibold text-text-1">{h.title}</div>
        {h.summary && <div className="truncate text-[11.5px] text-text-3">{h.summary}</div>}
      </div>
      {kind === 'bar' ? <BarChart data={data} max={max} /> : <LineChart data={data} max={max} />}
      {onPin && (
        <PinButton
          canPin={canPin}
          onClick={() =>
            onPin({
              kind: 'chart',
              spec: {
                title: h.title,
                series: data,
                unit: h.unit ?? null,
                metricKey: h.metricKey ?? null,
              },
            })
          }
        />
      )}
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

function KpiHighlight({
  h,
  onPin,
  canPin,
}: {
  h: Highlight
  onPin?: (spec: { kind: 'kpi' | 'chart'; spec: Record<string, unknown> }) => void
  canPin?: boolean
}) {
  // Si l'IA a marqué `deltaUp` on l'utilise tel quel ; sinon on fait au mieux
  // en sniffant le signe du delta ("+8%" → up, "-3%" → down).
  const up = h.deltaUp ?? (h.delta ? !h.delta.trimStart().startsWith('-') : true)
  return (
    <div className="group/highlight relative flex items-center justify-between gap-4 rounded-brief border border-border bg-card p-4 shadow-card">
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
      {onPin && (
        <PinButton
          canPin={canPin}
          onClick={() =>
            onPin({
              kind: 'kpi',
              spec: {
                title: h.title,
                value: h.value,
                delta: h.delta,
                unit: h.unit ?? null,
                metricKey: h.metricKey ?? null,
              },
            })
          }
        />
      )}
    </div>
  )
}

/**
 * Bouton "📌 Épingler" rendu en absolute top-right des cartes pinnables
 * (kpi / chart / dashboard cards). Apparait au hover desktop, toujours
 * visible sur mobile. Si canPin=false, montre un cadenas + title="Pro requis".
 */
function PinButton({ onClick, canPin }: { onClick: () => void; canPin?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={canPin ? 'Épingler au dashboard' : 'Plan Pro requis pour épingler'}
      aria-label={canPin ? 'Épingler au dashboard' : 'Épingler (Plan Pro requis)'}
      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-[14px] text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-1 group-hover/highlight:opacity-100 md:group-hover/highlight:opacity-100"
    >
      {canPin ? '📌' : '🔒'}
    </button>
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

// ─── Table (Lot V2.2 — cahier 22b §3.3) ──────────────────────────────────
// Auto-injectee par compute_table_from_metrics. Tri client sur n'importe
// quelle colonne (click sur le header), max 10 lignes visibles.

function TableHighlight({ h }: { h: Highlight }) {
  const columns = h.columns || []
  const rows = h.rows || []
  if (columns.length === 0 || rows.length === 0) return null
  return (
    <SortableTable
      title={h.title}
      summary={h.summary}
      columns={columns}
      rows={rows}
      truncated={!!h.truncated}
    />
  )
}

function SortableTable({
  title,
  summary,
  columns,
  rows,
  truncated,
}: {
  title: string
  summary?: string | null
  columns: string[]
  rows: Array<Record<string, string | number | null>>
  truncated: boolean
}) {
  // Tri par defaut : 2e colonne desc (la 1ere = dimension/source, 2eme =
  // metric principale). L'user peut cliquer un header pour changer.
  const defaultCol = columns[1] || columns[0]
  const [sortCol, setSortCol] = useStateLocal<string>(defaultCol)
  const [sortDir, setSortDir] = useStateLocal<'asc' | 'desc'>('desc')

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol]
    const bv = b[sortCol]
    const an = typeof av === 'number' ? av : Number.isFinite(Number(av)) ? Number(av) : null
    const bn = typeof bv === 'number' ? bv : Number.isFinite(Number(bv)) ? Number(bv) : null
    if (an !== null && bn !== null) return sortDir === 'desc' ? bn - an : an - bn
    const as = String(av ?? '')
    const bs = String(bv ?? '')
    return sortDir === 'desc' ? bs.localeCompare(as) : as.localeCompare(bs)
  })

  function toggleSort(col: string) {
    if (col === sortCol) setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  return (
    <div className="overflow-hidden rounded-brief border border-border bg-card shadow-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="text-[13px] font-semibold text-text-1">{title}</div>
        {summary && <div className="truncate text-[11.5px] text-text-3">{summary}</div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 bg-bg-2">
            <tr>
              {columns.map((c) => {
                const isSort = c === sortCol
                return (
                  <th
                    key={c}
                    onClick={() => toggleSort(c)}
                    className={[
                      'cursor-pointer select-none px-3 py-2 text-left font-mono text-[10.5px] uppercase tracking-wider transition-colors',
                      isSort ? 'text-text-1' : 'text-text-3 hover:text-text-1',
                    ].join(' ')}
                  >
                    {c}
                    {isSort && (
                      <span aria-hidden="true" className="ml-1 text-[9px]">
                        {sortDir === 'desc' ? '▼' : '▲'}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-t border-border/60 hover:bg-bg-2/40">
                {columns.map((c) => {
                  const v = row[c]
                  const isNum = typeof v === 'number'
                  return (
                    <td
                      key={c}
                      className={[
                        'px-3 py-1.5 text-text-1',
                        isNum ? 'text-right font-mono tabular-nums' : '',
                      ].join(' ')}
                    >
                      {v == null ? '—' : isNum ? formatValue(v) : String(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <div className="border-t border-border bg-bg-2/60 px-3 py-1.5 text-center font-mono text-[10px] uppercase tracking-widest text-text-3">
          Top 10 — pour le détail, exporte en Excel
        </div>
      )}
    </div>
  )
}

function useStateLocal<T>(initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial)
  return [v, setV]
}

// ─── Compare (Lot V2.2 — cahier 22b §3.3) ────────────────────────────────
// Split-view 2 mini-charts cote a cote. Echelle Y partagee pour comparer
// visuellement les deux series sans biais.

function CompareHighlight({ h }: { h: Highlight }) {
  const left = h.left
  const right = h.right
  if (!left?.series?.length || !right?.series?.length) return null
  // Echelle Y commune = max des 2 series pour comparaison honnete.
  const sharedMax = Math.max(
    ...left.series.map((p) => p.value),
    ...right.series.map((p) => p.value),
    1,
  )
  return (
    <div className="rounded-brief border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-semibold text-text-1">{h.title}</div>
        {h.summary && <div className="truncate text-[11.5px] text-text-3">{h.summary}</div>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CompareSide
          source={left.source}
          total={left.total}
          series={left.series}
          max={sharedMax}
          unit={h.unit}
        />
        <CompareSide
          source={right.source}
          total={right.total}
          series={right.series}
          max={sharedMax}
          unit={h.unit}
        />
      </div>
    </div>
  )
}

function CompareSide({
  source,
  total,
  series,
  max,
  unit,
}: {
  source: string
  total: number
  series: Array<{ date: string; value: number }>
  max: number
  unit: string | null | undefined
}) {
  return (
    <div className="rounded-[10px] border border-border bg-bg-2/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
          {source}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-text-1">
          {formatValue(total)}
          {unit || ''}
        </span>
      </div>
      <div className="h-[80px]">
        <BarChart data={series} max={max} />
      </div>
    </div>
  )
}

// ─── Funnel (Lot V2.3 — cahier 22b §3.3) ─────────────────────────────────
// Barres decroissantes avec % retention entre etapes. Le visuel est plus
// parlant qu'une bullet-list "1000 → 250 → 50".

function FunnelHighlight({ h }: { h: Highlight }) {
  const steps = h.steps || []
  if (steps.length < 2) return null
  const max = Math.max(...steps.map((s) => s.value), 1)
  return (
    <div className="rounded-brief border border-border bg-card p-4 shadow-card">
      <div className="mb-3 text-[13px] font-semibold text-text-1">{h.title}</div>
      <div className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const widthPct = (s.value / max) * 100
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-3">
                  {humanizeLabel(s.label)}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-text-1">
                  {formatValue(s.value)}
                  {s.retentionPct != null && (
                    <span className="ml-2 text-[10.5px] text-text-3">
                      ({s.retentionPct}% vs étape préc.)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-bg-2">
                <div
                  className="h-full rounded-full bg-brand-blue-deep transition-all"
                  style={{ width: `${Math.max(widthPct, 2)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard preview (Lot V2.3 — cahier 22b §3.3) ──────────────────────
// Grille de 4-6 KPI cards avec delta vs N-1. Chaque card est epinglable
// individuellement au dashboard reel (BriefHome).

function DashboardHighlight({
  h,
  onPin,
  canPin,
}: {
  h: Highlight
  onPin?: (spec: { kind: 'kpi' | 'chart'; spec: Record<string, unknown> }) => void
  canPin?: boolean
}) {
  const cards = h.cards || []
  if (cards.length === 0) return null
  return (
    <div className="rounded-brief border border-border bg-card p-4 shadow-card">
      <div className="mb-3 text-[13px] font-semibold text-text-1">{h.title}</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {cards.map((c, i) => (
          <DashboardCard key={i} card={c} onPin={onPin} canPin={canPin} />
        ))}
      </div>
    </div>
  )
}

function DashboardCard({
  card,
  onPin,
  canPin,
}: {
  card: NonNullable<Highlight['cards']>[number]
  onPin?: (spec: { kind: 'kpi' | 'chart'; spec: Record<string, unknown> }) => void
  canPin?: boolean
}) {
  const isUp = (card.deltaPct ?? 0) >= 0
  const label = humanizeLabel(card.metricKey)
  return (
    <div className="group/highlight relative rounded-[10px] border border-border bg-bg-2/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-3">{label}</div>
      <div className="mt-1 font-head text-[20px] font-bold tracking-[-0.02em] text-text-1">
        {formatValue(card.value)}
      </div>
      {card.deltaPct != null && (
        <div
          className={`mt-0.5 font-mono text-[11px] ${isUp ? 'text-brand-green' : 'text-brand-red'}`}
        >
          {isUp ? '+' : ''}
          {card.deltaPct}% vs N-1
        </div>
      )}
      {onPin && (
        <PinButton
          canPin={canPin}
          onClick={() =>
            onPin({
              kind: 'kpi',
              spec: {
                title: label,
                value: formatValue(card.value),
                delta: card.deltaPct != null ? `${isUp ? '+' : ''}${card.deltaPct}%` : null,
                metricKey: card.metricKey,
              },
            })
          }
        />
      )}
    </div>
  )
}

function humanizeLabel(raw: string | null | undefined): string {
  if (!raw) return '—'
  // metric_key → "Add To Cart"
  return raw.replace(/_/g, ' ').replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1))
}
