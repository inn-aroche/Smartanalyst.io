import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import ChatWidget from './ChatWidget'
import LocaleSwitcher from './LocaleSwitcher'
import QuotaChip from '@/components/billing/QuotaChip'
import ActivationProgress from '@/components/onboarding/ActivationProgress'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openGlobalSearch } from '@/components/GlobalSearch'
import NotificationBell from '@/components/notifications/NotificationBell'
import { type StringKey, useT } from '@/lib/i18n'

// Nav alignée App v2 (handoff Claude Design — direction "Le Brief").
// 6 items : home / chat / veille / taches / rapports / sources.
// Les badges sont passés par chaque page consommatrice via le context (non
// implémenté ici pour rester lean — surface prête).
type NavItem = {
  to: string
  labelKey: StringKey
  icon: string
  soon?: boolean
  badgeKey?: 'tasks' | 'insights'
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: '◐' },
  { to: '/chat', labelKey: 'nav.assistant', icon: '✦' },
  { to: '/veille', labelKey: 'nav.veille', icon: '◎', badgeKey: 'insights' },
  { to: '/tasks', labelKey: 'nav.todo', icon: '✓', badgeKey: 'tasks' },
  { to: '/rapports', labelKey: 'nav.reports', icon: '▤' },
  { to: '/sources', labelKey: 'nav.sources', icon: '◈' },
  { to: '/settings', labelKey: 'nav.settings', icon: '⚙' },
  { to: '/help', labelKey: 'nav.help', icon: '?' },
]

// ─── Toast context ────────────────────────────────────────────────────────
// Surface globale pour les confirmations courtes ("Ajouté à tes tâches",
// "Alerte créée"). Pattern App v2 : bandeau sombre centré en bas, auto-dismiss.

type ToastContext = { push: (msg: string) => void }
const ToastCtx = createContext<ToastContext | null>(null)
export function useToast(): ToastContext {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside AppLayout')
  return ctx
}

function ToastBar({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-7 left-1/2 z-[3000] -translate-x-1/2"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-text-1 px-5 py-3 text-sm font-medium text-white shadow-float">
        <span className="text-brand-cyan-bright">✓</span>
        {message}
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useT()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Persistance du collapsed state pour éviter le flash à la navigation.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sa.sidebar.collapsed') === '1'
  })
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => setMobileNavOpen(false), [location.pathname])

  useEffect(() => {
    try {
      localStorage.setItem('sa.sidebar.collapsed', collapsed ? '1' : '0')
    } catch {
      // localStorage indisponible — pas bloquant, on garde juste l'état mémoire.
    }
  }, [collapsed])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mobileNavOpen])

  const push = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2400)
  }, [])

  return (
    <ToastCtx.Provider value={{ push }}>
      <div className="flex h-screen w-screen overflow-hidden bg-bg-0">
        <aside
          className={[
            'relative hidden shrink-0 flex-col border-r border-border bg-bg-2 transition-[width] duration-200 md:flex',
            collapsed ? 'w-[68px]' : 'w-[230px]',
          ].join(' ')}
        >
          <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <SidebarContent collapsed={collapsed} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t('nav.openMenu')}
              aria-expanded={mobileNavOpen}
              className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-1 hover:bg-card-hover"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <BrandLockup compact />
            <div className="ml-auto">
              <LocaleSwitcher />
            </div>
          </header>
          {/* Bar d'activation (next-steps F) — sticky sous le header.
              Hide auto quand les 3 etapes sont faites OU dismiss user. */}
          <ActivationProgress />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </main>

        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.menu')}
          >
            <div
              className="absolute inset-0 bg-bg-0/80 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute left-0 top-0 flex h-full w-[260px] max-w-[85vw] flex-col border-r border-border bg-bg-2 shadow-float">
              <div className="flex h-14 items-center justify-between border-b border-border px-4">
                <BrandLockup />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label={t('nav.closeMenu')}
                  className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-text-3 hover:bg-bg-3 hover:text-text-1"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <SidebarContent collapsed={false} skipHeader />
            </aside>
          </div>
        )}

        <ChatWidget />
      </div>
      <ToastBar message={toast} />
    </ToastCtx.Provider>
  )
}

// ─── Topbar (réutilisable par les pages) ──────────────────────────────────

/**
 * Topbar pattern App v2 : titre + sous-titre mono (à gauche), actions
 * (chip + bell + bouton primaire) à droite. Les pages l'utilisent en haut
 * de leur contenu : <AppLayout><Topbar …/>…</AppLayout>.
 */
export function Topbar({
  title,
  subtitle,
  rightChip,
  primaryAction,
}: {
  title: string
  subtitle?: string
  rightChip?: ReactNode
  primaryAction?: { label: string; onClick: () => void } | null
}) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3.5">
      <div className="min-w-0">
        <h1 className="truncate font-head text-[17px] font-bold leading-tight tracking-[-0.01em] text-text-1">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-0.5 truncate font-mono text-[11px] text-text-3">{subtitle}</div>
        )}
      </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2.5">
        {rightChip}
        {/* Quota chip — visible des 50% pour rendre la limite tangible (cf.
            next-steps A). Hide tout seul si plan Pro/Agency (Infinity). */}
        <QuotaChip />
        <SearchButton />
        <NotificationBell />
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="sa-btn sa-btn-primary !text-xs"
          >
            + {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}

// Bouton Recherche topbar — déclenche l'ouverture du modal `GlobalSearch`.
// Le raccourci Cmd+K reste actif partout dans l'app (cf. GlobalSearch.tsx).
function SearchButton() {
  const t = useT()
  return (
    <button
      type="button"
      onClick={openGlobalSearch}
      aria-label={t('search.open.aria')}
      title={t('search.open.aria')}
      className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-border bg-card text-text-2 hover:bg-card-hover"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
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
    </button>
  )
}

// ─── Sidebar internals ────────────────────────────────────────────────────

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? t('nav.expand') : t('nav.collapse')}
      aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
      className="absolute -right-[13px] top-[18px] z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border bg-card text-text-2 shadow-card hover:text-text-1"
    >
      <span className="text-xs leading-none">{collapsed ? '›' : '‹'}</span>
    </button>
  )
}

function BrandLockup({ compact }: { compact?: boolean }) {
  const size = compact ? 28 : 34
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/brand/ascent-appicon-512.png"
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: size * 0.28 }}
        className="block flex-shrink-0 shadow-[0_2px_8px_rgba(61,107,224,0.26)]"
      />
      <div className="font-head text-[16px] font-bold leading-none tracking-[-0.02em] text-text-1">
        Smart<span className="font-semibold text-text-2">Analyst</span>
      </div>
    </div>
  )
}

function useSidebarBadges(workspaceId: string | undefined) {
  const insightsQ = useQuery({
    queryKey: ['insights', 'list', workspaceId, 'open'],
    enabled: !!workspaceId,
    queryFn: () =>
      apiFetch<{ insights: Array<{ id: string }> }>(
        `/api/v1/insights?workspaceId=${workspaceId}&status=open&limit=50`,
      ),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })
  const tasksQ = useQuery({
    queryKey: ['insights', 'actions', workspaceId, 'proposed'],
    enabled: !!workspaceId,
    queryFn: () =>
      apiFetch<{ actions: Array<{ id: string }> }>(
        `/api/v1/insights/actions?workspaceId=${workspaceId}&status=proposed&limit=50`,
      ),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })
  return {
    insights: insightsQ.data?.insights?.length ?? 0,
    tasks: tasksQ.data?.actions?.length ?? 0,
  }
}

function SidebarContent({ collapsed, skipHeader }: { collapsed: boolean; skipHeader?: boolean }) {
  const { state, logout } = useAuth()
  const t = useT()
  const workspace = state.workspaces[0]
  const badges = useSidebarBadges(workspace?.id)
  const initials = (state.user?.full_name ?? state.user?.email ?? '?')
    .split(/\s+|@/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      {!skipHeader && (
        <div
          className={[
            'flex flex-col border-b border-border',
            collapsed ? 'items-center px-0 py-4' : 'px-4 pb-3.5 pt-4',
          ].join(' ')}
        >
          {collapsed ? (
            <img
              src="/brand/ascent-appicon-512.png"
              alt=""
              width={32}
              height={32}
              style={{ borderRadius: 10 }}
              className="block flex-shrink-0"
            />
          ) : (
            <BrandLockup />
          )}
          {!collapsed && workspace && (
            <button
              type="button"
              className="mt-3.5 flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-border-bright"
            >
              <span className="block h-[22px] w-[22px] flex-shrink-0 rounded-md bg-brand-grad" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold leading-tight text-text-1">
                  {workspace.name}
                </span>
                <span className="block font-mono text-[9.5px] text-text-3">
                  {t('nav.yourBusiness')}
                </span>
              </span>
              <span className="text-[11px] text-text-3">▾</span>
            </button>
          )}
        </div>
      )}

      <nav
        className={[
          'flex-1 overflow-y-auto overflow-x-hidden',
          collapsed ? 'px-2.5 py-3.5' : 'px-3 py-3.5',
        ].join(' ')}
      >
        {!collapsed && <div className="sa-eyebrow px-2 pb-2">{t('nav.mySpace')}</div>}
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? t(item.labelKey) : undefined}
            className={({ isActive }) =>
              [
                'sa-nav relative mb-0.5 flex items-center rounded-[10px] text-[13.5px] transition-all',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-2.5 py-2.5',
                isActive
                  ? 'border border-border bg-card font-semibold text-text-1 shadow-card'
                  : 'border border-transparent font-medium text-text-2 hover:bg-bg-3 hover:text-text-1',
                item.soon ? 'opacity-60' : '',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={[
                    'w-4 flex-shrink-0 text-center text-[13px]',
                    isActive ? 'text-brand-blue-deep' : 'text-text-3',
                  ].join(' ')}
                >
                  {item.icon}
                </span>
                {!collapsed && <span className="flex-1 truncate">{t(item.labelKey)}</span>}
                {item.badgeKey &&
                  (badges[item.badgeKey] ?? 0) > 0 &&
                  (collapsed ? (
                    <span className="absolute right-1.5 top-1.5 h-[6px] w-[6px] rounded-full bg-brand-blue-deep" />
                  ) : (
                    <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-blue-deep/15 px-1 font-mono text-[10px] font-semibold text-brand-blue-deep">
                      {badges[item.badgeKey] > 99 ? '99+' : badges[item.badgeKey]}
                    </span>
                  ))}
                {item.soon &&
                  (collapsed ? (
                    <span className="absolute right-1.5 top-1.5 h-[6px] w-[6px] rounded-full bg-text-3" />
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-widest text-text-3">
                      {t('nav.soon')}
                    </span>
                  ))}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2.5">
            <div
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-grad text-[11px] font-bold text-white"
              title={state.user?.full_name ?? state.user?.email ?? ''}
            >
              {initials}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              title={t('common.signOut')}
              aria-label={t('common.signOut')}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-md text-text-3 hover:bg-bg-3 hover:text-text-1"
            >
              <span className="text-sm">↶</span>
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2.5 flex items-center gap-2.5 px-1">
              <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-brand-grad text-[11px] font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold leading-tight text-text-1">
                  {state.user?.full_name ?? t('common.you')}
                </div>
                <div className="truncate font-mono text-[10px] text-text-3">
                  {state.user?.email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void logout()}
                className="sa-btn flex-1 !py-1.5 !text-xs"
              >
                {t('common.signOut')}
              </button>
              <LocaleSwitcher align="left" />
            </div>
          </>
        )}
      </div>
    </>
  )
}
