// FirstRunBlock — empty state riche réutilisable.
//
// Un utilisateur fraîchement inscrit qui atterrit sur BriefHome / Veille /
// Reports sans rien connecté voit l'app comme "cassée" si on lui montre des
// skeletons puis un dashed "aucune donnée". Ce composant remplace ça par un
// bloc d'accueil avec une vraie illustration, une promesse claire, un CTA
// primaire, et optionnellement 1-3 actions secondaires (templates, "ouvrir
// l'assistant"…).
//
// Utilisé sur :
//   - BriefHome (workspace sans canonical_metrics)
//   - Veille (aucune watch + aucune anomalie historique)
//   - Reports (aucun rapport généré)

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Cta =
  | { label: string; onClick: () => void; to?: never }
  | { label: string; to: string; onClick?: never }

export type FirstRunBlockProps = {
  illustration?: ReactNode
  eyebrow?: string
  title: string
  body: ReactNode
  primary: Cta
  secondary?: Array<{
    label: string
    sublabel?: string
    icon?: ReactNode
    onClick?: () => void
    to?: string
  }>
}

export default function FirstRunBlock({
  illustration,
  eyebrow,
  title,
  body,
  primary,
  secondary,
}: FirstRunBlockProps) {
  return (
    <div className="relative overflow-hidden rounded-brief border border-border bg-card p-7 shadow-float sm:p-9">
      {/* Halo radial brand, discret, pour signaler "premier contact" */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-[260px] w-[300px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(92,143,255,0.14), transparent 70%)',
        }}
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        {illustration && <div className="flex-shrink-0">{illustration}</div>}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-brand-blue-deep">
              {eyebrow}
            </div>
          )}
          <h2 className="mb-2 font-head text-[22px] font-bold leading-tight tracking-[-0.02em] text-text-1 sm:text-[24px]">
            {title}
          </h2>
          <div className="mb-5 text-[14.5px] leading-[1.6] text-text-2">{body}</div>
          {primary.to ? (
            <Link to={primary.to} className="sa-btn sa-btn-primary !text-sm">
              {primary.label} →
            </Link>
          ) : (
            <button
              type="button"
              onClick={primary.onClick}
              className="sa-btn sa-btn-primary !text-sm"
            >
              {primary.label} →
            </button>
          )}
        </div>
      </div>

      {secondary && secondary.length > 0 && (
        <div className="relative mt-6 border-t border-border pt-5">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-3">
            — ou —
          </div>
          <div className="flex flex-col gap-2">
            {secondary.map((s) =>
              s.to ? (
                <Link
                  key={s.label}
                  to={s.to}
                  className="group flex items-center gap-3 rounded-[10px] border border-border bg-bg-2 px-3.5 py-2.5 text-left transition-colors hover:border-border-bright hover:bg-card"
                >
                  <SecondaryRow label={s.label} sublabel={s.sublabel} icon={s.icon} />
                </Link>
              ) : (
                <button
                  key={s.label}
                  type="button"
                  onClick={s.onClick}
                  className="group flex items-center gap-3 rounded-[10px] border border-border bg-bg-2 px-3.5 py-2.5 text-left transition-colors hover:border-border-bright hover:bg-card"
                >
                  <SecondaryRow label={s.label} sublabel={s.sublabel} icon={s.icon} />
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SecondaryRow({
  label,
  sublabel,
  icon,
}: {
  label: string
  sublabel?: string
  icon?: ReactNode
}) {
  return (
    <>
      {icon && (
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] bg-brand-blue-dim text-brand-blue-deep">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-text-1">{label}</div>
        {sublabel && (
          <div className="mt-0.5 text-[12.5px] leading-snug text-text-2">{sublabel}</div>
        )}
      </div>
      <span className="font-mono text-[12px] text-text-3 transition-colors group-hover:text-brand-blue-deep">
        →
      </span>
    </>
  )
}
