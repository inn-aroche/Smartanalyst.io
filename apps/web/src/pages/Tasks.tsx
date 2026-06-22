import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import type { ActionCard, ActionStatus } from '@/lib/insights-types'
import { track } from '@/lib/tracking'
import { useEscapeKey } from '@/lib/use-escape-key'

// Page Tâches dédiée (brief V2 §3.4). Trois colonnes : Inbox (proposed),
// Aujourd'hui (todo), Faites (done). Drag-and-drop pas implémenté en V1 —
// boutons explicites suffisent (mobile-friendly, accessible).

const COLUMNS: { key: 'inbox' | 'today' | 'done'; status: ActionStatus; titleKey: string }[] = [
  { key: 'inbox', status: 'proposed', titleKey: 'tasks.col.inbox' },
  { key: 'today', status: 'todo', titleKey: 'tasks.col.today' },
  { key: 'done', status: 'done', titleKey: 'tasks.col.done' },
]

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'text-brand-red',
  high: 'text-brand-red',
  medium: 'text-brand-cyan',
  low: 'text-text-3',
}

export default function TasksPage() {
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id ?? ''
  const queryClient = useQueryClient()
  const [emailFor, setEmailFor] = useState<ActionCard | null>(null)

  // Une seule query qui ramène l'actif (inbox+today+done récents, on filtre côté UI)
  const q = useQuery({
    queryKey: ['actions', 'all', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ actions: ActionCard[] }>(
        `/api/v1/insights/actions?workspaceId=${workspaceId}&status=all`,
      ),
    staleTime: 30_000,
  })

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ActionStatus }) =>
      apiFetch(`/api/v1/insights/actions/${id}`, {
        method: 'PATCH',
        body: { workspaceId, status },
      }),
    onSuccess: (_data, variables) => {
      // Events §6 — boucle d'engagement. proposed→todo = "accepted",
      // *→done = "completed".
      if (variables.status === 'todo') {
        track('task_accepted', { task_id: variables.id })
      } else if (variables.status === 'done') {
        track('task_completed', { task_id: variables.id })
      }
      void queryClient.invalidateQueries({ queryKey: ['actions'] })
    },
  })

  const actions = q.data?.actions ?? []
  const byCol: Record<'inbox' | 'today' | 'done', ActionCard[]> = {
    inbox: actions.filter((a) => a.status === 'proposed'),
    today: actions.filter((a) => a.status === 'todo' || a.status === 'in_progress'),
    done: actions.filter((a) => a.status === 'done'),
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
            {t('tasks.kicker')}
          </span>
          <h1 className="mt-2 font-head text-3xl font-bold text-text-1">{t('tasks.title')}</h1>
          <p className="mt-2 text-text-2">{t('tasks.subtitle')}</p>
        </div>

        {q.isError && (
          <div className="sa-card mb-4 border-brand-red/30 bg-brand-red/10 text-sm text-brand-red">
            {t('tasks.loadError')}
          </div>
        )}

        {!q.isLoading && actions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                title={t(col.titleKey as 'tasks.col.inbox')}
                count={byCol[col.key].length}
                isLoading={q.isLoading}
              >
                {byCol[col.key].length === 0 ? (
                  <ColumnEmpty colKey={col.key} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {byCol[col.key].map((a: ActionCard) => (
                      <TaskCard
                        key={a.id}
                        task={a}
                        onValidate={() => setStatus.mutate({ id: a.id, status: 'todo' })}
                        onArchive={() => setStatus.mutate({ id: a.id, status: 'archived' })}
                        onDone={() => setStatus.mutate({ id: a.id, status: 'done' })}
                        onReopen={() => setStatus.mutate({ id: a.id, status: 'todo' })}
                        onEmail={() => setEmailFor(a)}
                      />
                    ))}
                  </ul>
                )}
              </Column>
            ))}
          </div>
        )}

        {emailFor && (
          <EmailBriefModal
            task={emailFor}
            workspaceId={workspaceId}
            onClose={() => setEmailFor(null)}
          />
        )}
      </div>
    </AppLayout>
  )
}

function Column({
  title,
  count,
  isLoading,
  children,
}: {
  title: string
  count: number
  isLoading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="sa-card flex flex-col">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-head text-sm font-semibold uppercase tracking-widest text-text-3">
          {title}
        </h2>
        <span className="font-mono text-[10px] text-text-3">{count}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-bg-2" />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

function ColumnEmpty({ colKey }: { colKey: string }) {
  const t = useT()
  const key = `tasks.empty.${colKey}` as const as 'tasks.empty.inbox'
  return <p className="text-xs text-text-3">{t(key)}</p>
}

function TaskCard({
  task,
  onValidate,
  onArchive,
  onDone,
  onReopen,
  onEmail,
}: {
  task: ActionCard
  onValidate: () => void
  onArchive: () => void
  onDone: () => void
  onReopen: () => void
  onEmail: () => void
}) {
  const t = useT()
  const isProposed = task.status === 'proposed'
  const isDone = task.status === 'done'
  return (
    <li className="rounded-lg border border-border bg-bg-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`min-w-0 flex-1 text-sm font-semibold ${isDone ? 'text-text-3 line-through' : 'text-text-1'}`}
        >
          {task.title}
        </h3>
        <span
          className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${PRIORITY_COLOR[task.priority] ?? 'text-text-3'}`}
        >
          {task.priority}
        </span>
      </div>
      {task.description && !isDone && (
        <p className="mt-1 line-clamp-2 text-xs text-text-2">{task.description}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-3">
        <span>I: {task.impact}</span>
        <span>·</span>
        <span>E: {task.effort}</span>
        <span>·</span>
        <span>C: {task.confidence}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {isProposed && (
          <>
            <button onClick={onValidate} className="sa-btn sa-btn-primary !py-1 !text-[11px]">
              {t('tasks.action.validate')}
            </button>
            <button onClick={onArchive} className="sa-btn !py-1 !text-[11px] opacity-70">
              {t('tasks.action.archive')}
            </button>
          </>
        )}
        {task.status === 'todo' && (
          <>
            <button onClick={onDone} className="sa-btn sa-btn-primary !py-1 !text-[11px]">
              {t('tasks.action.markDone')}
            </button>
            <button onClick={onArchive} className="sa-btn !py-1 !text-[11px] opacity-70">
              {t('tasks.action.archive')}
            </button>
            <button onClick={onEmail} className="sa-btn !py-1 !text-[11px]">
              {t('tasks.action.emailBrief')}
            </button>
          </>
        )}
        {isDone && (
          <button onClick={onReopen} className="sa-btn !py-1 !text-[11px] opacity-70">
            {t('tasks.action.reopen')}
          </button>
        )}
      </div>
    </li>
  )
}

function EmptyState() {
  const t = useT()
  return (
    <div className="sa-card text-center">
      <p className="text-sm text-text-2">{t('tasks.emptyAll.body')}</p>
      <Link to="/connectors" className="sa-btn sa-btn-primary mt-3 !py-1.5 !text-xs">
        {t('tasks.emptyAll.cta')}
      </Link>
    </div>
  )
}

function EmailBriefModal({
  task,
  workspaceId,
  onClose,
}: {
  task: ActionCard
  workspaceId: string
  onClose: () => void
}) {
  const t = useT()
  useEscapeKey(onClose)
  const [recipient, setRecipient] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function send() {
    setError(null)
    setSending(true)
    try {
      await apiFetch(`/api/v1/insights/actions/${task.id}/email-brief`, {
        method: 'POST',
        body: { workspaceId, recipient, note: note || undefined },
      })
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('tasks.emailModal.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div className="sa-card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-head text-lg font-semibold text-text-1">
          {t('tasks.emailModal.title')}
        </h3>
        <p className="mt-1 truncate text-sm text-text-2">{task.title}</p>

        {done ? (
          <p className="mt-4 rounded border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-sm text-brand-green">
            {t('tasks.emailModal.sent')}
          </p>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <div>
                <label className="sa-label">{t('tasks.emailModal.recipient')}</label>
                <input
                  className="sa-input"
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="alice@team.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="sa-label">{t('tasks.emailModal.note')}</label>
                <textarea
                  className="sa-input"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={600}
                  placeholder={t('tasks.emailModal.notePlaceholder')}
                />
              </div>
            </div>
            {error && <div className="mt-2 text-xs text-brand-red">{error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="sa-btn !py-1.5 !text-xs">
                {t('tasks.emailModal.cancel')}
              </button>
              <button
                onClick={() => void send()}
                disabled={sending || !recipient}
                className="sa-btn sa-btn-primary !py-1.5 !text-xs disabled:opacity-50"
              >
                {sending ? t('tasks.emailModal.sending') : t('tasks.emailModal.send')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
