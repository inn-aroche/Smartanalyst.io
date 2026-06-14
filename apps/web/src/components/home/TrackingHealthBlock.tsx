import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { apiFetch } from '@/lib/api'
import type { TrackingHealth, Confidence } from '@/lib/insights-types'
import { useT } from '@/lib/i18n'

const CONFIDENCE_STYLE: Record<Confidence, { dot: string; label: string; pill: string }> = {
  high: { dot: 'bg-brand-green', label: 'text-brand-green', pill: 'border-brand-green/30 bg-brand-green/10 text-brand-green' },
  medium: { dot: 'bg-brand-cyan', label: 'text-brand-cyan', pill: 'border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan' },
  low: { dot: 'bg-text-3', label: 'text-text-3', pill: 'border-border bg-card text-text-3' },
}

function relativeTime(ts: number | null): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}j`
}

export default function TrackingHealthBlock({ workspaceId }: { workspaceId: string }) {
  const t = useT()
  const q = useQuery({
    queryKey: ['smarttag', 'health', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => apiFetch<TrackingHealth>(`/api/v1/smarttag/health?workspaceId=${workspaceId}`),
    staleTime: 60_000,
  })

  if (q.isLoading) {
    return (
      <div className="sa-card animate-pulse">
        <div className="h-3 w-32 rounded bg-bg-2" />
        <div className="mt-3 h-6 w-48 rounded bg-bg-2" />
        <div className="mt-2 h-4 w-72 rounded bg-bg-2" />
      </div>
    )
  }

  // Si l'endpoint pète, on cache silencieusement le bloc (la Home reste utilisable).
  if (q.isError || !q.data) return null

  const h = q.data
  const conf = CONFIDENCE_STYLE[h.confidence]
  const topEvents = h.by_type.slice(0, 3)

  return (
    <div className="sa-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            {t('home.health.kicker')}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${conf.dot}`} />
            <h2 className="font-head text-lg font-semibold text-text-1">
              {t(h.smarttag_active ? 'home.health.tagActive' : 'home.health.tagInactive')}
            </h2>
            <span
              className={`ml-2 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${conf.pill}`}
            >
              {t(`home.health.confidence.${h.confidence}`)}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-2">
            {h.smarttag_active
              ? t('home.health.activeBody', {
                  ago: relativeTime(h.last_event_at),
                  events7: h.events_last_7d,
                })
              : t('home.health.inactiveBody')}
          </p>
        </div>
        {!h.smarttag_active && (
          <Link to="/smarttag" className="sa-btn !py-1.5 !text-xs whitespace-nowrap">
            {t('home.health.installCta')}
          </Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <Stat label={t('home.health.events7d')} value={h.events_last_7d.toLocaleString()} />
        <Stat label={t('home.health.events30d')} value={h.events_last_30d.toLocaleString()} />
        <Stat label={t('home.health.sources')} value={String(h.connected_sources.length)} />
      </div>

      {topEvents.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topEvents.map((ev, i) => (
            <span
              key={`${ev.event_type}-${ev.event_name}-${i}`}
              className="rounded-full border border-border bg-bg-2 px-2 py-0.5 font-mono text-[10px] text-text-2"
            >
              {ev.event_name || ev.event_type} · {ev.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">{label}</div>
      <div className="mt-0.5 font-head text-base font-semibold text-text-1">{value}</div>
    </div>
  )
}
