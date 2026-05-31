import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import Brand from './Brand'
import ChatWidget from './ChatWidget'
import LocaleSwitcher from './LocaleSwitcher'
import { useAuth } from '@/lib/auth'
import { type StringKey, useT } from '@/lib/i18n'

type NavItem = { to: string; labelKey: StringKey; icon: string; soon?: boolean }

// Nav latérale "platform-level". L'IA assistant n'est pas ici — elle est
// accessible partout via le widget chat flottant (cf ChatWidget en bas).
// L'audit n'est pas dans la nav non plus : c'est une action contextuelle
// déclenchée depuis la page Smart tag ("Audit this site") ou via URL
// directe /audit.
const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: '◧' },
  { to: '/live', labelKey: 'nav.live', icon: '◉' },
  { to: '/connectors', labelKey: 'nav.connectors', icon: '◴' },
  { to: '/reports', labelKey: 'nav.reports', icon: '▤', soon: true },
  { to: '/files', labelKey: 'nav.files', icon: '◫', soon: true },
  { to: '/settings', labelKey: 'nav.settings', icon: '◴' },
]

export default function AppLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth()
  const t = useT()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Ferme automatiquement le drawer mobile dès qu'on change de route
  // (cas où on navigue via une URL directe, pas via un clic NavLink).
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Bloque le scroll body quand le drawer est ouvert (sinon on peut
  // scroller derrière le backdrop, frustrant en UX mobile).
  useEffect(() => {
    if (!mobileNavOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileNavOpen])

  // Échap ferme le drawer
  useEffect(() => {
    if (!mobileNavOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mobileNavOpen])

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop — masquée sur mobile, remplacée par le drawer. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <SidebarContent />
      </aside>

      <main className="flex min-h-screen flex-1 flex-col">
        {/* Header mobile : burger + brand + actions. */}
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label={t('nav.openMenu')}
            aria-expanded={mobileNavOpen}
            className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-1 hover:bg-card"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Brand />
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <button
              type="button"
              onClick={() => void logout()}
              className="sa-btn !py-1 !text-xs"
            >
              {t('common.signOut')}
            </button>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </main>

      {/* Drawer mobile : overlay full-screen avec sidebar slide-in. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.menu')}
        >
          {/* Backdrop — click-to-close */}
          <div
            className="absolute inset-0 bg-bg-0/80 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          {/* Panel */}
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label={t('nav.closeMenu')}
                className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-text-3 hover:bg-bg-1 hover:text-text-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <SidebarContent onItemClick={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* Assistant IA flottant, accessible partout dans l'app authentifiée. */}
      <ChatWidget />
    </div>
  )
}

// ─── Sidebar content (réutilisé desktop + mobile drawer) ─────────────────

function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const { state, logout } = useAuth()
  const t = useT()
  const workspace = state.workspaces[0]
  const initials = (state.user?.full_name ?? state.user?.email ?? '?')
    .split(/\s+|@/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      {/* Brand visible côté desktop ; côté mobile c'est le header du drawer
          qui le porte (avec le bouton close), donc on l'omet ici pour ne
          pas le dupliquer. */}
      {!onItemClick && (
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
      )}

      <div className="px-5 pb-3 pt-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
          {t('nav.workspace')}
        </div>
        <div className="mt-1 truncate font-head text-sm font-semibold text-text-1">
          {workspace?.name ?? t('nav.noWorkspace')}
        </div>
      </div>

      <nav className="mt-2 flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onItemClick}
            className={({ isActive }) =>
              [
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-brand-blue-dim text-text-1'
                  : 'text-text-2 hover:bg-card hover:text-text-1',
                item.soon ? 'pointer-events-none opacity-50' : '',
              ].join(' ')
            }
          >
            <span className="font-mono text-base text-text-3 group-hover:text-text-2">
              {item.icon}
            </span>
            <span className="flex-1">{t(item.labelKey)}</span>
            {item.soon && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-text-3">
                {t('nav.soon')}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue to-brand-cyan font-head text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-text-1">
              {state.user?.full_name ?? t('common.you')}
            </div>
            <div className="truncate font-mono text-[11px] text-text-3">
              {state.user?.email}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void logout()}
            className="sa-btn flex-1 !py-1.5 !text-xs"
          >
            {t('common.signOut')}
          </button>
          <LocaleSwitcher align="left" />
        </div>
      </div>
    </>
  )
}
