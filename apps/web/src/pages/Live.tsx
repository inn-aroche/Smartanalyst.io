import { useEffect, useMemo, useRef, useState } from 'react'

import AppLayout from '@/components/AppLayout'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

type LiveEvent = {
  type: 'pageview' | 'click' | 'error' | 'session_start' | 'custom'
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

const WINDOW_MS = 5 * 60_000 // 5 min sliding window pour les compteurs
const MAX_EVENTS = 50

function wsUrlFor(token: string, workspaceId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL ?? window.location.origin).replace(/\/$/, '')
  // http(s):// → ws(s)://
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
  const wsRef = useRef<WebSocket | null>(null)

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

      ws.onopen = () => {
        setConnState('connected')
      }
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data)
          // Le 1er message envoyé par le serveur est un ack {type:'connected'},
          // pas un événement de tracking. On le filtre.
          if (!parsed || typeof parsed !== 'object') return
          if (parsed.type === 'connected') return
          if (!parsed.type || !parsed.sid) return
          setEvents((prev) => [parsed as LiveEvent, ...prev].slice(0, MAX_EVENTS))
        } catch {
          /* ignore non-JSON */
        }
      }
      ws.onerror = () => {
        setConnState('error')
      }
      ws.onclose = (e) => {
        if (e.code === 1006 || e.code === 401 || e.code === 403) {
          setConnState(e.code === 401 || e.code === 403 ? 'unauthorized' : 'disconnected')
        } else {
          setConnState('disconnected')
        }
        // Auto-reconnect après 3s (sauf si auth foirée)
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

  const stats = useMemo(() => {
    const since = Date.now() - WINDOW_MS
    const recent = events.filter((e) => e.ts >= since)
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
    return {
      activeSessions: sessions.size,
      pageviews,
      clicks,
      errors,
    }
  }, [events])

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

        {connState === 'unauthorized' ? (
          <div className="sa-card text-center text-text-2">{t('live.err.unauthorized')}</div>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t('live.stat.activeSessions')} value={stats.activeSessions} />
              <Stat label={t('live.stat.pageviews')} value={stats.pageviews} />
              <Stat label={t('live.stat.clicks')} value={stats.clicks} />
              <Stat
                label={t('live.stat.errors')}
                value={stats.errors}
                tone={stats.errors > 0 ? 'warn' : undefined}
              />
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-head text-lg font-semibold text-text-1">
                {t('live.recentEvents')}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                {t('live.windowHint')}
              </span>
            </div>

            {events.length === 0 ? (
              <div className="sa-card text-center text-text-2">
                {connState === 'connected' ? t('live.empty') : t('live.connecting')}
              </div>
            ) : (
              <ul className="space-y-2">
                {events.map((e, i) => (
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
    <div className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest ${v.color}`}>
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
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">{label}</div>
      <div
        className={`mt-1 font-head text-3xl font-bold ${tone === 'warn' ? 'text-brand-red' : 'text-text-1'}`}
      >
        {value}
      </div>
    </div>
  )
}

function EventRow({ event }: { event: LiveEvent }) {
  const t = useT()
  const time = new Date(event.ts).toLocaleTimeString()
  const sidShort = event.sid.slice(0, 6)

  const badgeStyles: Record<string, string> = {
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
        className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${badgeStyles[event.type] || badgeStyles.custom}`}
      >
        {t((`live.eventType.${event.type}` as never)) || event.type}
      </span>
      <span className="font-mono text-[10px] text-text-3">{sidShort}</span>
      <span className="truncate text-text-2">{detail}</span>
    </li>
  )
}
