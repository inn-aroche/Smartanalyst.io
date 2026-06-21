// PinnedWidgets — section "Mes épingles" sur BriefHome (cahier 22b §3.4).
//
// Affiche les widgets qu'un user a epingles depuis le chat (boutons 📌 sur
// chaque KPI/chart de reponse). Chaque widget rend soit une carte KPI, soit
// un mini chart, avec un bouton ✕ pour le retirer.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, ApiError } from '@/lib/api'
import { useT } from '@/lib/i18n'

type PinnedWidget =
  | {
      id: string
      kind: 'kpi'
      spec: {
        title: string
        value: string | null
        delta: string | null
        unit: string | null
        metricKey: string | null
      }
      position: number
      created_at: string
    }
  | {
      id: string
      kind: 'chart'
      spec: {
        title: string
        series: Array<{ date: string; value: number }>
        unit: string | null
        metricKey: string | null
      }
      position: number
      created_at: string
    }

export default function PinnedWidgets({ workspaceId }: { workspaceId: string }) {
  const t = useT()
  const queryClient = useQueryClient()

  const widgetsQ = useQuery({
    queryKey: ['pinned-widgets', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ widgets: PinnedWidget[] }>(`/api/v1/pinned-widgets?workspaceId=${workspaceId}`),
    staleTime: 60_000,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/v1/pinned-widgets/${id}?workspaceId=${workspaceId}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pinned-widgets', workspaceId] })
    },
  })

  const widgets = widgetsQ.data?.widgets || []
  // On ne rend rien tant qu'il n'y a aucun widget — pas de bruit visuel sur
  // BriefHome pour un user qui n'a jamais epingle.
  if (widgetsQ.isLoading || widgets.length === 0) return null

  // Best-effort sur ApiError silencieux : log mais on ne bloque pas le render.
  if (widgetsQ.isError && !(widgetsQ.error instanceof ApiError)) return null

  return (
    <section className="mb-6">
      <div className="sa-eyebrow">{t('briefHome.pinned.title')}</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {widgets.map((w) => (
          <PinnedCard key={w.id} widget={w} onRemove={() => remove.mutate(w.id)} />
        ))}
      </div>
    </section>
  )
}

function PinnedCard({ widget, onRemove }: { widget: PinnedWidget; onRemove: () => void }) {
  return (
    <div className="group relative rounded-brief border border-border bg-card p-4 shadow-card">
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer le widget"
        title="Retirer"
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-text-3 opacity-0 hover:bg-bg-3 hover:text-brand-red group-hover:opacity-100"
      >
        ✕
      </button>
      {widget.kind === 'kpi' ? <KpiBody widget={widget} /> : <ChartBody widget={widget} />}
    </div>
  )
}

function KpiBody({ widget }: { widget: Extract<PinnedWidget, { kind: 'kpi' }> }) {
  const { title, value, delta } = widget.spec
  const isUp = delta != null && !String(delta).trimStart().startsWith('-')
  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-text-3">{title}</div>
      <div className="mt-1 font-head text-[24px] font-bold tracking-[-0.02em] text-text-1">
        {value || '—'}
      </div>
      {delta && (
        <div
          className={`mt-0.5 font-mono text-[11.5px] ${isUp ? 'text-brand-green' : 'text-brand-red'}`}
        >
          {delta}
        </div>
      )}
    </div>
  )
}

function ChartBody({ widget }: { widget: Extract<PinnedWidget, { kind: 'chart' }> }) {
  const series = widget.spec.series
  const max = Math.max(...series.map((p) => p.value), 1)
  return (
    <div>
      <div className="mb-2 text-[12.5px] font-semibold text-text-1">{widget.spec.title}</div>
      <div className="flex h-[80px] items-end gap-1">
        {series.map((p, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[2px] bg-brand-blue-deep"
            style={{ height: `${Math.max((p.value / max) * 100, 2)}%` }}
            title={`${p.date} — ${p.value}`}
          />
        ))}
      </div>
    </div>
  )
}
