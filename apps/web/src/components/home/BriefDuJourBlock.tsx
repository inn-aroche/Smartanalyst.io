import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import InsightChart from '@/components/home/InsightChart'
import { apiFetch } from '@/lib/api'
import type {
  Insight,
  InsightStatus,
  ActionCard,
  ActionStatus,
  Severity,
  Confidence,
} from '@/lib/insights-types'
import { useT } from '@/lib/i18n'

const SEVERITY_PILL: Record<Severity, string> = {
  critical: 'border-brand-red/30 bg-brand-red/10 text-brand-red',
  high: 'border-brand-red/30 bg-brand-red/10 text-brand-red',
  medium: 'border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan',
  low: 'border-border bg-card text-text-3',
}

const CONFIDENCE_TEXT: Record<Confidence, string> = {
  high: 'text-brand-green',
  medium: 'text-brand-cyan',
  low: 'text-text-3',
}

export default function BriefDuJourBlock({ workspaceId }: { workspaceId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const q = useQuery({
    queryKey: ['insights', 'list', workspaceId, 'open'],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ insights: Insight[] }>(`/api/v1/insights?workspaceId=${workspaceId}&status=open`),
    staleTime: 60_000,
  })

  const setInsightStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InsightStatus }) =>
      apiFetch(`/api/v1/insights/${id}`, {
        method: 'PATCH',
        body: { workspaceId, status },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['insights'] })
    },
  })

  const setActionStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ActionStatus }) =>
      apiFetch(`/api/v1/insights/actions/${id}`, {
        method: 'PATCH',
        body: { workspaceId, status },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['insights'] })
    },
  })

  if (q.isLoading) {
    return (
      <div className="sa-card animate-pulse">
        <div className="h-3 w-32 rounded bg-bg-2" />
        <div className="mt-3 h-6 w-64 rounded bg-bg-2" />
      </div>
    )
  }

  // Erreur API : on cache silencieusement (la Home reste fonctionnelle).
  if (q.isError || !q.data) return null

  const insights = q.data.insights ?? []

  return (
    <div className="sa-card">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-brand-cyan">
            {t('home.brief.kicker')}
          </div>
          <h2 className="mt-1 font-head text-lg font-semibold text-text-1">
            {t('home.brief.title')}
          </h2>
        </div>
        {insights.length > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            {t('home.brief.count', { count: insights.length })}
          </span>
        )}
      </div>

      {insights.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((ins) => (
            <InsightItem
              key={ins.id}
              insight={ins}
              workspaceId={workspaceId}
              onChangeInsight={(status) => setInsightStatus.mutate({ id: ins.id, status })}
              onChangeAction={(id, status) => setActionStatus.mutate({ id, status })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function EmptyState() {
  const t = useT()
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
      <p className="text-sm text-text-2">{t('home.brief.empty.body')}</p>
      <Link to="/connectors" className="sa-btn mt-3 !py-1.5 !text-xs">
        {t('home.brief.empty.cta')}
      </Link>
    </div>
  )
}

function InsightItem({
  insight,
  workspaceId,
  onChangeInsight,
  onChangeAction,
}: {
  insight: Insight
  workspaceId: string
  onChangeInsight: (s: InsightStatus) => void
  onChangeAction: (id: string, s: ActionStatus) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ev0 = insight.evidence[0]
  return (
    <li className="rounded-lg border border-border bg-bg-2/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <span
          className={`mt-0.5 inline-flex h-5 items-center rounded-full border px-2 font-mono text-[9px] uppercase tracking-widest ${SEVERITY_PILL[insight.severity]}`}
        >
          {insight.severity}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-head text-sm font-semibold text-text-1">{insight.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-2">{insight.summary}</p>
          {ev0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-3">
                {ev0.source}
              </span>
              <span className="text-[10px] text-text-3">·</span>
              <span className="text-xs text-text-2">{ev0.label}</span>
              {typeof ev0.delta_percent === 'number' && (
                <span
                  className={`font-mono text-[10px] ${
                    ev0.delta_percent < 0 ? 'text-brand-red' : 'text-brand-green'
                  }`}
                >
                  {ev0.delta_percent > 0 ? '+' : ''}
                  {ev0.delta_percent.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
        <span
          className={`ml-2 self-start font-mono text-[9px] uppercase tracking-widest ${CONFIDENCE_TEXT[insight.confidence]}`}
        >
          {insight.confidence}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          {insight.chart_spec && (
            <div className="mb-3">
              <InsightChart workspaceId={workspaceId} insightId={insight.id} />
            </div>
          )}
          {insight.evidence.length > 1 && (
            <div className="mb-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                {t('home.brief.evidence')}
              </div>
              <ul className="mt-1 flex flex-col gap-1">
                {insight.evidence.slice(1).map((e, i) => (
                  <li key={i} className="text-xs text-text-2">
                    <span className="font-mono text-[10px] uppercase text-text-3">{e.source}</span>{' '}
                    {e.label} — {e.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.actions.length > 0 && (
            <div className="mb-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                {t('home.brief.actions')}
              </div>
              <ul className="mt-1 flex flex-col gap-1.5">
                {insight.actions.map((a) => (
                  <ActionLine key={a.id} action={a} onChange={onChangeAction} />
                ))}
              </ul>
            </div>
          )}

          {insight.limitations.length > 0 && (
            <div className="mb-3 rounded border border-border/60 bg-card p-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                {t('home.brief.limitations')}
              </div>
              <ul className="mt-1 list-disc pl-4 text-xs text-text-3">
                {insight.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChangeInsight('resolved')}
              className="sa-btn !py-1 !text-[11px]"
            >
              {t('home.brief.markResolved')}
            </button>
            <button
              type="button"
              onClick={() => onChangeInsight('snoozed')}
              className="sa-btn !py-1 !text-[11px]"
            >
              {t('home.brief.snooze')}
            </button>
            <button
              type="button"
              onClick={() => onChangeInsight('dismissed')}
              className="sa-btn !py-1 !text-[11px] opacity-70"
            >
              {t('home.brief.dismiss')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function ActionLine({
  action,
  onChange,
}: {
  action: ActionCard
  onChange: (id: string, s: ActionStatus) => void
}) {
  const t = useT()
  const isDone = action.status === 'done'
  const isProposed = action.status === 'proposed'
  // Brief V2 §3.4 : sur les tâches proposées, l'user CURE (Valider/Écarter).
  // Sur les tâches validées (todo), il marque comme fait avec une checkbox.
  return (
    <li className="flex items-start gap-2 text-xs">
      {isProposed ? (
        <span
          className="mt-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-brand-cyan/40 text-[8px] text-brand-cyan"
          aria-hidden="true"
        >
          ?
        </span>
      ) : (
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onChange(action.id, isDone ? 'todo' : 'done')}
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-brand-blue"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className={isDone ? 'text-text-3 line-through' : 'text-text-1'}>{action.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-3">
          <span>
            {t('home.brief.impact')}: {action.impact}
          </span>
          <span>·</span>
          <span>
            {t('home.brief.effort')}: {action.effort}
          </span>
          <span>·</span>
          <span>
            {t('home.brief.priority')}: {action.priority}
          </span>
        </div>
        {isProposed && (
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => onChange(action.id, 'todo')}
              className="sa-btn sa-btn-primary !py-0.5 !text-[10px]"
            >
              {t('home.brief.task.validate')}
            </button>
            <button
              type="button"
              onClick={() => onChange(action.id, 'archived')}
              className="sa-btn !py-0.5 !text-[10px] opacity-70"
            >
              {t('home.brief.task.archive')}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
