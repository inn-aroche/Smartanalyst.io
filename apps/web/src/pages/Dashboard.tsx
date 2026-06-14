import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import AppLayout from '@/components/AppLayout'
import BriefDuJourBlock from '@/components/home/BriefDuJourBlock'
import TrackingHealthBlock from '@/components/home/TrackingHealthBlock'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { type StringKey, useFormatters, useT } from '@/lib/i18n'

type SummaryTile = {
  key: string
  label: string
  format: 'integer' | 'currency' | 'ratio'
  value: number
  previous_value: number
  delta_pct: number | null
  has_data: boolean
}

type SummaryResponse = {
  window: { days: number; start_date: string; end_date: string }
  active_sources?: string[]
  tiles: SummaryTile[]
}

type WorkspaceConnector = {
  id: string
  source: string
  status: 'active' | 'expired' | 'error' | 'disconnected'
}

const WINDOW_OPTIONS: { days: number; key: StringKey }[] = [
  { days: 7, key: 'dashboard.window.7d' },
  { days: 30, key: 'dashboard.window.30d' },
  { days: 90, key: 'dashboard.window.90d' },
]

// Map the API's tile key to a translation key so we display the label in the
// user's language even though the API streams a fixed English string.
const TILE_LABEL_KEY: Record<string, StringKey> = {
  sessions_all: 'dashboard.tile.sessions',
  conversions_total: 'dashboard.tile.conversions',
  revenue_recurring_monthly: 'dashboard.tile.mrr',
  customers_active: 'dashboard.tile.activeCustomers',
  customers_new: 'dashboard.tile.newCustomers',
  failed_payments_month: 'dashboard.tile.failedPayments',
  users_active: 'dashboard.tile.activeUsers',
  bounce_rate_all: 'dashboard.tile.bounceRate',
  spend_paid_social: 'dashboard.tile.metaSpend',
  spend_paid_search: 'dashboard.tile.googleAdsSpend',
  clicks_paid_social: 'dashboard.tile.metaClicks',
  clicks_paid_search: 'dashboard.tile.googleAdsClicks',
  conversions_paid_social: 'dashboard.tile.metaConversions',
  conversions_paid_search: 'dashboard.tile.googleAdsConversions',
  return_on_investment_paid: 'dashboard.tile.metaRoas',
  click_through_rate_paid: 'dashboard.tile.googleAdsCtr',
  revenue_ecommerce: 'dashboard.tile.shopifyRevenue',
  orders_count: 'dashboard.tile.orders',
  order_value_average: 'dashboard.tile.aov',
  clicks_organic_search: 'dashboard.tile.organicClicks',
  impressions_organic_search: 'dashboard.tile.organicImpressions',
  click_through_rate_organic: 'dashboard.tile.organicCtr',
  average_position_organic: 'dashboard.tile.avgPosition',
}

export default function Dashboard() {
  const { state } = useAuth()
  const t = useT()
  const fmt = useFormatters()
  const [windowDays, setWindowDays] = useState(7)
  const workspaceId = state.workspaces[0]?.id ?? ''

  const summary = useQuery({
    queryKey: ['dashboard', 'overview', workspaceId, windowDays],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<SummaryResponse>(
        `/api/v1/dashboard/overview?workspaceId=${workspaceId}&days=${windowDays}`,
      ),
  })

  const connectors = useQuery({
    queryKey: ['connectors', 'list', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ connectors: WorkspaceConnector[] }>(
        `/api/v1/connectors?workspaceId=${workspaceId}`,
      ),
  })

  const activeConnectors = (connectors.data?.connectors ?? []).filter(
    (c) => c.status === 'active',
  )
  const hasConnectors = activeConnectors.length > 0
  const tiles = summary.data?.tiles ?? []
  const hasAnyMetric = tiles.some((t) => t.has_data)

  const firstName = state.user?.full_name?.split(' ')[0]
  const heading = firstName
    ? t('dashboard.greetingNamed', { name: firstName })
    : t('dashboard.greeting')

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
              {t('dashboard.overview')}
            </span>
            <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
              {heading}
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
                {t(opt.key)}
              </button>
            ))}
          </div>
        </div>

        {workspaceId && (
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <TrackingHealthBlock workspaceId={workspaceId} />
            <BriefDuJourBlock workspaceId={workspaceId} />
          </div>
        )}

        {!hasConnectors && (
          <div className="sa-card mt-8 border-brand-cyan/30 bg-brand-cyan/5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/20 font-mono text-brand-cyan">
                →
              </div>
              <div className="flex-1">
                <h2 className="font-head text-lg font-semibold text-text-1">
                  {t('dashboard.emptyConnectorsTitle')}
                </h2>
                <p className="mt-1 text-sm text-text-2">
                  {t('dashboard.emptyConnectorsBody')}
                </p>
                <Link
                  to="/connectors"
                  className="sa-btn sa-btn-primary mt-4 !py-1.5 !text-xs"
                >
                  {t('dashboard.addConnector')}
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summary.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <TileSkeleton key={i} />)
            : tiles.map((tile) => (
                <Tile
                  key={tile.key}
                  tile={tile}
                  hasAnyConnector={hasConnectors}
                  format={fmt}
                />
              ))}
        </div>

        {summary.isError && (
          <div className="mt-6 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
            {t('dashboard.couldNotLoad', {
              message: (summary.error as Error)?.message ?? '',
            })}
          </div>
        )}

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <NextStep
            badge="01"
            titleKey="dashboard.next.01.title"
            bodyKey="dashboard.next.01.body"
            ctaKey="dashboard.next.01.cta"
            to="/connectors"
          />
          <NextStep
            badge="02"
            titleKey="dashboard.next.02.title"
            bodyKey="dashboard.next.02.body"
            ctaKey="dashboard.next.02.cta"
            to="/chat"
            disabled
          />
          <NextStep
            badge="03"
            titleKey="dashboard.next.03.title"
            bodyKey="dashboard.next.03.body"
            ctaKey="dashboard.next.03.cta"
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

function Tile({
  tile,
  hasAnyConnector,
  format,
}: {
  tile: SummaryTile
  hasAnyConnector: boolean
  format: ReturnType<typeof useFormatters>
}) {
  const t = useT()
  const labelKey = TILE_LABEL_KEY[tile.key]
  const label = labelKey ? t(labelKey) : tile.label

  return (
    <div className="sa-card flex flex-col">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {label}
      </div>
      <div className="mt-2 font-head text-3xl font-bold text-text-1">
        {tile.has_data ? formatValue(tile, format) : '—'}
      </div>
      <div className="mt-1.5 font-mono text-[11px]">
        {tile.has_data ? (
          <DeltaBadge pct={tile.delta_pct} />
        ) : (
          <span className="text-text-3">
            {hasAnyConnector ? t('dashboard.tile.syncing') : t('dashboard.tile.noData')}
          </span>
        )}
      </div>
    </div>
  )
}

// `ratio` couvre 2 cas selon la valeur :
//   - 0 < v ≤ 1   → un pourcentage (ex: 0.43 = 43% bounce rate)
//   - v > 1       → un facteur (ex: 3.2x ROAS, 5.4 position moyenne)
// On heuristic-detect plutôt que d'ajouter un champ "subFormat" côté API.
function formatValue(
  tile: SummaryTile,
  format: ReturnType<typeof useFormatters>,
): string {
  if (tile.format === 'currency') return format.currency(tile.value)
  if (tile.format === 'ratio') {
    if (tile.value <= 1) return `${(tile.value * 100).toFixed(1)}%`
    return `${tile.value.toFixed(1)}${tile.value < 10 ? 'x' : ''}`
  }
  return format.integer(tile.value)
}

function DeltaBadge({ pct }: { pct: number | null }) {
  const t = useT()
  if (pct === null) {
    return <span className="text-text-3">{t('dashboard.tile.noBaseline')}</span>
  }
  const positive = pct >= 0
  const color = positive ? 'text-brand-green' : 'text-brand-red'
  const arrow = positive ? '↑' : '↓'
  return (
    <span className={color}>
      {arrow} {Math.abs(pct).toFixed(1)}% {t('dashboard.tile.vsPrevious')}
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
  titleKey,
  bodyKey,
  ctaKey,
  to,
  disabled,
}: {
  badge: string
  titleKey: StringKey
  bodyKey: StringKey
  ctaKey: StringKey
  to: string
  disabled?: boolean
}) {
  const t = useT()
  const inner = (
    <>
      <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
        {badge}
      </span>
      <h3 className="mt-2 font-head text-base font-semibold text-text-1">{t(titleKey)}</h3>
      <p className="mt-1.5 flex-1 text-sm text-text-2">{t(bodyKey)}</p>
      <span
        className={`mt-4 inline-block font-mono text-xs ${
          disabled ? 'text-text-3' : 'text-brand-blue'
        }`}
      >
        {t(ctaKey)} →
      </span>
    </>
  )

  if (disabled) {
    return (
      <div
        className="sa-card flex cursor-not-allowed flex-col opacity-60"
        title={t('nav.soon')}
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
