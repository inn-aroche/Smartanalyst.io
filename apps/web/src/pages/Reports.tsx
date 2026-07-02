// Reports — livrable de synthèse (handoff §3.6 + brief V2).
// Layout : panneau gauche (liste + bouton générer) + panneau droit (aperçu).
// Le HTML rendu côté backend est affiché dans un <iframe srcdoc>, et
// l'export PDF se fait via window.print() — zéro dépendance Chromium.

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'

import AppLayout, { Topbar, useToast } from '@/components/AppLayout'
import UpgradePrompt from '@/components/billing/UpgradePrompt'
import DataFreshnessChip from '@/components/DataFreshnessChip'
import FirstRunBlock from '@/components/onboarding/FirstRunBlock'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useEntitlements } from '@/lib/use-entitlements'
import { useEscapeKey } from '@/lib/use-escape-key'
import { useLocale, useT } from '@/lib/i18n'
import { sourceLabel } from '@/lib/sources'
import { track } from '@/lib/tracking'

type ReportRow = {
  id: string
  period_start: string
  period_end: string
  kind: 'monthly' | 'quarterly' | 'custom'
  status: 'draft' | 'generating' | 'ready' | 'sent' | 'failed'
  title: string
  white_label: boolean
  generated_at: string | null
  sent_at: string | null
  created_at: string
}

type ReportDetail = {
  id: string
  title: string
  status: ReportRow['status']
  html: string | null
}

export default function ReportsPage() {
  const t = useT()
  const navigate = useNavigate()
  const { state } = useAuth()
  const workspace = state.workspaces[0]
  const wsId = workspace?.id ?? ''
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [genOpen, setGenOpen] = useState(false)
  const [initialAiNote, setInitialAiNote] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Ecoute la palette : "Générer un rapport" ouvre le modal direct.
  useEffect(() => {
    function onAction(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail === 'create-report') setGenOpen(true)
    }
    window.addEventListener('sa-palette:action', onAction)
    return () => window.removeEventListener('sa-palette:action', onAction)
  }, [])

  // Deep-links : ?gen=1&aiNote=1 (crochet « Rapport » du chat, ActionShelf)
  // et ?id=<uuid> (résultat de la recherche globale). Consommés une fois puis
  // nettoyés de l'URL.
  useEffect(() => {
    const gen = searchParams.get('gen')
    const id = searchParams.get('id')
    const ai = searchParams.get('aiNote')
    if (!gen && !id && !ai) return
    if (id) setSelectedId(id)
    if (gen === '1') {
      setInitialAiNote(ai === '1')
      setGenOpen(true)
    }
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Measurement plan §6 — ouverture du wizard.
  useEffect(() => {
    if (genOpen) track('report_create_opened')
  }, [genOpen])

  // Gating (cahier §3 Lot 3) : sur plan Free, la génération de rapports
  // n'est pas incluse → on remplace le bouton "+ Générer" par un UpgradePrompt
  // contextualisé.
  const entitlementsQ = useEntitlements()
  const canGenerate = entitlementsQ.data?.features.canGenerateReports !== false

  const listQ = useQuery({
    queryKey: ['reports', 'list', wsId],
    enabled: !!wsId,
    queryFn: () => apiFetch<{ reports: ReportRow[] }>(`/api/v1/reports?workspaceId=${wsId}`),
    staleTime: 30_000,
  })

  const reports = listQ.data?.reports ?? []
  const effectiveId = selectedId ?? reports[0]?.id ?? null

  return (
    <AppLayout>
      <Topbar
        title={t('reports.topbar.title')}
        subtitle={
          workspace ? `${workspace.name} · ${t('reports.subtitle')}` : t('reports.subtitle')
        }
        rightChip={<DataFreshnessChip />}
        primaryAction={{ label: t('nav.askQuestion'), onClick: () => navigate('/chat') }}
      />

      {/* Layout responsive : sur mobile, liste pleine largeur en haut, détail
          en dessous (scroll naturel). À partir de md (≥768px), 2 colonnes
          côte à côte sur la hauteur viewport. */}
      <div className="grid h-[calc(100vh-4rem)] grid-cols-1 gap-0 md:grid-cols-[280px_1fr] lg:h-[calc(100vh-4.5rem)]">
        {/* Panneau gauche : liste */}
        <aside className="max-h-[40vh] overflow-y-auto border-b border-border bg-bg-2 p-4 md:max-h-none md:border-b-0 md:border-r">
          {canGenerate ? (
            <button
              type="button"
              onClick={() => setGenOpen(true)}
              className="sa-btn sa-btn-primary mb-4 w-full !text-sm"
            >
              + {t('reports.generate')}
            </button>
          ) : (
            <div className="mb-4">
              <UpgradePrompt feature="reports" compact />
            </div>
          )}

          {listQ.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[68px] animate-pulse rounded-[10px] border border-border bg-card"
                />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-brief border border-dashed border-border p-6 text-center text-sm text-text-2">
              {t('reports.empty')}
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {reports.map((r) => (
                <li key={r.id}>
                  <ReportRowItem
                    report={r}
                    active={r.id === effectiveId}
                    onSelect={() => setSelectedId(r.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Panneau droit : aperçu OU first-run quand la liste est vide. Le
            "selectOne" générique ne s'affiche que si la liste a des rapports
            mais qu'aucun n'est sélectionné (cas rare après suppression). */}
        <main className="overflow-hidden bg-bg-0">
          {effectiveId ? (
            <ReportPreview workspaceId={wsId} reportId={effectiveId} />
          ) : reports.length === 0 && !listQ.isLoading ? (
            <div className="flex h-full items-center justify-center p-10">
              <div className="max-w-[480px]">
                <FirstRunBlock
                  illustration={<ReportsIllus />}
                  eyebrow={t('reports.firstRun.eyebrow')}
                  title={t('reports.firstRun.title')}
                  body={t('reports.firstRun.body')}
                  primary={{
                    label: t('reports.firstRun.cta'),
                    onClick: () => setGenOpen(true),
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center text-text-2">
              {t('reports.selectOne')}
            </div>
          )}
        </main>
      </div>

      {genOpen && (
        <ReportWizardModal
          wsId={wsId}
          initialAiNote={initialAiNote}
          onClose={() => {
            setGenOpen(false)
            setInitialAiNote(false)
          }}
          onCreated={(id) => {
            setSelectedId(id)
            setGenOpen(false)
            setInitialAiNote(false)
          }}
        />
      )}
    </AppLayout>
  )
}

// ─── Item liste ──────────────────────────────────────────────────────────

function ReportRowItem({
  report,
  active,
  onSelect,
}: {
  report: ReportRow
  active: boolean
  onSelect: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const statusCls = {
    draft: 'bg-text-3/10 text-text-3',
    generating: 'bg-brand-blue-dim text-brand-blue-deep',
    ready: 'bg-brand-green/10 text-brand-green',
    sent: 'bg-brand-cyan/10 text-brand-cyan',
    failed: 'bg-brand-red/10 text-brand-red',
  }[report.status]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full flex-col gap-1 rounded-[10px] border px-3 py-2.5 text-left transition-all',
        active
          ? 'border-border bg-card shadow-card'
          : 'border-transparent bg-transparent hover:bg-card hover:shadow-card',
      ].join(' ')}
    >
      <div className="truncate text-[13px] font-semibold text-text-1">{report.title}</div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-text-3">
          {formatRange(report.period_start, report.period_end, locale)}
        </span>
        <span className={`sa-chip !px-2 !py-0.5 !text-[10px] ${statusCls}`}>
          {t(`reports.status.${report.status}` as never)}
        </span>
      </div>
    </button>
  )
}

// ─── Aperçu (iframe srcDoc) ──────────────────────────────────────────────

function ReportPreview({ workspaceId, reportId }: { workspaceId: string; reportId: string }) {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()
  const q = useQuery({
    queryKey: ['reports', 'detail', workspaceId, reportId],
    enabled: !!workspaceId && !!reportId,
    queryFn: () => apiFetch<ReportDetail>(`/api/v1/reports/${reportId}?workspaceId=${workspaceId}`),
    staleTime: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: async () =>
      apiFetch(`/api/v1/reports/${reportId}?workspaceId=${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'list', workspaceId] })
      toast.push(t('reports.toast.deleted'))
    },
  })

  function handlePrint() {
    // Ouvrir l'iframe dans une fenêtre dédiée pour print en plein écran.
    const html = q.data?.html
    if (!html) return
    track('report_downloaded')
    const w = window.open('', '_blank')
    if (!w) {
      toast.push(t('reports.printBlocked'))
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    // Laisse le navigateur charger les styles avant d'invoquer print.
    window.setTimeout(() => w.print(), 250)
  }

  if (q.isLoading) {
    return <div className="flex h-full items-center justify-center text-text-3">…</div>
  }
  if (!q.data?.html) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center text-text-2">
        {q.data?.status === 'failed' ? t('reports.failed') : t('reports.notReady')}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-2.5">
        <div className="font-head text-[14px] font-semibold text-text-1">{q.data.title}</div>
        <div className="flex-1" />
        <button type="button" onClick={handlePrint} className="sa-btn !py-1.5 !text-xs">
          ↓ {t('reports.printPdf')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('reports.deleteConfirm'))) deleteMutation.mutate()
          }}
          className="sa-btn !py-1.5 !text-xs text-brand-red"
        >
          {t('common.delete')}
        </button>
      </div>
      <iframe
        title={q.data.title}
        srcDoc={q.data.html}
        className="flex-1 border-0 bg-white"
        sandbox=""
      />
    </div>
  )
}

// ─── Wizard de génération (V2 — 1. sources · 2. période · 3. contexte) ──

type ConnectorRow = {
  id: string
  source: string
  status: 'active' | 'expired' | 'error' | 'disconnected'
}

type PeriodPreset = 'thisMonth' | 'lastMonth' | 'last30' | 'thisQuarter' | 'custom'
const PERIOD_PRESETS: PeriodPreset[] = ['thisMonth', 'lastMonth', 'last30', 'thisQuarter', 'custom']

function ReportWizardModal({
  wsId,
  initialAiNote = false,
  onClose,
  onCreated,
}: {
  wsId: string
  initialAiNote?: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const t = useT()
  const navigate = useNavigate()
  useEscapeKey(onClose)
  const queryClient = useQueryClient()
  const toast = useToast()
  const entitlementsQ = useEntitlements()
  // Toggle Rapide/Approfondi — même gating que le chat (jamais de nom de
  // provider côté UI, ADR-04).
  const canDeep = entitlementsQ.data?.features.canUseDeepChat === true

  const [step, setStep] = useState(0)
  // Étape 1 — sources. null = pas encore initialisé : toutes cochées par
  // défaut dès que les connecteurs sont chargés.
  const [selectedSources, setSelectedSources] = useState<string[] | null>(null)
  // Étape 2 — période (presets + custom, dates locales — pas de toISOString
  // qui décale d'un jour en UTC+).
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth')
  const [periodStart, setPeriodStart] = useState(() => presetRange('thisMonth').start)
  const [periodEnd, setPeriodEnd] = useState(() => presetRange('thisMonth').end)
  // Étape 3 — contexte libre + IA + mode.
  const [context, setContext] = useState('')
  const [aiNote, setAiNote] = useState(initialAiNote)
  const [mode, setMode] = useState<'fast' | 'deep'>('fast')
  // Avancé (replié) : template, white-label, segmentation, comparaison.
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [template, setTemplate] = useState<'standard' | 'executive' | 'detail' | 'agency'>(
    'standard',
  )
  const [whiteLabel, setWhiteLabel] = useState(false)
  const [segmentBy, setSegmentBy] = useState<'none' | 'source'>('none')
  const [compareToPrev, setCompareToPrev] = useState(false)

  const connectorsQ = useQuery({
    queryKey: ['connectors', 'list', wsId],
    enabled: !!wsId,
    queryFn: () =>
      apiFetch<{ connectors: ConnectorRow[] }>(`/api/v1/connectors?workspaceId=${wsId}`),
    staleTime: 5 * 60_000,
  })
  const availableSources = useMemo(
    () =>
      (connectorsQ.data?.connectors ?? [])
        .filter((c) => c.status === 'active')
        .map((c) => c.source),
    [connectorsQ.data],
  )
  // Défaut = tout inclus (l'user décoche ce qu'il ne veut pas).
  useEffect(() => {
    if (selectedSources === null && availableSources.length > 0) {
      setSelectedSources(availableSources)
    }
  }, [availableSources, selectedSources])
  const sources = selectedSources ?? []

  function applyPreset(p: PeriodPreset) {
    setPreset(p)
    if (p !== 'custom') {
      const r = presetRange(p)
      setPeriodStart(r.start)
      setPeriodEnd(r.end)
    }
  }

  const periodValid = periodStart <= periodEnd
  // kind dérivé du preset — plus de doublon kind/template dans l'UI.
  const kind: 'monthly' | 'quarterly' | 'custom' =
    preset === 'thisMonth' || preset === 'lastMonth'
      ? 'monthly'
      : preset === 'thisQuarter'
        ? 'quarterly'
        : 'custom'

  const mutation = useMutation({
    mutationFn: async () =>
      apiFetch<{ id: string }>('/api/v1/reports/generate', {
        method: 'POST',
        body: {
          workspaceId: wsId,
          periodStart,
          periodEnd,
          kind,
          whiteLabel,
          // Sous-ensemble strict uniquement — tout coché = on omet (backend
          // = « toutes »), pour ne pas figer la liste dans generation_params.
          ...(sources.length > 0 && sources.length < availableSources.length ? { sources } : {}),
          ...(segmentBy === 'source' ? { segmentBy: 'source' } : {}),
          compareToPreviousPeriod: compareToPrev,
          template,
          aiNote,
          ...(context.trim() ? { context: context.trim() } : {}),
          mode,
        },
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'list', wsId] })
      track('report_generated', {
        mode,
        has_context: Boolean(context.trim()),
        preset,
        template,
      })
      toast.push(t('reports.toast.generated'))
      onCreated(res.id)
    },
    onError: (err: unknown) => {
      toast.push(err instanceof Error ? err.message : t('reports.toast.failed'))
    },
  })

  function toggleSource(src: string) {
    setSelectedSources((prev) => {
      const cur = prev ?? availableSources
      return cur.includes(src) ? cur.filter((s) => s !== src) : [...cur, src]
    })
  }

  const stepLabels = [
    t('reports.wizard.step1'),
    t('reports.wizard.step2'),
    t('reports.wizard.step3'),
  ]
  const nextDisabled =
    (step === 0 && (availableSources.length === 0 || sources.length === 0)) ||
    (step === 1 && !periodValid)

  return (
    <div
      className="fixed inset-0 z-[2500] flex items-center justify-center bg-text-1/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('reports.gen.title')}
    >
      <div className="w-full max-w-[500px] rounded-brief border border-border bg-card shadow-float">
        <header className="border-b border-border px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div className="font-head text-base font-bold text-text-1">
              {t('reports.gen.title')}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="text-text-3 hover:text-text-1"
            >
              ✕
            </button>
          </div>
          {/* Indicateur d'étapes */}
          <div className="mt-3 flex items-center gap-2">
            {stepLabels.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={[
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                  i === step
                    ? 'bg-brand-blue-dim text-brand-blue-deep'
                    : i < step
                      ? 'text-text-2 hover:text-text-1'
                      : 'text-text-3',
                ].join(' ')}
              >
                <span className="font-mono">{i + 1}</span> {label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex min-h-[240px] flex-col gap-3.5 p-5">
          {/* ─── Étape 1 : sources ─── */}
          {step === 0 && (
            <>
              <div className="text-sm font-semibold text-text-1">
                {t('reports.wizard.sourcesTitle')}
              </div>
              {connectorsQ.isLoading ? (
                <div className="flex flex-wrap gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-8 w-28 animate-pulse rounded-full bg-bg-3" />
                  ))}
                </div>
              ) : availableSources.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border bg-bg-2 p-5 text-center">
                  <div className="text-sm text-text-2">{t('reports.wizard.sourcesEmpty')}</div>
                  <button
                    type="button"
                    onClick={() => navigate('/connectors')}
                    className="sa-btn sa-btn-primary mt-3 !text-sm"
                  >
                    {t('reports.wizard.sourcesEmptyCta')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {availableSources.map((s) => {
                      const checked = sources.includes(s)
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSource(s)}
                          className={[
                            'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                            checked
                              ? 'border-brand-blue-deep bg-brand-blue-dim text-brand-blue-deep'
                              : 'border-border bg-card text-text-3 hover:border-border-bright hover:text-text-1',
                          ].join(' ')}
                          aria-pressed={checked}
                        >
                          {checked ? '✓ ' : ''}
                          {sourceLabel(s)}
                        </button>
                      )
                    })}
                  </div>
                  <div className="text-[11.5px] text-text-3">{t('reports.wizard.sourcesAll')}</div>
                </>
              )}
            </>
          )}

          {/* ─── Étape 2 : période ─── */}
          {step === 1 && (
            <>
              <div className="text-sm font-semibold text-text-1">
                {t('reports.wizard.periodTitle')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={[
                      'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                      preset === p
                        ? 'border-brand-blue-deep bg-brand-blue-dim text-brand-blue-deep'
                        : 'border-border bg-card text-text-3 hover:border-border-bright hover:text-text-1',
                    ].join(' ')}
                    aria-pressed={preset === p}
                  >
                    {t(`reports.wizard.preset.${p}` as never)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="sa-label">{t('reports.gen.start')}</div>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => {
                      setPeriodStart(e.target.value)
                      setPreset('custom')
                    }}
                    className="sa-input !py-2.5"
                  />
                </div>
                <div>
                  <div className="sa-label">{t('reports.gen.end')}</div>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => {
                      setPeriodEnd(e.target.value)
                      setPreset('custom')
                    }}
                    className="sa-input !py-2.5"
                  />
                </div>
              </div>
              {!periodValid && (
                <div className="text-[12px] text-brand-red">
                  {t('reports.wizard.periodInvalid')}
                </div>
              )}
            </>
          )}

          {/* ─── Étape 3 : contexte + IA + avancé ─── */}
          {step === 2 && (
            <>
              <div className="text-sm font-semibold text-text-1">
                {t('reports.wizard.contextTitle')}
              </div>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value.slice(0, 1000))}
                placeholder={t('reports.wizard.contextPlaceholder')}
                rows={3}
                className="sa-input resize-none !py-2.5 text-sm"
              />
              <div className="-mt-2 flex items-center justify-between">
                <span className="text-[11.5px] text-text-3">{t('reports.wizard.contextHint')}</span>
                <span className="font-mono text-[10.5px] text-text-3">{context.length}/1000</span>
              </div>

              {/* Toggle Rapide/Approfondi — libellés only, jamais le provider. */}
              <div className="flex items-center gap-2.5">
                <span className="sa-label !mb-0">{t('reports.wizard.modeLabel')}</span>
                <div className="flex overflow-hidden rounded-full border border-border">
                  <button
                    type="button"
                    onClick={() => setMode('fast')}
                    className={`px-3 py-1 text-[12px] font-medium transition-colors ${
                      mode === 'fast'
                        ? 'bg-brand-blue-dim text-brand-blue-deep'
                        : 'bg-card text-text-3 hover:text-text-1'
                    }`}
                    aria-pressed={mode === 'fast'}
                  >
                    ⚡ {t('chat.mode.fast')}
                  </button>
                  <button
                    type="button"
                    onClick={() => canDeep && setMode('deep')}
                    disabled={!canDeep}
                    className={`px-3 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      mode === 'deep'
                        ? 'bg-brand-blue-dim text-brand-blue-deep'
                        : 'bg-card text-text-3 hover:text-text-1'
                    }`}
                    aria-pressed={mode === 'deep'}
                  >
                    🧠 {t('chat.mode.deep')}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-border bg-bg-2 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={aiNote || Boolean(context.trim())}
                  disabled={Boolean(context.trim())}
                  onChange={(e) => setAiNote(e.target.checked)}
                  className="mt-0.5 accent-brand-blue-deep"
                />
                <div>
                  <div className="text-sm text-text-1">{t('reports.gen.aiNote')}</div>
                  <div className="mt-0.5 text-[11.5px] text-text-3">
                    {t('reports.gen.aiNote.hint')}
                  </div>
                </div>
              </label>

              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="-mb-1 flex items-center justify-between text-left text-[12.5px] font-semibold text-text-2 hover:text-text-1"
              >
                <span>{t('reports.gen.advanced')}</span>
                <span className="font-mono text-[11px]">{advancedOpen ? '−' : '+'}</span>
              </button>
              {advancedOpen && (
                <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-bg-2 p-3.5">
                  <div>
                    <div className="sa-label">{t('reports.gen.template')}</div>
                    <select
                      value={template}
                      onChange={(e) => setTemplate(e.target.value as typeof template)}
                      className="sa-input !py-2"
                    >
                      <option value="standard">{t('reports.gen.template.standard')}</option>
                      <option value="executive">{t('reports.gen.template.executive')}</option>
                      <option value="detail">{t('reports.gen.template.detail')}</option>
                      <option value="agency">{t('reports.gen.template.agency')}</option>
                    </select>
                  </div>
                  <div>
                    <div className="sa-label">{t('reports.gen.segmentBy')}</div>
                    <select
                      value={segmentBy}
                      onChange={(e) => setSegmentBy(e.target.value as 'none' | 'source')}
                      className="sa-input !py-2"
                    >
                      <option value="none">{t('reports.gen.segmentNone')}</option>
                      <option value="source">{t('reports.gen.segmentSource')}</option>
                    </select>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-[8px] border border-border bg-card px-3 py-2">
                    <input
                      type="checkbox"
                      checked={compareToPrev}
                      onChange={(e) => setCompareToPrev(e.target.checked)}
                      className="accent-brand-blue-deep"
                    />
                    <span className="text-[13px] text-text-1">{t('reports.gen.compare')}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-[8px] border border-border bg-card px-3 py-2">
                    <input
                      type="checkbox"
                      checked={whiteLabel || template === 'agency'}
                      disabled={template === 'agency'}
                      onChange={(e) => setWhiteLabel(e.target.checked)}
                      className="accent-brand-blue-deep"
                    />
                    <span className="text-[13px] text-text-1">{t('reports.gen.whiteLabel')}</span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center gap-2.5 border-t border-border bg-bg-2 px-5 py-3">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            className="sa-btn !text-sm"
          >
            {step === 0 ? t('common.close') : t('reports.wizard.back')}
          </button>
          <div className="flex-1" />
          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={nextDisabled}
              className="sa-btn sa-btn-primary !text-sm disabled:opacity-50"
            >
              {t('reports.wizard.next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !periodValid}
              className="sa-btn sa-btn-primary !text-sm disabled:opacity-50"
            >
              {mutation.isPending ? t('reports.gen.generating') : t('reports.gen.cta')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Formate une date en YYYY-MM-DD LOCAL — surtout pas toISOString() qui
 * convertit en UTC et décale d'un jour pour les fuseaux UTC+ (le bug
 * historique du « mois en cours » qui commençait le 30 du mois précédent).
 */
function fmtLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function presetRange(p: PeriodPreset): { start: string; end: string } {
  const now = new Date()
  switch (p) {
    case 'lastMonth':
      return {
        start: fmtLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    case 'last30':
      return {
        start: fmtLocalDate(new Date(now.getTime() - 29 * 86_400_000)),
        end: fmtLocalDate(now),
      }
    case 'thisQuarter': {
      const q = Math.floor(now.getMonth() / 3)
      return {
        start: fmtLocalDate(new Date(now.getFullYear(), q * 3, 1)),
        end: fmtLocalDate(new Date(now.getFullYear(), q * 3 + 3, 0)),
      }
    }
    case 'thisMonth':
    case 'custom':
    default:
      return {
        start: fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: fmtLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      }
  }
}
function formatRange(start: string, end: string, locale: string): string {
  const loc = locale === 'en' ? 'en-GB' : 'fr-FR'
  const s = new Date(start).toLocaleDateString(loc, { day: 'numeric', month: 'short' })
  const e = new Date(end).toLocaleDateString(loc, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${s} → ${e}`
}

/** Petit visuel "document avec ligne brand" pour le first-run reports. */
function ReportsIllus() {
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden="true" className="flex-shrink-0">
      <defs>
        <linearGradient id="rep-grad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5C8FFF" />
          <stop offset="1" stopColor="#2DD9EE" />
        </linearGradient>
      </defs>
      <rect
        x="18"
        y="10"
        width="42"
        height="58"
        rx="6"
        fill="none"
        stroke="url(#rep-grad)"
        strokeWidth="2.8"
      />
      <line
        x1="26"
        y1="24"
        x2="52"
        y2="24"
        stroke="#5C5C78"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <line
        x1="26"
        y1="32"
        x2="46"
        y2="32"
        stroke="#5C5C78"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M 26 50 L 32 44 L 38 47 L 44 40 L 52 45"
        fill="none"
        stroke="url(#rep-grad)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="52" cy="45" r="2.8" fill="#2DD9EE" />
    </svg>
  )
}
