// ActivationErrorState — cahier §4.1 et §4.7 + §3 Lot 0.
//
// Panneau pédagogique qui rend chaque mode d'échec d'activation visible
// avec un message clair et un CTA — pas un toast générique qui s'efface
// avant que le user ait compris.
//
// Cas supportés :
// - oauth_error          : redirection OAuth → /connectors?status=error&reason=X
// - oauth_provider_denied : l'utilisateur a refusé sur la page du provider
// - scope_mismatch       : provider a accordé moins que les scopes demandés
// - insufficient_data    : connecteur OK mais < 7 jours de données disponibles
// - workspace_not_ready  : auth résolue mais workspace pas finalisé
// - unknown              : fallback explicite, mieux que l'absence de signal

import { type StringKey, useT } from '@/lib/i18n'

export type ActivationErrorKind =
  | 'oauth_error'
  | 'oauth_provider_denied'
  | 'scope_mismatch'
  | 'insufficient_data'
  | 'workspace_not_ready'
  | 'unknown'

type Severity = 'warn' | 'error'

type Spec = {
  severity: Severity
  iconSymbol: string
  titleKey: StringKey
  bodyKey: StringKey
}

// Catalogue centralisé : on évite que chaque page invente sa propre copy.
const SPECS: Record<ActivationErrorKind, Spec> = {
  oauth_error: {
    severity: 'error',
    iconSymbol: '✕',
    titleKey: 'activation.error.oauth_error.title',
    bodyKey: 'activation.error.oauth_error.body',
  },
  oauth_provider_denied: {
    severity: 'warn',
    iconSymbol: '!',
    titleKey: 'activation.error.oauth_provider_denied.title',
    bodyKey: 'activation.error.oauth_provider_denied.body',
  },
  scope_mismatch: {
    severity: 'warn',
    iconSymbol: '!',
    titleKey: 'activation.error.scope_mismatch.title',
    bodyKey: 'activation.error.scope_mismatch.body',
  },
  insufficient_data: {
    severity: 'warn',
    iconSymbol: 'i',
    titleKey: 'activation.error.insufficient_data.title',
    bodyKey: 'activation.error.insufficient_data.body',
  },
  workspace_not_ready: {
    severity: 'warn',
    iconSymbol: '⏳',
    titleKey: 'activation.error.workspace_not_ready.title',
    bodyKey: 'activation.error.workspace_not_ready.body',
  },
  unknown: {
    severity: 'warn',
    iconSymbol: '?',
    titleKey: 'activation.error.unknown.title',
    bodyKey: 'activation.error.unknown.body',
  },
}

export default function ActivationErrorState({
  kind,
  source,
  detail,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
}: {
  kind: ActivationErrorKind
  // Provider concerné (ex. 'meta_ads', 'ga4') — pour personnaliser le body.
  source?: string | null
  // Info technique en plus (raison provider, liste de scopes manquants…).
  detail?: string | null
  onPrimary?: () => void
  onSecondary?: () => void
  primaryLabel?: string
  secondaryLabel?: string
}) {
  const t = useT()
  const spec = SPECS[kind]
  const isError = spec.severity === 'error'
  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        'mb-5 flex gap-3 rounded-brief border p-4',
        isError ? 'border-brand-red/30 bg-brand-red/5' : 'border-brand-amber/30 bg-brand-amber/5',
      ].join(' ')}
      data-activation-error-kind={kind}
    >
      <span
        className={[
          'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
          isError ? 'bg-brand-red' : 'bg-brand-amber',
        ].join(' ')}
        aria-hidden="true"
      >
        {spec.iconSymbol}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-head text-[14.5px] font-semibold text-text-1">
          {t(spec.titleKey, source ? { source } : undefined)}
        </div>
        <p className="mt-1 text-[13px] leading-[1.55] text-text-2">
          {t(spec.bodyKey, source ? { source } : undefined)}
        </p>
        {detail && (
          <p className="mt-1.5 font-mono text-[11px] leading-[1.45] text-text-3">{detail}</p>
        )}
        {(onPrimary || onSecondary) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onPrimary && primaryLabel && (
              <button
                type="button"
                onClick={onPrimary}
                className="sa-btn sa-btn-primary !text-[12.5px]"
              >
                {primaryLabel}
              </button>
            )}
            {onSecondary && secondaryLabel && (
              <button type="button" onClick={onSecondary} className="sa-btn !text-[12.5px]">
                {secondaryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
