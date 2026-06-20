// Design-system d'états UI (cahier §3 Lot 2 + §4.9 composants transverses).
//
// 4 composants uniques, réutilisés partout. Aujourd'hui chaque page redéfinit
// son propre "vide" / "erreur" / "loading" inline → 30+ patterns dupliqués.
// Ce module centralise pour que le ton, l'espacement et l'a11y soient identiques.
//
// Convention :
//   - illustration optionnelle (SVG / emoji)
//   - titre obligatoire
//   - description optionnelle (1-2 phrases)
//   - action optionnelle (bouton CTA)
//   - taille `compact` (cartes/colonnes) vs `default` (page entière)

import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useT } from '@/lib/i18n'

type Size = 'default' | 'compact'

type ActionLink = { to: string; label: string }
type ActionButton = { onClick: () => void; label: string }
type Action = ActionLink | ActionButton

function isLinkAction(a: Action): a is ActionLink {
  return 'to' in a
}

// ─── EmptyState ──────────────────────────────────────────────────────────
// Utilisé quand une liste n'a aucun élément (premier usage, filtre trop strict,
// workspace vide…). Toujours préférer ce composant au "rien à afficher" muet.

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'default',
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: Action
  size?: Size
}) {
  const pad = size === 'compact' ? 'px-4 py-8' : 'px-6 py-14'
  const iconSize = size === 'compact' ? 'h-10 w-10 text-base' : 'h-14 w-14 text-xl'
  const titleSize = size === 'compact' ? 'text-sm' : 'text-[15px]'
  return (
    <div className={`flex flex-col items-center text-center ${pad}`} role="status">
      {icon !== undefined ? (
        <div
          className={`mb-3 flex flex-shrink-0 items-center justify-center rounded-full bg-bg-3 text-text-3 ${iconSize}`}
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <div className={`font-head font-semibold text-text-1 ${titleSize}`}>{title}</div>
      {description && (
        <p className="mt-1 max-w-[360px] text-[13px] leading-snug text-text-2">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {isLinkAction(action) ? (
            <Link to={action.to} className="sa-btn sa-btn-primary !text-[13px]">
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="sa-btn sa-btn-primary !text-[13px]"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── LoadingSkeleton ─────────────────────────────────────────────────────
// Squelette de chargement structurel — pas un spinner. Préfère ce composant
// au `animate-pulse` inline qui finit toujours par diverger d'une page à
// l'autre. Les primitives bas-niveau restent dans Skeleton.tsx.

export function LoadingSkeleton({ lines = 3, size = 'default' }: { lines?: number; size?: Size }) {
  const pad = size === 'compact' ? 'p-3' : 'p-4'
  return (
    <div
      className={`flex flex-col gap-2.5 ${pad}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-card"
          style={{ width: `${100 - i * 8}%` }}
        />
      ))}
    </div>
  )
}

// Variante "carte" — sert sur les grilles (Tasks Kanban, Veille insights…).
export function LoadingSkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-brief border border-border bg-card p-4 shadow-card">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-bg-3" />
          <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-bg-3" />
        </div>
      ))}
    </div>
  )
}

// ─── ErrorState ──────────────────────────────────────────────────────────
// Utilisé quand un fetch / une mutation échoue. Préfère le bouton "Réessayer"
// au simple message d'erreur — l'user doit pouvoir s'en sortir sans refresh.

export function ErrorState({
  title,
  description,
  retry,
  size = 'default',
}: {
  title?: string
  description?: string
  retry?: () => void
  size?: Size
}) {
  const t = useT()
  const pad = size === 'compact' ? 'px-4 py-6' : 'px-6 py-10'
  return (
    <div
      className={`flex flex-col items-center text-center ${pad}`}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="mb-3 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-red/15 text-brand-red"
        aria-hidden="true"
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <line
            x1="9"
            y1="5"
            x2="9"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="9" cy="13" r="0.8" fill="currentColor" />
        </svg>
      </div>
      <div className="font-head text-[15px] font-semibold text-text-1">
        {title || t('state.error.title')}
      </div>
      <p className="mt-1 max-w-[360px] text-[13px] leading-snug text-text-2">
        {description || t('state.error.body')}
      </p>
      {retry && (
        <button type="button" onClick={retry} className="sa-btn mt-4 !text-[13px]">
          {t('state.error.retry')}
        </button>
      )}
    </div>
  )
}

// ─── PermissionDenied ────────────────────────────────────────────────────
// Utilisé quand un user n'a pas accès à une feature (plan, rôle, beta).
// Distinct de l'erreur générique : on explique pourquoi + on propose l'upgrade.

export function PermissionDenied({
  title,
  description,
  upgrade,
  size = 'default',
}: {
  title?: string
  description?: string
  upgrade?: Action
  size?: Size
}) {
  const t = useT()
  const pad = size === 'compact' ? 'px-4 py-6' : 'px-6 py-10'
  return (
    <div className={`flex flex-col items-center text-center ${pad}`} role="status">
      <div
        className="mb-3 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-amber/15 text-brand-amber"
        aria-hidden="true"
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <rect
            x="4"
            y="8"
            width="10"
            height="7"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M6 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
      <div className="font-head text-[15px] font-semibold text-text-1">
        {title || t('state.permission.title')}
      </div>
      <p className="mt-1 max-w-[360px] text-[13px] leading-snug text-text-2">
        {description || t('state.permission.body')}
      </p>
      {upgrade && (
        <div className="mt-4">
          {isLinkAction(upgrade) ? (
            <Link to={upgrade.to} className="sa-btn sa-btn-primary !text-[13px]">
              {upgrade.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={upgrade.onClick}
              className="sa-btn sa-btn-primary !text-[13px]"
            >
              {upgrade.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
