// GlobalSearch — recherche cross-entity (cahier §3 Lot 2).
//
// Ouverture par Cmd+K (Ctrl+K sous Linux/Windows) OU clic sur un bouton
// dans la sidebar/topbar. Modal centrée, input focus auto, debounce 250ms
// pour ne pas saturer l'API au typing.
//
// 3 buckets de résultats : Conversations · Insights · Rapports. Chaque
// résultat est cliquable vers la route correspondante.

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

type SearchResults = {
  conversations: Array<{ id: string; title: string; updated_at: string }>
  insights: Array<{
    id: string
    title: string
    summary: string
    severity: string
    status: string
    created_at: string
  }>
  reports: Array<{
    id: string
    title: string
    kind: string
    period_start: string
    period_end: string
    created_at: string
  }>
}

export const SEARCH_OPEN_EVENT = 'sa-search:open'

export function openGlobalSearch(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT))
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // Debounced query — n'envoie à l'API qu'après 250ms de stabilité.
  const [debouncedQ, setDebouncedQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id

  // Raccourci Cmd+K / Ctrl+K — convention universelle (Linear, Notion, GitHub).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(SEARCH_OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(SEARCH_OPEN_EVENT, onOpen)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      // Focus input à l'ouverture pour pouvoir taper direct.
      setTimeout(() => inputRef.current?.focus(), 30)
    } else {
      setQ('')
      setDebouncedQ('')
    }
  }, [open])

  useEffect(() => {
    const tm = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(tm)
  }, [q])

  const results = useQuery({
    queryKey: ['search', workspaceId, debouncedQ],
    enabled: Boolean(workspaceId) && debouncedQ.length >= 2 && open,
    queryFn: () =>
      apiFetch<SearchResults>(
        `/api/v1/search?workspaceId=${workspaceId}&q=${encodeURIComponent(debouncedQ)}`,
      ),
    staleTime: 10_000,
  })

  function go(to: string) {
    setOpen(false)
    navigate(to)
  }

  if (!open) return null
  const hasAny =
    (results.data?.conversations.length || 0) +
      (results.data?.insights.length || 0) +
      (results.data?.reports.length || 0) >
    0
  return (
    <div
      className="fixed inset-0 z-[2200] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label={t('search.aria')}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[14px] border border-border bg-card shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="flex-1 border-none bg-transparent text-base text-text-1 outline-none placeholder:text-text-3"
            aria-label={t('search.placeholder')}
          />
          <kbd className="hidden rounded border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-text-3 md:inline-block">
            esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {debouncedQ.length < 2 ? (
            <div className="px-4 py-10 text-center text-sm text-text-3">{t('search.hint')}</div>
          ) : results.isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-text-3">{t('search.loading')}</div>
          ) : results.isError ? (
            <div className="px-4 py-6 text-center text-sm text-brand-red">
              {t('search.loadError')}
            </div>
          ) : !hasAny ? (
            <div className="px-4 py-10 text-center text-sm text-text-3">
              {t('search.noResults')}
            </div>
          ) : (
            <div className="flex flex-col gap-2 px-2 py-2">
              {(results.data?.conversations.length || 0) > 0 && (
                <Section title={t('search.section.conversations')}>
                  {results.data!.conversations.map((c) => (
                    <ResultRow
                      key={c.id}
                      title={c.title || t('search.untitled')}
                      onClick={() => go(`/chat?conv=${c.id}`)}
                    />
                  ))}
                </Section>
              )}
              {(results.data?.insights.length || 0) > 0 && (
                <Section title={t('search.section.insights')}>
                  {results.data!.insights.map((i) => (
                    <ResultRow
                      key={i.id}
                      title={i.title}
                      subtitle={i.summary}
                      onClick={() => go(`/veille`)}
                    />
                  ))}
                </Section>
              )}
              {(results.data?.reports.length || 0) > 0 && (
                <Section title={t('search.section.reports')}>
                  {results.data!.reports.map((r) => (
                    <ResultRow
                      key={r.id}
                      title={r.title || t('search.untitled')}
                      onClick={() => go(`/reports?id=${r.id}`)}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-text-3">
        {title}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </div>
  )
}

function ResultRow({
  title,
  subtitle,
  onClick,
}: {
  title: string
  subtitle?: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded px-3 py-2 text-left transition-colors hover:bg-card-hover"
      >
        <div className="truncate text-sm font-medium text-text-1">{title}</div>
        {subtitle && (
          <div className="mt-0.5 line-clamp-1 text-[12.5px] text-text-2">{subtitle}</div>
        )}
      </button>
    </li>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="text-text-3">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line
        x1="10.5"
        y1="10.5"
        x2="14"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Helper rétro-compat pour Link (non utilisé actuellement, mais utile à
// l'évolution future si on veut ouvrir certains résultats en nouvelle vue
// vs navigate).
export { Link }
