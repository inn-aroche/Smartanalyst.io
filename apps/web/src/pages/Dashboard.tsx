import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import AppLayout from '@/components/AppLayout'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

type SummaryTile = {
  key: string
  label: string
  format: 'integer' | 'currency'
  value: number
  previous_value: number
  delta_pct: number | null
  has_data: boolean
}

type SummaryResponse = {
  window: { days: number; start_date: string; end_date: string }
  tiles: SummaryTile[]
}

type WorkspaceConnector = {
  id: string
  source: string
  status: 'active' | 'expired' | 'error' | 'disconnected'
}

const WINDOW_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
]

export default function Dashboard() {
  const { state } = useAuth()
  const [windowDays, setWindowDays] = useState(7)

  const summary = useQuery({
    queryKey: ['metrics', 'summary', windowDays],
    queryFn: () => apiFetch<SummaryResponse>(`/api/v1/metrics/summary?days=${windowDays}`),
  })

  const connectors = useQuery({
    queryKey: ['connectors', 'list'],
    queryFn: () => apiFetch<{ connectors: WorkspaceConnector[] }>('/api/v1/connectors'),
  })

  const activeConnectors = (connectors.data?.connectors ?? []).filter(
    (c) => c.status === 'active',
  )
  const hasConnectors = activeConnectors.length > 0
  const tiles = summary.data?.tiles ?? []
  const hasAnyMetric = tiles.some((t) => t.has_data)

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
              Overview
            </span>
            <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
              {state.user?.full_name ? `Hey ${state.user.full_name.split(' ')[0]},` : 'Hey there,'} here's what changed.
            </h1>
            {summary.data && (
              <p className="mt-1 font-mono text-xs text-text-3">
                {summary.data.window.start_date} → {summary.data.window.end_date}
              </p>
            )}
          </div>

          <div className="flex gap-1">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setWindowDays(opt.days)}
                className={[
                  'rounded-lg border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition',
                  windowDays === opt.days
                    ? 'border-brand-blue bg-brand-blue-dim text-text-1'
                    : 'border-border text-text-3 hover:border-border-bright hover:text-text-2',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!hasConnectors && (
          <div className="sa-card mt-8 border-brand-cyan/30 bg-brand-cyan/5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/20 font-mono text-brand-cyan">
                →
              </div>
              <div className="flex-1">
                <h2 className="font-head text-lg font-semibold text-text-1">
                  Connect a data source to start.
                </h2>
                <p className="mt-1 text-sm text-text-2">
                  Plug GA4, Meta Ads or Stripe in 2 clicks. We'll begin syncing
                  the last 90 days so your dashboard fills up automatically.
                </p>
                <Link
                  to="/connectors"
                  className="sa-btn sa-btn-primary mt-4 !py-1.5 !text-xs"
                >
                  Add a connector →
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summary.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <TileSkeleton key={i} />)
            : tiles.map((tile) => <Tile key={tile.key} tile={tile} hasAnyConnector={hasConnectors} />)}
        </div>

        {summary.isError && (
          <div className="mt-6 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
            Could not load metrics. {(summary.error as Error)?.message ?? ''}
          </div>
        )}

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <NextStep
            badge="01"
            title="Connect more sources"
            body="The more data you connect, the sharper the AI's cross-source insights become."
            cta="Open connectors"
            to="/connectors"
          />
          <NextStep
            badge="02"
            title="Ask your first question"
            body={'Try "What changed this week?" or "Why did CVR drop yesterday?".'}
            cta="Open chat"
            to="/chat"
            disabled
          />
          <NextStep
            badge="03"
            title="Schedule a weekly report"
            body="Auto-generated PDF, sent every Monday with an exec summary."
            cta="Configure"
            to="/reports"
            disabled
          />
        </div>

        {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
        {hasAnyMetric || null}
      </div>
    </AppLayout>
  )
}

function Tile({ tile, hasAnyConnector }: { tile: SummaryTile; hasAnyConnector: boolean }) {
  return (
    <div className="sa-card flex flex-col">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {tile.label}
      </div>
      <div className="mt-2 font-head text-3xl font-bold text-text-1">
        {tile.has_data ? formatValue(tile.value, tile.format) : '—'}
      </div>
      <div className="mt-1.5 font-mono text-[11px]">
        {tile.has_data ? (
          <DeltaBadge pct={tile.delta_pct} />
        ) : (
          <span className="text-text-3">
            {hasAnyConnector ? 'Syncing…' : 'No data yet'}
          </span>
        )}
      </div>
    </div>
  )
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-text-3">vs. previous: no baseline</span>
  }
  const positive = pct >= 0
  const color = positive ? 'text-brand-green' : 'text-brand-red'
  const arrow = positive ? '↑' : '↓'
  return (
    <span className={color}>
      {arrow} {Math.abs(pct).toFixed(1)}% vs. previous period
    </span>
  )
}

function TileSkeleton() {
  return (
    <div className="sa-card">
      <div className="h-3 w-20 animate-pulse rounded bg-card" />
      <div className="mt-3 h-8 w-28 animate-pulse rounded bg-card" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-card" />
    </div>
  )
}

function NextStep({
  badge,
  title,
  body,
  cta,
  to,
  disabled,
}: {
  badge: string
  title: string
  body: string
  cta: string
  to: string
  disabled?: boolean
}) {
  const inner = (
    <>
      <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
        {badge}
      </span>
      <h3 className="mt-2 font-head text-base font-semibold text-text-1">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm text-text-2">{body}</p>
      <span
        className={`mt-4 inline-block font-mono text-xs ${
          disabled ? 'text-text-3' : 'text-brand-blue'
        }`}
      >
        {cta} →
      </span>
    </>
  )

  if (disabled) {
    return (
      <div
        className="sa-card flex cursor-not-allowed flex-col opacity-60"
        title="Coming soon"
      >
        {inner}
      </div>
    )
  }

  return (
    <Link to={to} className="sa-card flex flex-col">
      {inner}
    </Link>
  )
}

function formatValue(value: number, format: 'integer' | 'currency') {
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}
