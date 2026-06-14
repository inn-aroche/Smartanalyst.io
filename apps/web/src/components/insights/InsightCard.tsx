// InsightCard — version détaillée pour la page Veille (handoff Claude Design,
// sa-views.jsx → InsightCard, règle des 3 éléments : SevBadge + chip +
// source/heure · titre (fait chiffré) · mouvement de métrique from → to ·
// CAUSE · RECO · actions).
//
// Une version compacte sans la métrique ni les actions vit dans
// BriefHome.tsx (3 cartes "Les 3 choses qui comptent ce matin").

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { useToast } from '@/components/AppLayout'
import { apiFetch } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { ActionStatus, Insight, InsightStatus, Severity } from '@/lib/insights-types'

type SevMeta = { color: string; bg: string; icon: string; label: string }

function severityMeta(s: Severity, t: ReturnType<typeof useT>): SevMeta {
  switch (s) {
    case 'critical':
      return {
        color: 'text-brand-red',
        bg: 'bg-brand-red/13',
        icon: '!',
        label: t('veille.sev.critical'),
      }
    case 'high':
      return {
        color: 'text-brand-red',
        bg: 'bg-brand-red/13',
        icon: '!',
        label: t('veille.sev.high'),
      }
    case 'medium':
      return {
        color: 'text-brand-amber',
        bg: 'bg-brand-amber/13',
        icon: '!',
        label: t('veille.sev.medium'),
      }
    default:
      return {
        color: 'text-brand-blue-deep',
        bg: 'bg-brand-blue-deep/13',
        icon: '↗',
        label: t('veille.sev.low'),
      }
  }
}

function formatRelative(iso: string, locale: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return locale === 'en' ? 'just now' : "à l'instant"
  if (diffMin < 60) return locale === 'en' ? `${diffMin}m ago` : `il y a ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return locale === 'en' ? `${diffH}h ago` : `il y a ${diffH} h`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return locale === 'en' ? `${diffD}d ago` : `il y a ${diffD} j`
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

function formatMetricValue(v: number | string | null): string {
  if (v == null) return '—'
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1000)
      return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
    return v.toString().replace('.', ',')
  }
  return String(v)
}

export default function InsightCard({
  insight,
  workspaceId,
  locale,
}: {
  insight: Insight
  workspaceId: string
  locale: string
}) {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const meta = severityMeta(insight.severity, t)
  const ev0 = insight.evidence[0]
  // Première action proposée — c'est elle qu'on "promeut" en tâche.
  const proposedAction = insight.actions.find((a) => a.status === 'proposed')
  const [busy, setBusy] = useState(false)

  const dismissMutation = useMutation({
    mutationFn: async () =>
      apiFetch(`/api/v1/insights/${insight.id}`, {
        method: 'PATCH',
        body: { workspaceId, status: 'dismissed' as InsightStatus },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['insights'] })
      toast.push(t('veille.toast.ignored'))
    },
  })

  const promoteAction = useMutation({
    mutationFn: async (actionId: string) =>
      apiFetch(`/api/v1/insights/actions/${actionId}`, {
        method: 'PATCH',
        body: { workspaceId, status: 'todo' as ActionStatus },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['insights'] })
      void queryClient.invalidateQueries({ queryKey: ['actions'] })
      toast.push(t('veille.toast.addedToTasks'))
    },
  })

  function askAssistant() {
    // Pré-remplit le chat avec la question implicite. Le bouton est désactivé
    // si on n'a pas de connecteur live (l'assistant remontera de toute façon
    // un message "connecte une source"). On préfère naviguer même si vide.
    const q = encodeURIComponent(
      `${t('veille.askPrefix')} : « ${insight.title.replace(/^[^a-zA-ZÀ-ÿ]+/, '')} »`,
    )
    navigate(`/chat?q=${q}`)
  }

  return (
    <article className="rounded-brief border border-border bg-card p-5 shadow-card">
      {/* Header : SevBadge + chip + source/heure */}
      <header className="mb-3 flex items-center gap-2.5">
        <span
          className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[10px] font-head text-[15px] font-extrabold ${meta.bg} ${meta.color}`}
        >
          {meta.icon}
        </span>
        <span className={`sa-chip ${meta.bg} ${meta.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full bg-current`} />
          {meta.label}
        </span>
        <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-text-3">
          {ev0?.source ?? insight.primary_source ?? '—'} ·{' '}
          {formatRelative(insight.created_at, locale)}
        </span>
      </header>

      {/* Titre (fait chiffré) */}
      <h3 className="mb-3.5 font-head text-[17px] font-bold leading-[1.3] tracking-[-0.01em] text-text-1">
        {insight.title}
      </h3>

      {/* Mouvement de métrique from → to (si evidence disponible) */}
      {ev0 && ev0.value != null && (
        <div className="mb-3.5 flex items-center gap-3 rounded-[10px] bg-bg-2 px-3.5 py-2.5">
          <span className="flex-1 font-mono text-[11px] text-text-3">{ev0.label}</span>
          <span className="font-mono text-[13px] text-text-2">
            {formatMetricValue(ev0.previous_value)}
          </span>
          <span className={`text-[13px] ${meta.color}`}>→</span>
          <span className={`font-mono text-[14px] font-medium ${meta.color}`}>
            {formatMetricValue(ev0.value)}
          </span>
        </div>
      )}

      {/* CAUSE + RECO */}
      <div className="mb-4 flex flex-col gap-2.5">
        {insight.summary && (
          <div className="flex gap-2.5">
            <span className="w-14 flex-shrink-0 pt-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-text-3">
              {t('veille.cause')}
            </span>
            <span className="text-[13.5px] leading-[1.5] text-text-2">{insight.summary}</span>
          </div>
        )}
        {proposedAction && (
          <div className="flex gap-2.5">
            <span className="w-14 flex-shrink-0 pt-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-brand-blue-deep">
              {t('veille.reco')}
            </span>
            <span className="text-[13.5px] font-medium leading-[1.5] text-text-1">
              {proposedAction.title}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {proposedAction && (
          <button
            type="button"
            onClick={() => {
              setBusy(true)
              promoteAction.mutate(proposedAction.id, { onSettled: () => setBusy(false) })
            }}
            disabled={busy || promoteAction.isPending}
            className="sa-btn sa-btn-primary !text-[12.5px] disabled:opacity-60"
          >
            + {t('veille.actions.addToTasks')}
          </button>
        )}
        <button type="button" onClick={askAssistant} className="sa-btn !text-[12.5px]">
          {t('veille.actions.askAssistant')}
        </button>
        <button
          type="button"
          onClick={() => dismissMutation.mutate()}
          disabled={dismissMutation.isPending}
          className="sa-btn ml-auto !px-3 !py-2 !text-[12.5px] text-text-3 disabled:opacity-60"
        >
          {t('veille.actions.ignore')}
        </button>
      </div>
    </article>
  )
}
