// Reports — livrable de synthèse (handoff §3.6 + brief V2).
// Layout : panneau gauche (liste + bouton générer) + panneau droit (aperçu).
// Le HTML rendu côté backend est affiché dans un <iframe srcdoc>, et
// l'export PDF se fait via window.print() — zéro dépendance Chromium.

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import AppLayout, { Topbar, useToast } from '@/components/AppLayout'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLocale, useT } from '@/lib/i18n'

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
        rightChip={
          <span className="sa-chip bg-brand-green/10 text-brand-green">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
            {t('nav.dataUpToDate')}
          </span>
        }
        primaryAction={{ label: t('nav.askQuestion'), onClick: () => navigate('/chat') }}
      />

      <div className="grid h-[calc(100vh-4rem)] grid-cols-[280px_1fr] gap-0 lg:h-[calc(100vh-4.5rem)]">
        {/* Panneau gauche : liste */}
        <aside className="overflow-y-auto border-r border-border bg-bg-2 p-4">
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            className="sa-btn sa-btn-primary mb-4 w-full !text-sm"
          >
            + {t('reports.generate')}
          </button>

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

        {/* Panneau droit : aperçu */}
        <main className="overflow-hidden bg-bg-0">
          {effectiveId ? (
            <ReportPreview workspaceId={wsId} reportId={effectiveId} />
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center text-text-2">
              {t('reports.selectOne')}
            </div>
          )}
        </main>
      </div>

      {genOpen && (
        <ReportGenModal
          wsId={wsId}
          onClose={() => setGenOpen(false)}
          onCreated={(id) => {
            setSelectedId(id)
            setGenOpen(false)
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

// ─── Modale de génération ───────────────────────────────────────────────

function ReportGenModal({
  wsId,
  onClose,
  onCreated,
}: {
  wsId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const toast = useToast()
  const now = useMemo(() => new Date(), [])
  // Défaut = mois en cours
  const [periodStart, setPeriodStart] = useState(firstOfMonth(now))
  const [periodEnd, setPeriodEnd] = useState(lastOfMonth(now))
  const [kind, setKind] = useState<'monthly' | 'quarterly' | 'custom'>('monthly')
  const [whiteLabel, setWhiteLabel] = useState(false)

  const mutation = useMutation({
    mutationFn: async () =>
      apiFetch<{ id: string }>('/api/v1/reports/generate', {
        method: 'POST',
        body: { workspaceId: wsId, periodStart, periodEnd, kind, whiteLabel },
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'list', wsId] })
      toast.push(t('reports.toast.generated'))
      onCreated(res.id)
    },
    onError: (err: unknown) => {
      toast.push(err instanceof Error ? err.message : t('reports.toast.failed'))
    },
  })

  return (
    <div
      className="fixed inset-0 z-[2500] flex items-center justify-center bg-text-1/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-[460px] rounded-brief border border-border bg-card shadow-float">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="font-head text-base font-bold text-text-1">{t('reports.gen.title')}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-text-3 hover:text-text-1"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-3.5 p-5">
          <div>
            <div className="sa-label">{t('reports.gen.kind')}</div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="sa-input !py-2.5"
            >
              <option value="monthly">{t('reports.kind.monthly')}</option>
              <option value="quarterly">{t('reports.kind.quarterly')}</option>
              <option value="custom">{t('reports.kind.custom')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="sa-label">{t('reports.gen.start')}</div>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="sa-input !py-2.5"
              />
            </div>
            <div>
              <div className="sa-label">{t('reports.gen.end')}</div>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="sa-input !py-2.5"
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-bg-2 px-3 py-2.5">
            <input
              type="checkbox"
              checked={whiteLabel}
              onChange={(e) => setWhiteLabel(e.target.checked)}
              className="accent-brand-blue-deep"
            />
            <span className="text-sm text-text-1">{t('reports.gen.whiteLabel')}</span>
          </label>
        </div>
        <footer className="flex items-center gap-2.5 border-t border-border bg-bg-2 px-5 py-3">
          <button type="button" onClick={onClose} className="sa-btn !text-sm">
            {t('common.back')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="sa-btn sa-btn-primary !text-sm disabled:opacity-50"
          >
            {mutation.isPending ? t('reports.gen.generating') : t('reports.gen.cta')}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function firstOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
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
