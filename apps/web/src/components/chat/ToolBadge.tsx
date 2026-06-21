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
