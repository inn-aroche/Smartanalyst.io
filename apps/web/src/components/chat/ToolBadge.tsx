// ToolBadge — chip "🔌 Lecture GA4…" affiche pendant qu'un tool tourne
// (cahier 22b §3.5). Le backend emet { type:'tool', name, status:'running'|'done' }
// dans le stream SSE — Chat.tsx maintient un set de tools `running` et rend
// un ToolBadge par tool.
//
// On affiche le badge pendant au moins 350ms (meme si le tool revient en
// 50ms) pour eviter un flash desagreable.

import { useEffect, useState } from 'react'

import { useT, type StringKey } from '@/lib/i18n'

/** Cle i18n du libelle pour un tool donne. Fallback "Interrogation <name>" si non mappe. */
function labelKey(toolName: string): StringKey | null {
  const map: Record<string, StringKey> = {
    get_health_score: 'chat.tool.running.get_health_score',
    list_top_insights: 'chat.tool.running.list_top_insights',
    list_pending_actions: 'chat.tool.running.list_pending_actions',
    get_metric_series: 'chat.tool.running.get_metric_series',
    get_traffic_sources: 'chat.tool.running.get_traffic_sources',
    create_action_card: 'chat.tool.running.create_action_card',
    create_watch: 'chat.tool.running.create_watch',
    compute_table_from_metrics: 'chat.tool.running.compute_table_from_metrics',
    compare_metrics: 'chat.tool.running.compare_metrics',
    compute_funnel: 'chat.tool.running.compute_funnel',
    build_dashboard_preview: 'chat.tool.running.build_dashboard_preview',
    query_ga4: 'chat.tool.running.query_ga4',
    query_meta_ads: 'chat.tool.running.query_meta_ads',
    query_stripe: 'chat.tool.running.query_stripe',
    query_shopify: 'chat.tool.running.query_shopify',
    query_search_console: 'chat.tool.running.query_search_console',
    analyze_performance: 'chat.tool.running.analyze',
    analyze_journey: 'chat.tool.running.analyze',
    analyze_benchmark: 'chat.tool.running.analyze',
  }
  return map[toolName] || null
}

export default function ToolBadge({ toolName }: { toolName: string }) {
  const t = useT()
  const key = labelKey(toolName)
  const label = key ? t(key) : `${t('chat.tool.running')} ${toolName}…`
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-brand-cyan">
      <Spinner />
      <span className="truncate">{label}</span>
    </span>
  )
}

function Spinner() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="animate-spin">
      <circle
        cx="5"
        cy="5"
        r="3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.3"
      />
      <path
        d="M5 1.5 A 3.5 3.5 0 0 1 8.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Hook qui maintient le set des tools `running` avec un debounce 350ms a la
 * disparition pour eviter le flash. Utilise par Chat.tsx.
 */
export function useRunningTools(
  events: Array<{ name: string; status: 'running' | 'done' }>,
): string[] {
  const [running, setRunning] = useState<string[]>([])
  useEffect(() => {
    if (events.length === 0) return
    const last = events[events.length - 1]
    if (last.status === 'running') {
      setRunning((r) => (r.includes(last.name) ? r : [...r, last.name]))
      return
    }
    // status === 'done' → on enleve apres 350ms.
    const tm = setTimeout(() => {
      setRunning((r) => r.filter((n) => n !== last.name))
    }, 350)
    return () => clearTimeout(tm)
  }, [events])
  return running
}

/**
 * Liste des tools dont le retour produit un visuel auto-injecte (chart / table
 * / compare). Cahier 22b §3.5 — "skeleton intelligent" : on affiche un
 * placeholder de la bonne FORME pendant le tool call pour rassurer l'user
 * (qu'il sait qu'un chart va arriver).
 */
const VISUAL_TOOLS = new Set([
  'get_metric_series',
  'compute_table_from_metrics',
  'compare_metrics',
  'compute_funnel',
  'build_dashboard_preview',
])

export type SkeletonKind = 'chart' | 'table' | 'compare' | 'funnel' | 'dashboard'

export function visualKindFor(toolName: string): SkeletonKind | null {
  if (toolName === 'get_metric_series') return 'chart'
  if (toolName === 'compute_table_from_metrics') return 'table'
  if (toolName === 'compare_metrics') return 'compare'
  if (toolName === 'compute_funnel') return 'funnel'
  if (toolName === 'build_dashboard_preview') return 'dashboard'
  return null
}

/**
 * Skeleton place-holder de la forme du bloc qui va arriver. Pulsation lente
 * (ne distrait pas), couleur cohérente avec le bloc final.
 */
export function VisualSkeleton({ kind }: { kind: SkeletonKind }) {
  if (kind === 'chart') {
    return (
      <div
        className="h-[160px] w-full animate-pulse rounded-brief border border-border bg-bg-2/40 p-4"
        aria-label="Loading chart"
      >
        <div className="mb-3 h-3 w-1/3 rounded bg-bg-3" />
        <div className="flex h-[100px] items-end gap-1.5">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-bg-3"
              style={{ height: `${30 + ((i * 13) % 60)}%` }}
            />
          ))}
        </div>
      </div>
    )
  }
  if (kind === 'compare') {
    return (
      <div className="grid grid-cols-2 gap-3 rounded-brief border border-border bg-bg-2/40 p-4">
        {[0, 1].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="mb-2 h-2 w-1/2 rounded bg-bg-3" />
            <div className="flex h-[80px] items-end gap-1">
              {Array.from({ length: 8 }).map((_, j) => (
                <div
                  key={j}
                  className="flex-1 rounded-t bg-bg-3"
                  style={{ height: `${40 + ((j * 13) % 50)}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'funnel') {
    // Decreasing bars stack.
    return (
      <div className="w-full animate-pulse rounded-brief border border-border bg-bg-2/40 p-4">
        <div className="mb-3 h-3 w-1/4 rounded bg-bg-3" />
        <div className="flex flex-col gap-2">
          {[100, 60, 30, 10].map((w, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-2 w-1/3 rounded bg-bg-3" />
              <div className="h-2 rounded-full bg-bg-3" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (kind === 'dashboard') {
    // 4 cards grid.
    return (
      <div className="w-full animate-pulse rounded-brief border border-border bg-bg-2/40 p-4">
        <div className="mb-3 h-3 w-1/3 rounded bg-bg-3" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[10px] border border-border/60 bg-card p-3">
              <div className="h-2 w-1/2 rounded bg-bg-3" />
              <div className="mt-1.5 h-5 w-3/4 rounded bg-bg-3" />
              <div className="mt-1 h-2 w-1/3 rounded bg-bg-3" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  // table
  return (
    <div className="w-full animate-pulse overflow-hidden rounded-brief border border-border bg-bg-2/40">
      <div className="border-b border-border px-3 py-2">
        <div className="h-3 w-1/4 rounded bg-bg-3" />
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-3 w-full rounded bg-bg-3" />
        ))}
      </div>
    </div>
  )
}

export function pickSkeletonKinds(runningToolNames: string[]): SkeletonKind[] {
  const kinds: SkeletonKind[] = []
  for (const name of runningToolNames) {
    if (!VISUAL_TOOLS.has(name)) continue
    const k = visualKindFor(name)
    if (k && !kinds.includes(k)) kinds.push(k)
  }
  return kinds
}
