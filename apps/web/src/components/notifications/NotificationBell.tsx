// NotificationBell — cloche topbar + badge non-lus + dropdown (cahier §3 Lot 1).
//
// Le seul vrai levier de retour utilisateur du produit. Sans ça, BriefHome
// est l'unique surface qui dit "il s'est passé quelque chose" — et l'user
// doit l'ouvrir pour le voir. La cloche apporte le push.
//
// Polling court (60s) plutôt que websocket : suffisant pour un produit
// d'analytics où le rythme métier est lent (insights = quelques par jour).

import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'

type NotifSeverity = 'info' | 'warning' | 'critical'
type NotifType =
  | 'insight_created'
  | 'watch_triggered'
  | 'connector_health'
  | 'digest_ready'
  | 'task_proposed'
  | 'system'

type Notif = {
  id: string
  type: NotifType
  severity: NotifSeverity
  title: string
  body: string | null
  link: string | null
  meta: Record<string, unknown>
  created_at: string
  read_at: string | null
}

const POLL_MS = 60_000

export default function NotificationBell() {
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id
  const t = useT()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Badge non-lus — poll discret. Désactivé quand pas de workspace.
  const countQ = useQuery({
    queryKey: ['notifications', 'unread', workspaceId],
    enabled: Boolean(workspaceId),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: () =>
      apiFetch<{ count: number }>(`/api/v1/notifications/unread-count?workspaceId=${workspaceId}`),
    staleTime: POLL_MS / 2,
  })
  const unread = countQ.data?.count || 0

  // Liste — chargée seulement quand la dropdown s'ouvre.
  const listQ = useQuery({
    queryKey: ['notifications', 'list', workspaceId],
    enabled: Boolean(workspaceId) && open,
    queryFn: () =>
      apiFetch<{ notifications: Notif[] }>(
        `/api/v1/notifications?workspaceId=${workspaceId}&limit=20`,
      ),
    staleTime: 10_000,
  })

  const markOne = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/notifications/${id}/read`, {
        method: 'POST',
        body: { workspaceId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  const markAll = useMutation({
    mutationFn: () =>
      apiFetch<{ marked: number }>('/api/v1/notifications/mark-all-read', {
        method: 'POST',
        body: { workspaceId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Fermeture sur clic extérieur (pattern classique). Évite d'avoir à
  // mounter un overlay full-screen.
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function handleClickItem(n: Notif) {
    // Event §6 : notification_clicked. workspace_id ajouté par tracking lib.
    track('notification_clicked', { type: n.type, severity: n.severity, notif_id: n.id })
    if (!n.read_at) markOne.mutate(n.id)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-border bg-card text-text-2 hover:bg-card-hover"
        aria-label={t('notif.aria.bell')}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-label={t('notif.aria.unread', { count: String(unread) })}
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-brand-red px-1 font-mono text-[10px] font-bold text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notif.aria.panel')}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[12px] border border-border bg-card shadow-card"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="font-head text-sm font-bold text-text-1">{t('notif.title')}</div>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
              className="font-mono text-[11px] uppercase tracking-widest text-text-3 hover:text-text-1 disabled:opacity-40"
            >
              {t('notif.markAll')}
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {listQ.isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-text-3">{t('notif.loading')}</div>
            ) : listQ.isError ? (
              <div className="px-4 py-6 text-center text-sm text-brand-red">
                {t('notif.loadError')}
              </div>
            ) : (listQ.data?.notifications.length ?? 0) === 0 ? (
              <EmptyState />
            ) : (
              <ul className="flex flex-col">
                {listQ.data!.notifications.map((n) => (
                  <Fragment key={n.id}>
                    <NotifRow notif={n} onClick={() => handleClickItem(n)} />
                  </Fragment>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotifRow({ notif, onClick }: { notif: Notif; onClick: () => void }) {
  const dot =
    notif.severity === 'critical'
      ? 'bg-brand-red'
      : notif.severity === 'warning'
        ? 'bg-brand-amber'
        : 'bg-brand-blue-deep'
  const time = formatRelative(notif.created_at)
  const content = (
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-card-hover">
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div
          className={[
            'truncate text-sm leading-snug',
            notif.read_at ? 'font-normal text-text-2' : 'font-semibold text-text-1',
          ].join(' ')}
        >
          {notif.title}
        </div>
        {notif.body && (
          <div className="mt-0.5 line-clamp-2 text-[13px] text-text-2">{notif.body}</div>
        )}
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-text-3">
          {time}
        </div>
      </div>
    </div>
  )
  if (notif.link) {
    return (
      <li className="border-b border-border last:border-b-0">
        <Link to={notif.link} onClick={onClick} className="block">
          {content}
        </Link>
      </li>
    )
  }
  return (
    <li className="border-b border-border last:border-b-0">
      <button type="button" onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    </li>
  )
}

function EmptyState() {
  const t = useT()
  return (
    <div className="px-4 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-3 text-text-3">
        <BellIcon />
      </div>
      <div className="text-sm text-text-2">{t('notif.empty.title')}</div>
      <div className="mt-1 text-[12.5px] text-text-3">{t('notif.empty.body')}</div>
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 7a4 4 0 0 1 8 0v3l1 2H3l1-2V7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 13a1.5 1.5 0 0 0 3 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.round((now - then) / 1000)
  if (sec < 60) return 'now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString()
}
