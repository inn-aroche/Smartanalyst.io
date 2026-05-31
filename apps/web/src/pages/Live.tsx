import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import CopyButton from '@/components/CopyButton'
import { useAuth } from '@/lib/auth'
import { type StringKey, useT } from '@/lib/i18n'

type EventType = 'pageview' | 'click' | 'error' | 'session_start' | 'custom'

type LiveEvent = {
  type: EventType
  sid: string
  ts: number
  url: string
  ref?: string
  el?: string
  name?: string
  err?: string
  props?: Record<string, string | number | boolean>
  meta?: { country?: string; ipPrefix?: string }
}

type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'unauthorized'
type FilterValue = EventType | 'all'

const WINDOW_MS = 5 * 60_000 // 5 min sliding window
const MAX_EVENTS = 200
const CHART_BUCKETS = 30 // 30 × 10s = 5 min
const CHART_BUCKET_MS = WINDOW_MS / CHART_BUCKETS
const NOW_TICK_MS = 5_000 // re-render counters + sparkline every 5 s

const FILTERS: { value: FilterValue; labelKey: StringKey }[] = [
  { value: 'all', labelKey: 'live.filter.all' },
  { value: 'pageview', labelKey: 'live.filter.pageview' },
  { value: 'click', labelKey: 'live.filter.click' },
  { value: 'error', labelKey: 'live.filter.error' },
  { value: 'session_start', labelKey: 'live.filter.session_start' },
  { value: 'custom', labelKey: 'live.filter.custom' },
]

function wsUrlFor(token: string, workspaceId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL ?? window.location.origin).replace(/\/$/, '')
  const wsBase = apiBase.replace(/^http/, 'ws')
  const qs = new URLSearchParams({ token, workspaceId })
  return `${wsBase}/ws/live?${qs.toString()}`
}

export default function LivePage() {
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id ?? ''
  const token = state.token ?? ''

  const [connState, setConnState] = useState<ConnState>('connecting')
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  // `now` ticks every 5 s so the 5-min sliding window slides even when no
  // new events arrive (otherwise old events would stay in the counters / chart).
  const [now, setNow] = useState<number>(() => Date.now())
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!token || !workspaceId) {
      setConnState('unauthorized')
      return
    }

    let cancelled = false
    let retryTimer: number | null = null

    function open() {
      if (cancelled) return
      setConnState('connecting')
      const ws = new WebSocket(wsUrlFor(token, workspaceId))
      wsRef.current = ws

      ws.onopen = () => setConnState('connected')
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data)
          if (!parsed || typeof parsed !== 'object') return
          if (parsed.type === 'connected') return // serveur ack, pas un event
          if (!parsed.type || !parsed.sid) return
          setEvents((prev) => [parsed as LiveEvent, ...prev].slice(0, MAX_EVENTS))
        } catch {
          /* ignore non-JSON */
        }
      }
      ws.onerror = () => setConnState('error')
      ws.onclose = (e) => {
        setConnState(e.code === 401 || e.code === 403 ? 'unauthorized' : 'disconnected')
        if (!cancelled && e.code !== 401 && e.code !== 403) {
          retryTimer = window.setTimeout(open, 3000)
        }
      }
    }

    open()
    return () => {
      cancelled = true
      if (retryTimer) window.clearTimeout(retryTimer)
      wsRef.current?.close()
    }
  }, [token, workspaceId])

  const recent = useMemo(
    () => events.filter((e) => e.ts >= now - WINDOW_MS),
    [events, now],
  )

  const stats = useMemo(() => {
    const sessions = new Set<string>()
    let pageviews = 0
    let clicks = 0
    let errors = 0
    for (const e of recent) {
      sessions.add(e.sid)
      if (e.type === 'pageview') pageviews++
      else if (e.type === 'click') clicks++
      else if (e.type === 'error') errors++
    }
    return { activeSessions: sessions.size, pageviews, clicks, errors }
  }, [recent])

  const filterCounts = useMemo(() => {
    const c: Record<FilterValue, number> = {
      all: recent.length,
      pageview: 0,
      click: 0,
      error: 0,
      session_start: 0,
      custom: 0,
    }
    for (const e of recent) c[e.type]++
    return c
  }, [recent])

  const chartBuckets = useMemo(() => {
    const buckets = new Array<number>(CHART_BUCKETS).fill(0)
    const windowStart = now - WINDOW_MS
    for (const e of recent) {
      if (e.type !== 'pageview') continue
      const idx = Math.floor((e.ts - windowStart) / CHART_BUCKET_MS)
      if (idx >= 0 && idx < CHART_BUCKETS) buckets[idx]++
    }
    return buckets
  }, [recent, now])

  const filteredEvents = useMemo(
    () => (activeFilter === 'all' ? events : events.filter((e) => e.type === activeFilter)),
    [events, activeFilter],
  )

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
              {t('live.kicker')}
            </span>
            <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
              {t('live.title')}
            </h1>
            <p className="mt-2 text-text-2">{t('live.subtitle')}</p>
          </div>
          <ConnIndicator state={connState} />
        </div>

        {/* Install snippet — premier élément, toujours visible pour que
            l'utilisateur ait le snippet à portée de main quand il arrive sur
            cet onglet. Cf demande utilisateur de M4. */}
        <InstallSnippetBlock workspaceId={workspaceId} />

        {connState === 'unauthorized' ? (
          <div className="sa-card text-center text-text-2">{t('live.err.unauthorized')}</div>
        ) : (
          <>
            <div id="live-events-section" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t('live.stat.activeSessions')} value={stats.activeSessions} />
              <Stat label={t('live.stat.pageviews')} value={stats.pageviews} />
              <Stat label={t('live.stat.clicks')} value={stats.clicks} />
              <Stat
                label={t('live.stat.errors')}
                value={stats.errors}
                tone={stats.errors > 0 ? 'warn' : undefined}
              />
            </div>

            <Sparkline buckets={chartBuckets} title={t('live.chart.title')} emptyLabel={t('live.chart.empty')} />

            <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-head text-lg font-semibold text-text-1">
                {t('live.recentEvents')}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                {t('live.windowHint')}
              </span>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
              {FILTERS.map((f) => {
                const count = filterCounts[f.value]
                const isActive = activeFilter === f.value
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveFilter(f.value)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors',
                      isActive
                        ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan'
                        : 'border-border bg-card text-text-3 hover:border-border-br hover:text-text-2',
                    ].join(' ')}
                  >
                    {t(f.labelKey)}
                    <span className="font-mono text-[10px] opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>

            {filteredEvents.length === 0 ? (
              <div className="sa-card text-center text-text-2">
                {connState === 'connected' ? t('live.empty') : t('live.connecting')}
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredEvents.map((e, i) => (
                  <EventRow key={`${e.sid}-${e.ts}-${i}`} event={e} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────

function InstallSnippetBlock({ workspaceId }: { workspaceId: string }) {
  const t = useT()
  const snippet = buildSnippet(workspaceId)

  return (
    <div className="sa-card mb-6 flex flex-col gap-3 border-brand-cyan/20 bg-brand-cyan/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-head text-base font-semibold text-text-1">
            {t('live.install.title')}
          </div>
          <div className="mt-1 text-sm text-text-2">{t('live.install.subtitle')}</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-bg-1">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            HTML
          </span>
          <CopyButton value={snippet} size="sm" />
        </div>
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-text-1">
          <code>{snippet}</code>
        </pre>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/tracking/install" className="sa-btn sa-btn-primary !text-xs">
          {t('live.install.cta.guide')} →
        </Link>
        <a href="#live-events-section" className="sa-btn !text-xs">
          {t('live.install.cta.scroll')}
        </a>
      </div>
    </div>
  )
}

function buildSnippet(writeKey: string): string {
  const key = writeKey || 'YOUR_WRITE_KEY'
  return `<script async src="https://smartanalyst.io/sa.js"></script>
<script>Smartanalyst('init', { writeKey: '${key}' });</script>`
}

function ConnIndicator({ state }: { state: ConnState }) {
  const t = useT()
  const map: Record<ConnState, { label: string; color: string }> = {
    connecting: { label: t('live.conn.connecting'), color: 'text-brand-cyan' },
    connected: { label: t('live.conn.connected'), color: 'text-brand-green' },
    disconnected: { label: t('live.conn.disconnected'), color: 'text-text-3' },
    error: { label: t('live.conn.error'), color: 'text-brand-red' },
    unauthorized: { label: t('live.conn.unauthorized'), color: 'text-brand-red' },
  }
  const v = map[state]
  return (
    <div
      className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest ${v.color}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${state === 'connected' ? 'animate-pulse bg-brand-green' : state === 'connecting' ? 'animate-pulse bg-brand-cyan' : 'bg-text-3'}`}
      />
      {v.label}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'warn'
}) {
  return (
    <div className="sa-card">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {label}
      </div>
      <div
        className={`mt-1 font-head text-3xl font-bold ${tone === 'warn' ? 'text-brand-red' : 'text-text-1'}`}
      >
        {value}
      </div>
    </div>
  )
}

function Sparkline({
  buckets,
  title,
  emptyLabel,
}: {
  buckets: number[]
  title: string
  emptyLabel: string
}) {
  const max = Math.max(1, ...buckets) // évite division par zéro
  const total = buckets.reduce((a, b) => a + b, 0)

  return (
    <div className="sa-card">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
          {title}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
          {total === 0 ? emptyLabel : `Σ ${total}`}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${CHART_BUCKETS * 2} 40`}
        preserveAspectRatio="none"
        className="h-12 w-full"
        aria-hidden="true"
      >
        {buckets.map((count, i) => {
          // hauteur min 1px pour montrer la grille même quand 0
          const h = count === 0 ? 1 : (count / max) * 38
          const x = i * 2
          const y = 40 - h
          return (
            <rect
              key={i}
              x={x + 0.25}
              y={y}
              width={1.5}
              height={h}
              fill={count === 0 ? 'currentColor' : '#60a5fa'}
              opacity={count === 0 ? 0.15 : 0.9}
            />
          )
        })}
      </svg>
    </div>
  )
}

function EventRow({ event }: { event: LiveEvent }) {
  const t = useT()
  const time = new Date(event.ts).toLocaleTimeString()
  const sidShort = event.sid.slice(0, 6)

  const badgeStyles: Record<EventType, string> = {
    pageview: 'border-brand-blue/30 bg-brand-blue/10 text-brand-blue',
    click: 'border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan',
    error: 'border-brand-red/30 bg-brand-red/10 text-brand-red',
    session_start: 'border-brand-green/30 bg-brand-green/10 text-brand-green',
    custom: 'border-border bg-card text-text-2',
  }

  let detail = event.url
  if (event.type === 'click' && event.el) detail = `${event.el} on ${event.url}`
  else if (event.type === 'error' && event.err) detail = event.err
  else if (event.type === 'custom' && event.name) detail = event.name

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span className="font-mono text-[10px] text-text-3">{time}</span>
      <span
        className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${badgeStyles[event.type]}`}
      >
        {t((`live.eventType.${event.type}`) as StringKey) || event.type}
      </span>
      <span className="font-mono text-[10px] text-text-3">{sidShort}</span>
      <span className="truncate text-text-2">{detail}</span>
    </li>
  )
}
