// BillingSection — onglet "Plan & facturation" dans Settings (cahier §3 Lot 3
// + §4.8). Affiche le plan actuel + quotas utilisés + bouton "Manage" (Customer
// Portal Stripe) ou "Upgrade" (Checkout) selon le plan.

import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'

type Entitlements = {
  plan: 'free' | 'pro' | 'starter' | 'agency'
  features: {
    canGenerateReports: boolean
    canUseDeepChat: boolean
    canPinToDashboard: boolean
    canGenerateSlides: boolean
  }
  quotas: {
    connectors: { current: number; limit: number | null; exceeded: boolean }
    insightsPerMonth: { current: number; limit: number | null; exceeded: boolean }
    aiTokensPerMonth?: { current: number; limit: number | null; exceeded: boolean }
  }
  gracePeriod?: {
    active: boolean
    expired: boolean
    deadlineAt: string | null
    daysLeft: number
  } | null
}

export default function BillingSection() {
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id

  const subQ = useQuery({
    queryKey: ['billing', 'subscription', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<Entitlements>(`/api/v1/billing/subscription?workspaceId=${workspaceId}`),
    staleTime: 60_000,
  })

  const checkout = useMutation({
    mutationFn: async (plan: 'pro' | 'starter') => {
      const res = await apiFetch<{ url: string }>('/api/v1/billing/checkout', {
        method: 'POST',
        body: { workspaceId, plan },
      })
      if (res.url && typeof window !== 'undefined') window.location.href = res.url
      return res
    },
  })

  const portal = useMutation({
    mutationFn: async () => {
      track('billing_portal_opened')
      const res = await apiFetch<{ url: string }>('/api/v1/billing/portal', {
        method: 'POST',
        body: { workspaceId },
      })
      if (res.url && typeof window !== 'undefined') window.location.href = res.url
      return res
    },
  })

  // Hooks toujours avant les early returns (Rules of Hooks) — sinon crash
  // « Rendered more hooks » au passage loading → loaded.
  const grace = subQ.data?.gracePeriod
  const graceActive = Boolean(grace?.active || grace?.expired)
  const graceExpired = Boolean(grace?.expired)
  useEffect(() => {
    if (graceActive) track('grace_period_warning_shown', { expired: graceExpired })
  }, [graceActive, graceExpired])

  if (subQ.isLoading) {
    return (
      <div className="sa-card animate-pulse">
        <div className="h-4 w-24 rounded bg-bg-3" />
        <div className="mt-3 h-3 w-3/4 rounded bg-bg-3" />
      </div>
    )
  }
  if (subQ.isError || !subQ.data) {
    return (
      <div className="sa-card border-brand-red/30 bg-brand-red/5 text-sm text-brand-red">
        {t('billing.loadError')}
      </div>
    )
  }

  const ent = subQ.data

  const isPro = ent.plan === 'pro' || ent.plan === 'starter' || ent.plan === 'agency'
  const planLabel =
    ent.plan === 'pro'
      ? 'Pro'
      : ent.plan === 'free'
        ? 'Free'
        : ent.plan === 'starter'
          ? 'Starter'
          : 'Agency'

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau grâce / paiement échoué */}
      {ent.gracePeriod?.active && (
        <div className="sa-card border-brand-red/30 bg-brand-red/5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 text-brand-red">⚠</div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-brand-red">
                {t('billing.grace.title')}
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-text-2">
                {t('billing.grace.body').replace('{days}', String(ent.gracePeriod.daysLeft))}
              </p>
              <button
                type="button"
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                className="sa-btn sa-btn-primary mt-2 !text-[12px]"
              >
                {t('billing.grace.cta')}
              </button>
            </div>
          </div>
        </div>
      )}
      {ent.gracePeriod?.expired && (
        <div className="sa-card border-brand-red/30 bg-brand-red/5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 text-brand-red">⚠</div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-brand-red">
                {t('billing.grace.expiredTitle')}
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-text-2">
                {t('billing.grace.expiredBody')}
              </p>
              <button
                type="button"
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                className="sa-btn sa-btn-primary mt-2 !text-[12px]"
              >
                {t('billing.grace.cta')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan actuel */}
      <div className="sa-card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-widest text-text-3">
              {t('billing.currentPlan')}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-head text-[22px] font-bold text-text-1">{planLabel}</span>
              {ent.plan === 'pro' && (
                <span className="rounded-full bg-brand-green/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand-green">
                  {t('billing.active')}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-[480px] text-[13px] leading-snug text-text-2">
              {isPro ? t('billing.pro.description') : t('billing.free.description')}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col gap-2">
            {isPro ? (
              <button
                type="button"
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                className="sa-btn !text-[13px] disabled:opacity-60"
              >
                {portal.isPending ? t('billing.loading') : t('billing.managePortal')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => checkout.mutate('pro')}
                  disabled={checkout.isPending}
                  className="sa-btn sa-btn-primary !text-[13px] disabled:opacity-60"
                >
                  {checkout.isPending && checkout.variables === 'pro'
                    ? t('billing.loading')
                    : t('billing.upgradeToPro') + ' — 59€/mois →'}
                </button>
                <button
                  type="button"
                  onClick={() => checkout.mutate('starter')}
                  disabled={checkout.isPending}
                  className="sa-btn !text-[12px] disabled:opacity-60"
                >
                  {checkout.isPending && checkout.variables === 'starter'
                    ? t('billing.loading')
                    : t('billing.upgradeToStarter') + ' — 29€/mois'}
                </button>
              </>
            )}
            {(checkout.isError || portal.isError) && (
              <div className="text-[11.5px] text-brand-red">
                {mapBillingError(checkout.error || portal.error, t)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quotas utilisés */}
      <div className="sa-card">
        <div className="mb-3 font-head text-[14px] font-semibold text-text-1">
          {t('billing.usage')}
        </div>
        <div className="flex flex-col gap-3">
          <QuotaRow
            label={t('billing.usage.connectors')}
            current={ent.quotas.connectors.current}
            limit={ent.quotas.connectors.limit}
            exceeded={ent.quotas.connectors.exceeded}
          />
          <QuotaRow
            label={t('billing.usage.insights')}
            current={ent.quotas.insightsPerMonth.current}
            limit={ent.quotas.insightsPerMonth.limit}
            exceeded={ent.quotas.insightsPerMonth.exceeded}
          />
          <FeatureRow
            label={t('billing.usage.reports')}
            enabled={ent.features.canGenerateReports}
          />
          <FeatureRow label={t('billing.usage.deepChat')} enabled={ent.features.canUseDeepChat} />
        </div>
      </div>
    </div>
  )
}

function QuotaRow({
  label,
  current,
  limit,
  exceeded,
}: {
  label: string
  current: number
  limit: number | null
  exceeded: boolean
}) {
  const t = useT()
  const limitLabel = limit === null ? t('billing.unlimited') : limit.toString()
  const pct = limit === null ? 0 : Math.min((current / Math.max(limit, 1)) * 100, 100)
  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-text-2">{label}</span>
        <span className={`font-mono text-[12px] ${exceeded ? 'text-brand-red' : 'text-text-1'}`}>
          {current} / {limitLabel}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-3">
          <div
            className={`h-full transition-all ${exceeded ? 'bg-brand-red' : 'bg-brand-blue-deep'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-text-2">{label}</span>
      <span
        className={`font-mono text-[11px] uppercase tracking-widest ${
          enabled ? 'text-brand-green' : 'text-text-3'
        }`}
      >
        {enabled ? '✓ inclus' : '— locked'}
      </span>
    </div>
  )
}

function mapBillingError(err: unknown, t: ReturnType<typeof useT>): string {
  if (err instanceof ApiError) {
    if (err.code === 'BILLING_NOT_CONFIGURED') return t('billing.error.notConfigured')
    if (err.code === 'NO_CUSTOMER') return t('billing.error.noCustomer')
    if (err.code === 'BILLING_PLAN_UNAVAILABLE') return t('billing.error.planUnavailable')
    return err.message
  }
  return t('billing.error.generic')
}
