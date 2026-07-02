// BriefHome — "Mon point du jour" (handoff Claude Design, direction "Le Brief").
// Accueil narré max-720px : greeting → hero score + paragraphe → 3 insights
// → propositions de tâches → 3 KPI → barre "ask".
//
// Données pullées en parallèle via React Query :
//   - /api/v1/health-score        : score 0-100 + delta + breakdown
//   - /api/v1/insights?status=open: insights ouverts (top 3 affichés)
//   - /api/v1/insights/actions    : tâches (filtre status=proposed)
//   - /api/v1/dashboard/overview  : tuiles KPIs (3 premiers affichés)
//
// Tous les blocs ont un fallback élégant en cas d'absence de données ou
// d'erreur API — la home reste utilisable même sur un workspace vide.

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

import AppLayout, { Topbar, useToast } from '@/components/AppLayout'
import DataFreshnessChip from '@/components/DataFreshnessChip'
import Bars from '@/components/charts/Bars'
import KpiCard, { type Kpi } from '@/components/charts/KpiCard'
import PinnedWidgets from '@/components/dashboard/PinnedWidgets'
import ScoreRing from '@/components/charts/ScoreRing'
import FirstRunBlock from '@/components/onboarding/FirstRunBlock'
import { openOnboarding } from '@/components/onboarding/OnboardingFlow'
import { ErrorState } from '@/components/ui/states'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { type StringKey, useLocale, useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'

type HealthScore = {
  score: number
  delta: number | null
  breakdown: Record<string, number>
  has_data: boolean
}

type Insight = {
  id: string
  title: string
  summary: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  evidence?: Array<{ source?: string; explanation?: string }>
  actions?: Array<{ id: string; title: string; status?: string }>
}

type ActionCard = {
  id: string
  title: string
  status: string
  priority?: string
  impact?: string
  effort?: string
}

type SummaryTile = {
  key: string
  label: string
  format: 'integer' | 'currency' | 'ratio'
  value: number
  previous_value: number
  delta_pct: number | null
  has_data: boolean
  spark?: number[]
}
type SummaryResponse = { tiles: SummaryTile[] }

export default function BriefHomePage() {
  const t = useT()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const { state } = useAuth()
  const workspace = state.workspaces[0]
  const wsId = workspace?.id

  // Event brief_viewed (cahier §6 — engagement / boucle). On l'émet au
  // premier mount avec le workspace résolu, pas à chaque refetch.
  useEffect(() => {
    if (!wsId) return
    track('brief_viewed')
  }, [wsId])

  // 4 queries en parallèle (React Query déduplique + cache).
  const scoreQ = useQuery({
    queryKey: ['health-score', wsId],
    enabled: !!wsId,
    queryFn: () => apiFetch<HealthScore>(`/api/v1/health-score?workspaceId=${wsId}`),
    staleTime: 60_000,
  })
  const insightsQ = useQuery({
    queryKey: ['insights', 'list', wsId, 'open'],
    enabled: !!wsId,
    queryFn: () =>
      apiFetch<{ insights: Insight[] }>(`/api/v1/insights?workspaceId=${wsId}&status=open`),
    staleTime: 60_000,
  })
  const tasksQ = useQuery({
    queryKey: ['insights', 'actions', wsId, 'proposed'],
    enabled: !!wsId,
    queryFn: () =>
      apiFetch<{ actions: ActionCard[] }>(
        `/api/v1/insights/actions?workspaceId=${wsId}&status=proposed&limit=5`,
      ),
    staleTime: 60_000,
  })
  const kpisQ = useQuery({
    queryKey: ['dashboard-overview', wsId, 30],
    enabled: !!wsId,
    queryFn: () =>
      apiFetch<SummaryResponse>(`/api/v1/dashboard/overview?workspaceId=${wsId}&days=30`),
    staleTime: 60_000,
  })

  const firstName = (state.user?.full_name ?? state.user?.email ?? 'toi').split(/\s+|@/)[0]
  const dateStr = formatDate(locale)
  const sub = `${workspace?.name ?? '—'} · ${dateStr}`

  return (
    <AppLayout>
      {/* useToast() exige un descendant de AppLayout — ce petit composant
          sans rendu porte l'effet "premier insight" pour rester dans l'arbre
          fourni par le Provider (voir postmortem juin/juillet 2026). */}
      <FirstInsightToast insights={insightsQ.data?.insights} wsId={wsId} />
      <Topbar
        title={t('brief.topbar.title')}
        subtitle={sub}
        rightChip={<DataFreshnessChip />}
        primaryAction={{ label: t('nav.askQuestion'), onClick: () => navigate('/chat') }}
      />

      <div className="px-8 py-8 lg:px-10">
        <div className="mx-auto max-w-brief">
          {/* ─── Greeting ─── */}
          <div className="mb-1.5">
            <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.06em] text-text-3">
              {dateStr}
            </div>
            <h1 className="font-head text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] text-text-1">
              {t('brief.greeting', { name: firstName })} ☀️
            </h1>
          </div>

          {/* ─── First-run : workspace vide (pas de score = pas de canonical_metrics).
              Quand on est dans cet état, l'ensemble HeroBrief + ThreeThings + KPIs
              n'a rien à dire — on remplace par un bloc d'accueil avec un vrai chemin
              à parcourir. Le loading initial reste géré par HeroBrief skeleton plus
              bas, donc on attend que scoreQ ait répondu avant de basculer. */}
          {scoreQ.isError || insightsQ.isError || tasksQ.isError || kpisQ.isError ? (
            <ErrorState
              retry={() => {
                if (scoreQ.isError) void scoreQ.refetch()
                if (insightsQ.isError) void insightsQ.refetch()
                if (tasksQ.isError) void tasksQ.refetch()
                if (kpisQ.isError) void kpisQ.refetch()
              }}
            />
          ) : !scoreQ.isLoading && !scoreQ.data?.has_data ? (
            <FirstRunBlock
              illustration={<FirstRunIllus />}
              eyebrow={t('brief.firstRun.eyebrow')}
              title={t('brief.firstRun.title', { name: firstName })}
              body={t('brief.firstRun.body')}
              primary={{ label: t('brief.firstRun.cta'), to: '/connectors' }}
              secondary={[
                {
                  label: t('brief.firstRun.tour'),
                  sublabel: t('brief.firstRun.tourSub'),
                  icon: '✦',
                  onClick: openOnboarding,
                },
                {
                  label: t('brief.firstRun.ask'),
                  sublabel: t('brief.firstRun.askSub'),
                  icon: '?',
                  to: '/chat',
                },
              ]}
            />
          ) : (
            <>
              {/* ─── Hero brief : ScoreRing + paragraphe narré ─── */}
              <HeroBrief
                score={scoreQ.data}
                loading={scoreQ.isLoading}
                insights={insightsQ.data?.insights ?? []}
              />

              {/* ─── Breakdown par dimension ─── */}
              {scoreQ.data?.breakdown && <HealthBreakdown breakdown={scoreQ.data.breakdown} />}

              {/* ─── Les 3 choses qui comptent ce matin ─── */}
              <ThreeThings
                insights={insightsQ.data?.insights ?? []}
                loading={insightsQ.isLoading}
              />

              {/* ─── Ce que je te propose de faire ─── */}
              <ProposedTasks actions={tasksQ.data?.actions ?? []} loading={tasksQ.isLoading} />

              {/* ─── En un coup d'œil : 3 KPI ─── */}
              <QuickKpis
                tiles={kpisQ.data?.tiles ?? []}
                loading={kpisQ.isLoading}
                locale={locale}
              />

              {/* ─── CTA rapport ─── */}
              <div className="mb-6">
                <Link
                  to="/rapports"
                  className="sa-btn inline-flex items-center gap-1.5 !text-[13.5px]"
                >
                  📊 {t('brief.report.cta')} →
                </Link>
              </div>

              {/* ─── Mes épingles depuis le chat (cahier 22b §3.4 — Lot V2.3) ─── */}
              {wsId && <PinnedWidgets workspaceId={wsId} />}
            </>
          )}

          {/* ─── Barre "ask" : bandeau dégradé ─── */}
          <Link
            to="/chat"
            className="flex cursor-pointer items-center gap-3 rounded-brief bg-brand-grad px-4 py-4 shadow-float transition-transform hover:-translate-y-0.5 sm:gap-3.5 sm:px-5"
          >
            <img
              src="/brand/ascent-mark-onlight-512.png"
              alt=""
              width={22}
              height={22}
              className="flex-shrink-0"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white sm:whitespace-normal">
              {t('brief.ask.body')}
            </span>
            {/* CTA texte cache sur mobile (debordement) — la fleche reste comme signal visuel. */}
            <span className="hidden whitespace-nowrap font-mono text-[13px] text-white sm:inline">
              {t('brief.ask.cta')} →
            </span>
            <span
              aria-hidden="true"
              className="font-mono text-[16px] leading-none text-white sm:hidden"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}

// ─── Toast "premier insight" (déclenché une seule fois par workspace) ────
// Composant sans rendu : DOIT être monté à l'intérieur de <AppLayout> pour
// que useToast() trouve son Provider (l'appeler dans BriefHomePage lui-même
// crashait toute l'app — useToast() y était appelé AVANT que AppLayout,
// qui fournit le contexte, ne soit rendu comme enfant).

function FirstInsightToast({
  insights,
  wsId,
}: {
  insights: Insight[] | undefined
  wsId: string | undefined
}) {
  const t = useT()
  const toast = useToast()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current || !insights || insights.length === 0 || !wsId) return
    const lsKey = `sa.first-insight-shown:${wsId}`
    if (localStorage.getItem(lsKey)) return
    fired.current = true
    localStorage.setItem(lsKey, '1')
    toast.push(t('brief.firstInsight.toast'))
    track('first_insight_shown')
  }, [insights, wsId, t, toast])

  return null
}

// ─── Hero brief : ScoreRing 128px + chip + paragraphe narré ───────────────

function HeroBrief({
  score,
  loading,
  insights,
}: {
  score: HealthScore | undefined
  loading: boolean
  insights: Insight[]
}) {
  const t = useT()

  if (loading) {
    return (
      <div className="relative mb-7 mt-5 h-[180px] animate-pulse overflow-hidden rounded-brief border border-border bg-card shadow-float" />
    )
  }

  const s = score?.score ?? null
  const delta = score?.delta ?? null
  const hasData = score?.has_data ?? false

  // Tonalité du chip + couleur du delta : dérivée du score.
  const tone = s == null ? 'neutral' : s >= 75 ? 'good' : s >= 55 ? 'mid' : 'low'
  const chip =
    tone === 'good'
      ? { label: t('brief.score.good'), cls: 'bg-brand-green/10 text-brand-green' }
      : tone === 'mid'
        ? { label: t('brief.score.mid'), cls: 'bg-brand-amber/10 text-brand-amber' }
        : tone === 'low'
          ? { label: t('brief.score.low'), cls: 'bg-brand-red/10 text-brand-red' }
          : { label: t('brief.score.unknown'), cls: 'bg-text-3/10 text-text-3' }

  const criticalCount = insights.filter(
    (i) => i.severity === 'critical' || i.severity === 'high',
  ).length

  return (
    <div className="relative mb-7 mt-5 overflow-hidden rounded-brief border border-border bg-card px-7 py-7 shadow-float">
      {/* Halo radial discret en haut à droite */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-14 h-[220px] w-[260px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(92,143,255,0.10), transparent 70%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:gap-7">
        {hasData && s != null ? (
          <ScoreRing value={s} size={128} delta={delta} label={t('brief.score.label')} />
        ) : (
          <ScoreRingEmpty />
        )}
        <div className="flex-1">
          <span className={`sa-chip mb-3 inline-flex ${chip.cls}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {chip.label}
          </span>
          <p className="text-[16.5px] font-medium leading-[1.65] tracking-[-0.01em] text-text-1">
            {hasData ? (
              <Narrative delta={delta} criticalCount={criticalCount} />
            ) : (
              t('brief.score.noData')
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

const BREAKDOWN_KEYS: Array<{ key: string; labelKey: StringKey }> = [
  { key: 'paid', labelKey: 'brief.breakdown.paid' },
  { key: 'organic', labelKey: 'brief.breakdown.organic' },
  { key: 'conversion', labelKey: 'brief.breakdown.conversion' },
  { key: 'revenue', labelKey: 'brief.breakdown.revenue' },
  { key: 'tracking', labelKey: 'brief.breakdown.tracking' },
]

function HealthBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const t = useT()
  const bars = BREAKDOWN_KEYS.filter((d) => breakdown[d.key] != null).map((d) => ({
    label: t(d.labelKey),
    value: breakdown[d.key],
  }))
  if (bars.length === 0) return null
  return (
    <section className="mb-7">
      <div className="sa-eyebrow mb-2">{t('brief.breakdown.title')}</div>
      <div className="rounded-brief border border-border bg-card p-5 shadow-card">
        <Bars data={bars} height={140} activeIndex={-1} />
      </div>
    </section>
  )
}

function ScoreRingEmpty() {
  return (
    <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border text-text-3">
      <span className="font-mono text-[10px]">—</span>
    </div>
  )
}

function Narrative({ delta, criticalCount }: { delta: number | null; criticalCount: number }) {
  const t = useT()
  // Construit la phrase narrée à partir des vraies données disponibles —
  // pas de hallucination, pas de chiffres inventés.
  const parts: string[] = []
  if (delta != null && delta > 1) {
    parts.push(t('brief.narrative.up', { delta: `+${delta}` }))
  } else if (delta != null && delta < -1) {
    parts.push(t('brief.narrative.down', { delta: `${delta}` }))
  } else {
    parts.push(t('brief.narrative.flat'))
  }
  if (criticalCount === 1) parts.push(t('brief.narrative.one'))
  else if (criticalCount > 1) parts.push(t('brief.narrative.many', { n: criticalCount }))
  else parts.push(t('brief.narrative.allGood'))
  return <>{parts.join(' ')}</>
}

// ─── Les 3 choses qui comptent ───────────────────────────────────────────

function ThreeThings({ insights, loading }: { insights: Insight[]; loading: boolean }) {
  const t = useT()
  const top3 = insights.slice(0, 3)
  return (
    <section className="mb-8">
      <h2 className="mb-1 font-head text-lg font-bold tracking-[-0.01em] text-text-1">
        {t('brief.three.title')}
      </h2>
      <p className="mb-4 text-[13.5px] text-text-3">{t('brief.three.body')}</p>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[88px] animate-pulse rounded-brief border border-border bg-card"
            />
          ))}
        </div>
      ) : top3.length === 0 ? (
        <div className="rounded-brief border border-dashed border-border bg-card/60 p-6 text-center text-sm text-text-2">
          {t('brief.three.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {top3.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}
      <div className="mt-3.5">
        <Link to="/veille" className="sa-btn !text-[13.5px]">
          {t('brief.three.cta')} →
        </Link>
      </div>
    </section>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const t = useT()
  const navigate = useNavigate()
  const { state } = useAuth()
  const queryClient = useQueryClient()
  const workspaceId = state.workspaces[0]?.id
  const sevMeta = severityMeta(insight.severity)
  const cause = insight.evidence?.[0]?.explanation
  // Action "proposed" attachée — c'est elle qu'on promeut en tâche
  // active (cahier §4.2 — InsightCardActions). Fallback : 1ère action.
  const proposedAction = insight.actions?.find((a) => a.status === 'proposed')
  const reco = proposedAction?.title || insight.actions?.[0]?.title

  const promote = useMutation({
    mutationFn: async () => {
      if (!proposedAction || !workspaceId) throw new Error('no_action')
      return apiFetch(`/api/v1/insights/actions/${proposedAction.id}`, {
        method: 'PATCH',
        body: { workspaceId, status: 'todo' },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['insights'] })
      void queryClient.invalidateQueries({ queryKey: ['actions'] })
    },
  })

  function askDetails() {
    const q = encodeURIComponent(insight.title)
    navigate(`/chat?q=${q}`)
  }

  return (
    <div className="flex gap-3.5 rounded-brief border border-border bg-card p-4 shadow-card">
      <span
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[11px] font-head text-base font-extrabold ${sevMeta.cls}`}
      >
        {sevMeta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-head text-[15.5px] font-bold leading-[1.35] text-text-1">
          {insight.title}
        </div>
        {cause && <div className="mt-1.5 text-[13.5px] leading-[1.5] text-text-2">{cause}</div>}
        {reco && (
          <div className="mt-1 text-[13.5px] leading-[1.5] text-text-1">
            <span className="font-semibold text-brand-blue-deep">{t('brief.three.reco')} — </span>
            {reco}
          </div>
        )}
        {/* Actions sur la carte (cahier §4.2 — InsightCardActions). */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {proposedAction && (
            <button
              type="button"
              onClick={() => promote.mutate()}
              disabled={promote.isPending || promote.isSuccess}
              className="sa-btn !text-[12px] disabled:opacity-50"
            >
              {promote.isSuccess ? '✓ ' + t('brief.three.added') : '+ ' + t('brief.three.toTasks')}
            </button>
          )}
          <button type="button" onClick={askDetails} className="sa-btn !text-[12px]">
            {t('brief.three.askDetails')}
          </button>
        </div>
      </div>
    </div>
  )
}

function severityMeta(s: Insight['severity']) {
  switch (s) {
    case 'critical':
      return { icon: '!', cls: 'bg-brand-red/13 text-brand-red' }
    case 'high':
      return { icon: '!', cls: 'bg-brand-red/13 text-brand-red' }
    case 'medium':
      return { icon: '!', cls: 'bg-brand-amber/13 text-brand-amber' }
    default:
      return { icon: '↗', cls: 'bg-brand-blue-deep/13 text-brand-blue-deep' }
  }
}

// ─── Propositions de tâches ──────────────────────────────────────────────

function ProposedTasks({ actions, loading }: { actions: ActionCard[]; loading: boolean }) {
  const t = useT()
  return (
    <section className="mb-8">
      <h2 className="mb-1 font-head text-lg font-bold tracking-[-0.01em] text-text-1">
        {t('brief.proposed.title')}
      </h2>
      <p className="mb-4 text-[13.5px] text-text-3">{t('brief.proposed.body')}</p>
      {loading ? (
        <div className="space-y-2.5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-brief border border-border bg-card"
            />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <div className="rounded-brief border border-dashed border-border bg-card/60 p-6 text-center text-sm text-text-2">
          {t('brief.proposed.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {actions.slice(0, 3).map((a) => (
            <Link
              key={a.id}
              to="/tasks"
              className="flex items-center gap-3 rounded-brief border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-border-bright"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] bg-brand-blue-dim font-head text-sm font-bold text-brand-blue-deep">
                ✦
              </span>
              <span className="flex-1 truncate text-sm font-medium text-text-1">{a.title}</span>
              <span className="hidden font-mono text-[10.5px] uppercase tracking-wider text-text-3 sm:inline">
                {t('brief.proposed.toCurate')}
              </span>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-3.5">
        <Link to="/tasks" className="sa-btn !text-[13.5px]">
          {t('brief.proposed.cta')} →
        </Link>
      </div>
    </section>
  )
}

// ─── KPIs : 3 cartes "En un coup d'œil" ──────────────────────────────────

function QuickKpis({
  tiles,
  loading,
  locale,
}: {
  tiles: SummaryTile[]
  loading: boolean
  locale: string
}) {
  const t = useT()
  // On garde les 3 premiers tiles avec data (ordre stable défini côté API).
  const top3 = tiles.filter((tile) => tile.has_data).slice(0, 3)
  return (
    <section className="mb-6">
      <div className="sa-eyebrow">{t('brief.kpis.eyebrow')}</div>
      {loading ? (
        <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[110px] animate-pulse rounded-brief border border-border bg-card"
            />
          ))}
        </div>
      ) : top3.length === 0 ? (
        <div className="mt-3.5 rounded-brief border border-dashed border-border bg-card/60 p-6 text-center text-sm text-text-2">
          {t('brief.kpis.empty')}
        </div>
      ) : (
        <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {top3.map((tile) => (
            <KpiCard key={tile.key} k={tileToKpi(tile, locale)} />
          ))}
        </div>
      )}
    </section>
  )
}

function tileToKpi(tile: SummaryTile, locale: string): Kpi {
  const value = formatTileValue(tile.value, tile.format, locale)
  const delta =
    tile.delta_pct == null
      ? undefined
      : (tile.delta_pct >= 0 ? '+' : '') + tile.delta_pct.toFixed(1) + '%'
  // "up" = bonne direction. Pour les ratios "bounce / churn / failed payments",
  // baisse = bien — heuristique simple sur le key.
  const lowerIsBetter = /bounce|churn|failed_|cost_per_/.test(tile.key)
  const up = (tile.delta_pct ?? 0) >= 0 !== lowerIsBetter
  return {
    label: tile.label,
    value,
    delta,
    up,
    spark: tile.spark?.length ? tile.spark : undefined,
  }
}

function formatTileValue(
  value: number,
  format: 'integer' | 'currency' | 'ratio',
  locale: string,
): string {
  const loc = locale === 'en' ? 'en-GB' : 'fr-FR'
  if (format === 'currency') {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value)
  }
  if (format === 'ratio') {
    const pct = value <= 1 ? value * 100 : value
    return `${pct.toFixed(1)}%`
  }
  return new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(value)
}

// ─── First-run illustration ──────────────────────────────────────────────
// Petit SVG abstrait pour donner du corps au bloc d'accueil. On reste sur le
// langage visuel de l'app (gradient blue→cyan, strokes 2.5-3px, géométrique).

function FirstRunIllus() {
  return (
    <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true" className="flex-shrink-0">
      <defs>
        <linearGradient id="fr-grad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5C8FFF" />
          <stop offset="1" stopColor="#2DD9EE" />
        </linearGradient>
      </defs>
      <rect
        x="10"
        y="22"
        width="50"
        height="50"
        rx="11"
        fill="none"
        stroke="url(#fr-grad)"
        strokeWidth="3"
      />
      <line
        x1="20"
        y1="36"
        x2="50"
        y2="36"
        stroke="#5C5C78"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="47"
        x2="44"
        y2="47"
        stroke="#5C5C78"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="64" cy="20" r="10" fill="url(#fr-grad)" />
      <path
        d="M 60 20 L 63 23 L 68 17"
        stroke="#fff"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatDate(locale: string): string {
  const d = new Date()
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
