// UpgradePrompt — composant réutilisable (cahier §3 Lot 3 + §4.9).
//
// Affiché inline quand un user atteint une limite de son plan ou tente d'accéder
// à une feature non incluse. Pas un modal bloquant — un encart qui contextualise
// la limite et propose l'upgrade en 1 clic (Stripe Checkout).
//
// Utilisation :
//   <UpgradePrompt
//     feature="reports"
//     reason="Le plan Pro débloque la génération de rapports."
//     compact
//   />
//
// Variants :
//   - default : encart complet avec icône + titre + body + CTA
//   - compact : 1 ligne inline pour les zones étroites (ex. dans un dropdown)

import { useMutation } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'

type Props = {
  feature: 'connectors' | 'insights_per_month' | 'reports' | 'deep_chat'
  reason?: string
  compact?: boolean
  // Texte custom au lieu du label par défaut (par feature). Optionnel.
  label?: string
}

export default function UpgradePrompt({ feature, reason, compact, label }: Props) {
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id

  // Le track est tiré au mount via mutate, mais ici on l'émet juste avant
  // l'appel API pour mesurer le funnel "vu → cliqué".
  const checkout = useMutation({
    mutationFn: async () => {
      track('upgrade_prompt_shown', { feature })
      const res = await apiFetch<{ url: string }>('/api/v1/billing/checkout', {
        method: 'POST',
        body: { workspaceId, plan: 'pro' },
      })
      // Redirection vers Stripe Checkout — hard redirect, on perd l'état React
      // (c'est normal, l'user revient après paiement via successUrl).
      if (res.url && typeof window !== 'undefined') {
        window.location.href = res.url
      }
      return res
    },
  })

  const message = reason || defaultReason(feature, t)
  const ctaLabel = label || t('upgrade.cta')

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-brand-amber/30 bg-brand-amber/8 px-3 py-2 text-[12.5px]">
        <span className="font-semibold text-brand-amber">★</span>
        <span className="flex-1 truncate text-text-2">{message}</span>
        <button
          type="button"
          onClick={() => checkout.mutate()}
          disabled={checkout.isPending || !workspaceId}
          className="rounded bg-brand-blue-deep px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {checkout.isPending ? t('upgrade.loading') : ctaLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-brief border border-brand-amber/30 bg-brand-amber/8 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-brand-amber/15 font-head text-base font-bold text-brand-amber"
        >
          ★
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-head text-[14.5px] font-semibold text-text-1">
            {t('upgrade.title')}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-text-2">{message}</p>
          {checkout.isError && (
            <div className="mt-2 text-[12px] text-brand-red">{t('upgrade.error')}</div>
          )}
          <button
            type="button"
            onClick={() => checkout.mutate()}
            disabled={checkout.isPending || !workspaceId}
            className="sa-btn sa-btn-primary mt-3 !text-[13px] disabled:opacity-60"
          >
            {checkout.isPending ? t('upgrade.loading') : ctaLabel + ' →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function defaultReason(feature: Props['feature'], t: ReturnType<typeof useT>): string {
  switch (feature) {
    case 'connectors':
      return t('upgrade.reason.connectors')
    case 'insights_per_month':
      return t('upgrade.reason.insights')
    case 'reports':
      return t('upgrade.reason.reports')
    case 'deep_chat':
      return t('upgrade.reason.deepChat')
    default:
      return t('upgrade.reason.generic')
  }
}
