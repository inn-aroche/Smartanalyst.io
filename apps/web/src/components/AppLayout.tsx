import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import Brand from './Brand'
import LocaleSwitcher from './LocaleSwitcher'
import { useAuth } from '@/lib/auth'
import { type StringKey, useT } from '@/lib/i18n'

type NavItem = { to: string; labelKey: StringKey; icon: string; soon?: boolean }

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: '◧' },
  { to: '/connectors', labelKey: 'nav.connectors', icon: '◴' },
  { to: '/chat', labelKey: 'nav.chat', icon: '◑' },
  { to: '/reports', labelKey: 'nav.reports', icon: '▤', soon: true },
  { to: '/files', labelKey: 'nav.files', icon: '◫', soon: true },
  { to: '/settings', labelKey: 'nav.settings', icon: '◴' },
]

export default function AppLayout({ children }: { children: ReactNode }) {
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
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>

        <div className="px-5 pb-3">
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
      </aside>

      <main className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-5 md:hidden">
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
    </div>
  )
}
