// Veille — surveillance proactive (handoff Claude Design §3.3 + sa-views.jsx
// → VeilleView). Max-760px centré.
//
// Contenu :
//   - Hero intro (illus géo + titre + paragraphe) + bouton "+ Créer une alerte"
//     (désactivé tant que les watches custom ne sont pas implémentées côté
//      backend — c'est la prochaine PR App v2).
//   - Bandeau résumé hebdo (gradient brand, affiché en début de semaine).
//   - Filtres chips : Tous / Alertes / À surveiller / Opportunités / Traités.
//   - Liste d'InsightCard détaillées (composant partagé).
//
// Données : /api/v1/insights — filtré côté client par sévérité.

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import AppLayout, { Topbar, useToast } from '@/components/AppLayout'
import DataFreshnessChip from '@/components/DataFreshnessChip'
import InsightCard from '@/components/insights/InsightCard'
import WatchModal from '@/components/insights/WatchModal'
import FirstRunBlock from '@/components/onboarding/FirstRunBlock'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLocale, useT } from '@/lib/i18n'
import type { Insight } from '@/lib/insights-types'

type HealthScore = { score: number; delta: number | null; has_data: boolean }

type Watch = {
  id: string
  description: string
  metric_key: string
  source: string | null
  operator: 'drops_below' | 'rises_above' | 'changes_by_pct' | 'any_change'
  threshold: number | null
  notify_in_app: boolean
  notify_email: boolean
  enabled: boolean
  triggered_count: number
  last_triggered_at: string | null
  created_at: string
}

type FilterId = 'all' | 'critical' | 'warning' | 'opportunity' | 'resolved'

// Sous-onglet : on sépare ce que l'IA a remonté (insights) de ce que l'user
// a programmé manuellement (watches). Ce sont 2 sujets cognitifs distincts
// — les mélanger dans une seule liste pollue l'esprit.
type TopTab = 'insights' | 'watches'

export default function VeillePage() {
  const t = useT()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const { state } = useAuth()
  const workspace = state.workspaces[0]
  const wsId = workspace?.id
  const [topTab, setTopTab] = useState<TopTab>('insights')
  const [filter, setFilter] = useState<FilterId>('all')
  const [watchModalOpen, setWatchModalOpen] = useState(false)

  // 2 queries : insights open + insights résolus (pour l'onglet "Traités").
  // L'API filtre par status, on n'a donc qu'à demander les 2 buckets une fois.
  const openQ = useQuery({
    queryKey: ['insights', 'list', wsId, 'open'],
    enabled: !!wsId,
    queryFn: () =>
      apiFetch<{ insights: Insight[] }>(`/api/v1/insights?workspaceId=${wsId}&status=open`),
    staleTime: 60_000,
  })
  const resolvedQ = useQuery({
    queryKey: ['insights', 'list', wsId, 'resolved'],
    enabled: !!wsId && filter === 'resolved',
    queryFn: () =>
      apiFetch<{ insights: Insight[] }>(`/api/v1/insights?workspaceId=${wsId}&status=resolved`),
    staleTime: 60_000,
  })
  // Détection workspace vide : on pioche has_data depuis health-score (déjà
  // queryé par BriefHome, dedupé par React Query → coût ~zéro). Permet de
  // distinguer "all clear" (l'IA a regardé, rien à signaler) du vrai
  // "première utilisation, branche une source d'abord".
  const scoreQ = useQuery({
    queryKey: ['health-score', wsId],
    enabled: !!wsId,
    queryFn: () => apiFetch<HealthScore>(`/api/v1/health-score?workspaceId=${wsId}`),
    staleTime: 60_000,
  })
  // Liste des veilles actives — pour qu'on voie ce qu'on a créé et puisse
  // toggle / supprimer. Avant : aucune visibilité, l'user créait dans le
  // vide sans confirmation et sans moyen de revenir dessus.
  const watchesQ = useQuery({
    queryKey: ['watches', wsId],
    enabled: !!wsId,
    queryFn: () => apiFetch<{ watches: Watch[] }>(`/api/v1/watches?workspaceId=${wsId}`),
    staleTime: 30_000,
  })

  const list = useMemo<Insight[]>(() => {
    if (filter === 'resolved') return resolvedQ.data?.insights ?? []
    const all = openQ.data?.insights ?? []
    if (filter === 'all') return all
    if (filter === 'critical')
      return all.filter((i) => i.severity === 'critical' || i.severity === 'high')
    if (filter === 'warning') return all.filter((i) => i.severity === 'medium')
    if (filter === 'opportunity') return all.filter((i) => i.severity === 'low')
    return all
  }, [filter, openQ.data, resolvedQ.data])

  // Compteurs pour les chips de filtre.
  const counts = useMemo(() => {
    const all = openQ.data?.insights ?? []
    return {
      all: all.length,
      critical: all.filter((i) => i.severity === 'critical' || i.severity === 'high').length,
      warning: all.filter((i) => i.severity === 'medium').length,
      opportunity: all.filter((i) => i.severity === 'low').length,
      resolved: resolvedQ.data?.insights?.length ?? null,
    }
  }, [openQ.data, resolvedQ.data])

  const loading = filter === 'resolved' ? resolvedQ.isLoading : openQ.isLoading
  const sub = workspace ? `${workspace.name} · ${t('veille.subtitle')}` : t('veille.subtitle')

  return (
    <AppLayout>
      <Topbar
        title={t('veille.topbar.title')}
        subtitle={sub}
        rightChip={<DataFreshnessChip />}
        primaryAction={{ label: t('nav.askQuestion'), onClick: () => navigate('/chat') }}
      />

      <div className="px-8 py-8 lg:px-10">
        <div className="mx-auto max-w-[760px]">
          {/* Hero intro */}
          <header className="mb-6 flex flex-col items-start gap-4 sm:flex-row">
            <WatchIllus />
            <div className="flex-1">
              <h2 className="mb-1.5 font-head text-2xl font-bold tracking-[-0.02em] text-text-1">
                {t('veille.title')}
              </h2>
              <p className="max-w-[520px] text-[14.5px] leading-[1.6] text-text-2">
                {t('veille.intro')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWatchModalOpen(true)}
              className="sa-btn sa-btn-primary flex-shrink-0 !text-[13px]"
            >
              + {t('veille.createAlert')}
            </button>
          </header>

          {/* Bandeau résumé hebdo (gradient brand) */}
          <WeeklyRecap counts={counts} />

          {/* Top tabs : Insights (ce que l'IA remonte) vs Mes veilles (ce
              que l'user a programmé). Cognitive split — c'est pas la même
              chose et ça ne devrait pas vivre dans la même liste. */}
          <div className="mb-4 flex border-b border-border">
            <TopTabButton
              active={topTab === 'insights'}
              onClick={() => setTopTab('insights')}
              label={t('veille.tab.insights')}
              count={counts.all}
            />
            <TopTabButton
              active={topTab === 'watches'}
              onClick={() => setTopTab('watches')}
              label={t('veille.tab.watches')}
              count={watchesQ.data?.watches?.length ?? null}
            />
          </div>

          {/* Onglet "Mes veilles" : on remonte la liste + cas vide dédié */}
          {topTab === 'watches' && (
            <>
              {(watchesQ.data?.watches?.length ?? 0) > 0 ? (
                <WatchesList watches={watchesQ.data?.watches ?? []} workspaceId={wsId ?? ''} />
              ) : (
                <div className="rounded-brief border border-dashed border-border bg-card/60 p-8 text-center">
                  <p className="mb-4 text-sm text-text-2">{t('veille.watchesList.empty')}</p>
                  <button
                    type="button"
                    onClick={() => setWatchModalOpen(true)}
                    className="sa-btn sa-btn-primary !text-[13px]"
                  >
                    + {t('veille.createAlert')}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Onglet "Insights" : filtres + liste comme avant */}
          {topTab === 'insights' && (
            <>
              {/* Filtres */}
              <div className="mb-4 flex flex-wrap gap-2">
                <FilterChip
                  active={filter === 'all'}
                  onClick={() => setFilter('all')}
                  label={t('veille.filter.all')}
                  count={counts.all}
                />
                <FilterChip
                  active={filter === 'critical'}
                  onClick={() => setFilter('critical')}
                  label={t('veille.filter.critical')}
                  count={counts.critical}
                />
                <FilterChip
                  active={filter === 'warning'}
                  onClick={() => setFilter('warning')}
                  label={t('veille.filter.warning')}
                  count={counts.warning}
                />
                <FilterChip
                  active={filter === 'opportunity'}
                  onClick={() => setFilter('opportunity')}
                  label={t('veille.filter.opportunity')}
                  count={counts.opportunity}
                />
                <FilterChip
                  active={filter === 'resolved'}
                  onClick={() => setFilter('resolved')}
                  label={t('veille.filter.resolved')}
                  count={counts.resolved}
                />
              </div>

              {/* Liste */}
              {loading ? (
                <div className="flex flex-col gap-3.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-[180px] animate-pulse rounded-brief border border-border bg-card"
                    />
                  ))}
                </div>
              ) : list.length === 0 ? (
                // Vraie première utilisation (pas de canonical_metrics) vs "all
                // clear" (workspace branché mais rien à signaler) : on bascule sur
                // FirstRunBlock dans le 1er cas pour donner une vraie direction
                // à l'utilisateur.
                filter === 'all' && !scoreQ.isLoading && !scoreQ.data?.has_data ? (
                  <VeilleFirstRun onOpenWatchModal={() => setWatchModalOpen(true)} />
                ) : (
                  <EmptyState filter={filter} />
                )
              ) : (
                <div className="flex flex-col gap-3.5">
                  {list.map((i) => (
                    <InsightCard key={i.id} insight={i} workspaceId={wsId ?? ''} locale={locale} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {watchModalOpen && <WatchModal onClose={() => setWatchModalOpen(false)} />}
    </AppLayout>
  )
}

function TopTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        '-mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition-colors',
        active
          ? 'border-brand-blue-deep text-text-1'
          : 'border-transparent text-text-3 hover:text-text-1',
      ].join(' ')}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={`ml-1.5 font-mono text-[11px] ${active ? 'text-brand-blue-deep' : 'text-text-3'}`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'cursor-pointer rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
        active
          ? 'border-text-1 bg-text-1 text-white'
          : 'border-border bg-card text-text-2 hover:border-border-bright hover:text-text-1',
      ].join(' ')}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={`ml-1.5 font-mono text-[11px] ${active ? 'text-white/70' : 'text-text-3'}`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function WeeklyRecap({
  counts,
}: {
  counts: { critical: number; warning: number; opportunity: number }
}) {
  const t = useT()
  const { locale } = useLocale()
  const today = new Date()
  const isMonday = today.getDay() === 1
  const dateLabel = today.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Phrase de récap : se construit uniquement depuis les compteurs réels.
  const parts: string[] = []
  if (counts.critical > 0) parts.push(t('veille.recap.criticalCount', { n: counts.critical }))
  if (counts.warning > 0) parts.push(t('veille.recap.warningCount', { n: counts.warning }))
  if (counts.opportunity > 0)
    parts.push(t('veille.recap.opportunityCount', { n: counts.opportunity }))
  const body = parts.length > 0 ? parts.join(' · ') : t('veille.recap.allGood')

  return (
    <div className="mb-6 flex items-center gap-4 rounded-brief bg-brand-grad px-5 py-4 shadow-card">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-white/20">
        <span className="text-lg">{isMonday ? '☀️' : '◐'}</span>
      </div>
      <div className="flex-1 text-white">
        <div className="mb-0.5 font-head text-[15px] font-bold">
          {t('veille.recap.title')} — {dateLabel}
        </div>
        <div className="text-[13px] opacity-90">{body}</div>
      </div>
    </div>
  )
}

function VeilleFirstRun({ onOpenWatchModal }: { onOpenWatchModal: () => void }) {
  const t = useT()
  return (
    <FirstRunBlock
      illustration={<WatchIllus />}
      eyebrow={t('veille.firstRun.eyebrow')}
      title={t('veille.firstRun.title')}
      body={t('veille.firstRun.body')}
      primary={{ label: t('veille.firstRun.cta'), to: '/connectors' }}
      // 3 templates de veille populaires — l'idée n'est pas que l'IA les
      // applique automatiquement (faudrait connaître les métriques user) mais
      // de donner des exemples concrets de ce qu'on peut surveiller. Le clic
      // ouvre le WatchModal en mode NL, l'user finit la phrase à sa sauce.
      secondary={[
        {
          label: t('veille.firstRun.template.roas'),
          sublabel: t('veille.firstRun.template.roasSub'),
          icon: '↘',
          onClick: onOpenWatchModal,
        },
        {
          label: t('veille.firstRun.template.cpa'),
          sublabel: t('veille.firstRun.template.cpaSub'),
          icon: '↗',
          onClick: onOpenWatchModal,
        },
        {
          label: t('veille.firstRun.template.churn'),
          sublabel: t('veille.firstRun.template.churnSub'),
          icon: '!',
          onClick: onOpenWatchModal,
        },
      ]}
    />
  )
}

function EmptyState({ filter }: { filter: FilterId }) {
  const t = useT()
  return (
    <div className="rounded-brief border border-dashed border-border bg-card/60 p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-green/13 text-2xl">
        {filter === 'resolved' ? '◯' : '✓'}
      </div>
      <p className="text-sm text-text-2">
        {filter === 'resolved' ? t('veille.empty.resolved') : t('veille.empty.allClear')}
      </p>
    </div>
  )
}

// ─── Mes veilles : liste + toggle on/off + delete ────────────────────────

function WatchesList({ watches, workspaceId }: { watches: Watch[]; workspaceId: string }) {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Toggle enabled (PATCH). Optimistic update — on flip le state local pour
  // un retour visuel instantané, rollback côté onError.
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/api/v1/watches/${id}`, {
        method: 'PATCH',
        body: { workspaceId, enabled },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watches', workspaceId] })
    },
    onError: (err: unknown) => {
      toast.push(err instanceof ApiError ? err.message : t('veille.watchesList.toggleError'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/v1/watches/${id}?workspaceId=${workspaceId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watches', workspaceId] })
      toast.push(t('veille.watchesList.deleted'))
    },
    onError: (err: unknown) => {
      toast.push(err instanceof ApiError ? err.message : t('veille.watchesList.deleteError'))
    },
  })

  const activeCount = watches.filter((w) => w.enabled).length

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-head text-base font-bold tracking-[-0.01em] text-text-1">
          {t('veille.watchesList.title')}
        </h3>
        <span className="font-mono text-[11px] text-text-3">
          {activeCount}/{watches.length} {t('veille.watchesList.activeSuffix')}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {watches.map((w) => (
          <WatchRow
            key={w.id}
            watch={w}
            onToggle={() => toggleMutation.mutate({ id: w.id, enabled: !w.enabled })}
            onDelete={() => {
              if (window.confirm(t('veille.watchesList.deleteConfirm'))) {
                deleteMutation.mutate(w.id)
              }
            }}
          />
        ))}
      </div>
    </section>
  )
}

function WatchRow({
  watch,
  onToggle,
  onDelete,
}: {
  watch: Watch
  onToggle: () => void
  onDelete: () => void
}) {
  const t = useT()
  const op = formatOperator(watch)
  return (
    <div className="flex items-start gap-3 rounded-brief border border-border bg-card p-3.5 shadow-card">
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={watch.enabled}
        title={watch.enabled ? t('veille.watchesList.disable') : t('veille.watchesList.enable')}
        className={[
          'mt-0.5 flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
          watch.enabled ? 'bg-brand-green' : 'bg-bg-3',
        ].join(' ')}
      >
        <span
          className={[
            'h-4 w-4 rounded-full bg-white transition-transform',
            watch.enabled ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold leading-tight text-text-1">
          {watch.description}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-text-3">
          <span className="font-mono">{watch.metric_key}</span>
          <span className="text-text-2">{op}</span>
          {watch.notify_email && <span>· email</span>}
          {watch.notify_in_app && <span>· in-app</span>}
          {watch.triggered_count > 0 && (
            <span className="text-brand-red">
              · {watch.triggered_count}× {t('veille.watchesList.triggered')}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('veille.watchesList.delete')}
        title={t('veille.watchesList.delete')}
        className="mt-0.5 flex-shrink-0 text-text-3 hover:text-brand-red"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 4h8m-1 0v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4m1.5 0V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

function formatOperator(w: Watch): string {
  const t = w.threshold
  switch (w.operator) {
    case 'drops_below':
      return `< ${t ?? '—'}`
    case 'rises_above':
      return `> ${t ?? '—'}`
    case 'changes_by_pct':
      return `Δ ≥ ${t ?? '—'} %`
    case 'any_change':
      return '∗ tout changement'
    default:
      return ''
  }
}

// Illustration géométrique "watch" (handoff §Illustrations) : strokes 2.5–3px,
// bouts arrondis, dégradé + accent cyan. Abstrait uniquement.
function WatchIllus() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" className="flex-shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="watch-grad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5C8FFF" />
          <stop offset="1" stopColor="#2DD9EE" />
        </linearGradient>
      </defs>
      {/* Cercle d'œil / radar */}
      <circle cx="31" cy="31" r="22" fill="none" stroke="url(#watch-grad)" strokeWidth="2.8" />
      <circle cx="31" cy="31" r="11" fill="none" stroke="#5C5C78" strokeWidth="2.5" />
      {/* Point signal cyan */}
      <circle cx="31" cy="31" r="3.5" fill="#2DD9EE" />
      {/* Trois petits traits radiaux */}
      <line
        x1="31"
        y1="6"
        x2="31"
        y2="11"
        stroke="url(#watch-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <line
        x1="56"
        y1="31"
        x2="51"
        y2="31"
        stroke="url(#watch-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <line
        x1="31"
        y1="56"
        x2="31"
        y2="51"
        stroke="url(#watch-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
