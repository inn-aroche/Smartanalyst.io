// GlobalSearch — recherche cross-entity + command palette (cahier §3 Lot 2 + 4).
//
// Ouverture par Cmd+K (Ctrl+K sous Linux/Windows) OU clic sur un bouton
// dans la sidebar/topbar. Modal centrée, input focus auto, debounce 250ms
// pour ne pas saturer l'API au typing.
//
// 5 buckets de résultats :
//   - Navigation (#aller vers chat, audit, sources…) — toujours visibles
//   - Actions (#créer veille, générer rapport, ouvrir billing) — toujours visibles
//   - Conversations · Insights · Rapports (data-driven, après 2 chars)
// Les buckets navigation+actions sont filtrés par fuzzy match sur le label
// pour rester réactifs même sans backend (effet "Linear-like").

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT, type StringKey } from '@/lib/i18n'

// Eventname declenche depuis un autre composant pour pre-remplir l'input ET
// ouvrir la palette. Utile depuis l'app shell pour exposer des shortcuts
// (ex: "Inviter un membre" depuis le menu principal).
export const PALETTE_PREFILL_EVENT = 'sa-palette:prefill'
export function openPaletteWith(prefill: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PALETTE_PREFILL_EVENT, { detail: prefill }))
}

// Evenement custom branche dans Veille/Reports/Settings : signale a la
// command palette qu'une action a ete demandee. Le composant cible decide
// quoi en faire (ouvrir un modal, scroller, etc.).
export const ACTION_EVENT = 'sa-palette:action'
export type PaletteAction = 'create-watch' | 'create-report' | 'open-billing' | 'invite-member'
export function dispatchPaletteAction(action: PaletteAction): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: action }))
}

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

  function doAction(action: PaletteAction, navigateTo?: string) {
    setOpen(false)
    if (navigateTo) navigate(navigateTo)
    // Le composant cible se branche via window.addEventListener(ACTION_EVENT).
    // On laisse 80ms pour que la nav s'effectue avant le dispatch (le listener
    // est souvent monte par la page cible).
    setTimeout(() => dispatchPaletteAction(action), 80)
  }

  // Definitions statiques des entrees navigation+actions. Filtrees par query
  // pour rester reactif sans hit backend.
  const navItems = useMemo(
    () => [
      { key: 'palette.go.chat' as StringKey, to: '/chat', icon: '💬' },
      { key: 'palette.go.audit' as StringKey, to: '/audit', icon: '📊' },
      { key: 'palette.go.veille' as StringKey, to: '/veille', icon: '👁' },
      { key: 'palette.go.tasks' as StringKey, to: '/tasks', icon: '✓' },
      { key: 'palette.go.reports' as StringKey, to: '/rapports', icon: '📑' },
      { key: 'palette.go.sources' as StringKey, to: '/sources', icon: '🔌' },
      { key: 'palette.go.live' as StringKey, to: '/live', icon: '⚡' },
      { key: 'palette.go.settings' as StringKey, to: '/settings', icon: '⚙' },
    ],
    [],
  )
  const actionItems = useMemo(
    () => [
      {
        key: 'palette.action.newWatch' as StringKey,
        action: 'create-watch' as PaletteAction,
        to: '/veille',
        icon: '➕',
      },
      {
        key: 'palette.action.newReport' as StringKey,
        action: 'create-report' as PaletteAction,
        to: '/rapports',
        icon: '📝',
      },
      {
        key: 'palette.action.openBilling' as StringKey,
        action: 'open-billing' as PaletteAction,
        to: '/settings',
        icon: '💳',
      },
      {
        key: 'palette.action.inviteMember' as StringKey,
        action: 'invite-member' as PaletteAction,
        to: '/settings',
        icon: '👥',
      },
    ],
    [],
  )

  const q2 = q.trim().toLowerCase()
  const filteredNav =
    q2.length === 0 ? navItems : navItems.filter((i) => t(i.key).toLowerCase().includes(q2))
  const filteredActions =
    q2.length === 0 ? actionItems : actionItems.filter((i) => t(i.key).toLowerCase().includes(q2))

  // Liste plate de tous les items visibles, dans l'ordre de rendu — support
  // de la navigation clavier (flèches + Entrée) attendue d'une palette.
  type FlatItem = {
    id: string
    section: 'go' | 'actions' | 'conversations' | 'insights' | 'reports'
    title: string
    subtitle?: string
    icon?: string
    run: () => void
  }
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = []
    for (const i of filteredNav) {
      items.push({
        id: `nav:${i.key}`,
        section: 'go',
        title: t(i.key),
        icon: i.icon,
        run: () => go(i.to),
      })
    }
    for (const i of filteredActions) {
      items.push({
        id: `act:${i.key}`,
        section: 'actions',
        title: t(i.key),
        icon: i.icon,
        run: () => doAction(i.action, i.to),
      })
    }
    if (debouncedQ.length >= 2 && results.data) {
      for (const c of results.data.conversations) {
        items.push({
          id: `conv:${c.id}`,
          section: 'conversations',
          title: c.title || t('search.untitled'),
          run: () => go(`/chat?conv=${c.id}`),
        })
      }
      for (const i of results.data.insights) {
        items.push({
          id: `ins:${i.id}`,
          section: 'insights',
          title: i.title,
          subtitle: i.summary,
          run: () => go(`/veille?insight=${i.id}`),
        })
      }
      for (const r of results.data.reports) {
        items.push({
          id: `rep:${r.id}`,
          section: 'reports',
          title: r.title || t('search.untitled'),
          run: () => go(`/rapports?id=${r.id}`),
        })
      }
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNav, filteredActions, results.data, debouncedQ, t])

  // Sélection clavier — reset quand la liste change (nouvelle query).
  const [sel, setSel] = useState(0)
  useEffect(() => {
    setSel(0)
  }, [q, results.data])

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((v) => Math.min(v + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((v) => Math.max(v - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flatItems[sel]?.run()
    }
  }

  if (!open) return null
  const hasDataResults =
    (results.data?.conversations.length || 0) +
      (results.data?.insights.length || 0) +
      (results.data?.reports.length || 0) >
    0
  const hasNavOrActions = filteredNav.length > 0 || filteredActions.length > 0

  // Index global de chaque item pour le highlight — rendu par section.
  const indexOf = (id: string) => flatItems.findIndex((it) => it.id === id)
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
            onKeyDown={onInputKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 border-none bg-transparent text-base text-text-1 outline-none placeholder:text-text-3"
            aria-label={t('search.placeholder')}
          />
          <kbd className="hidden rounded border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-text-3 md:inline-block">
            esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          <div className="flex flex-col gap-2 px-2 py-2">
            {filteredNav.length > 0 && (
              <Section title={t('palette.section.go')}>
                {filteredNav.map((i) => (
                  <ResultRow
                    key={i.key}
                    title={t(i.key)}
                    icon={i.icon}
                    active={indexOf(`nav:${i.key}`) === sel}
                    onClick={() => go(i.to)}
                  />
                ))}
              </Section>
            )}
            {filteredActions.length > 0 && (
              <Section title={t('palette.section.actions')}>
                {filteredActions.map((i) => (
                  <ResultRow
                    key={i.key}
                    title={t(i.key)}
                    icon={i.icon}
                    active={indexOf(`act:${i.key}`) === sel}
                    onClick={() => doAction(i.action, i.to)}
                  />
                ))}
              </Section>
            )}

            {debouncedQ.length >= 2 &&
              (results.isLoading ? (
                <div className="px-4 py-3 text-center text-sm text-text-3">
                  {t('search.loading')}
                </div>
              ) : results.isError ? (
                <div className="px-4 py-3 text-center text-sm text-brand-red">
                  {t('search.loadError')}
                </div>
              ) : hasDataResults ? (
                <>
                  {(results.data?.conversations.length || 0) > 0 && (
                    <Section title={t('search.section.conversations')}>
                      {results.data!.conversations.map((c) => (
                        <ResultRow
                          key={c.id}
                          title={c.title || t('search.untitled')}
                          active={indexOf(`conv:${c.id}`) === sel}
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
                          active={indexOf(`ins:${i.id}`) === sel}
                          onClick={() => go(`/veille?insight=${i.id}`)}
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
                          active={indexOf(`rep:${r.id}`) === sel}
                          onClick={() => go(`/rapports?id=${r.id}`)}
                        />
                      ))}
                    </Section>
                  )}
                </>
              ) : (
                !hasNavOrActions && (
                  <div className="px-4 py-6 text-center text-sm text-text-3">
                    {t('search.noResults')}
                  </div>
                )
              ))}

            {debouncedQ.length < 2 && !hasNavOrActions && (
              <div className="px-4 py-6 text-center text-sm text-text-3">{t('search.hint')}</div>
            )}
          </div>
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
  icon,
  active = false,
  onClick,
}: {
  title: string
  subtitle?: string
  icon?: string
  active?: boolean
  onClick: () => void
}) {
  // Garde l'item sélectionné au clavier visible pendant le scroll.
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <li ref={ref} aria-selected={active}>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors hover:bg-card-hover ${
          active ? 'bg-card-hover ring-1 ring-inset ring-border' : ''
        }`}
      >
        {icon && (
          <span aria-hidden="true" className="text-base leading-none">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-1">{title}</div>
          {subtitle && (
            <div className="mt-0.5 line-clamp-1 text-[12.5px] text-text-2">{subtitle}</div>
          )}
        </div>
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
