// Hook React Query qui ramène les entitlements du workspace courant.
// Utilisé pour décider en UI si une feature est dispo (canGenerateReports,
// canUseDeepChat) ou si un quota est dépassé (connecteurs, insights/mois).
//
// Cache 60s : aligné sur le polling Settings/Billing. Évite un appel par
// composant qui se mount.

import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export type Entitlements = {
  plan: 'free' | 'pro' | 'starter' | 'agency'
  features: {
    canGenerateReports: boolean
    canUseDeepChat: boolean
    // Lot V2.3 — flags pour le gating de l'action shelf chat (cahier 22b §5).
    canPinToDashboard: boolean
    canGenerateSlides: boolean
  }
  quotas: {
    connectors: { current: number; limit: number | null; exceeded: boolean }
    insightsPerMonth: { current: number; limit: number | null; exceeded: boolean }
    aiTokensPerMonth?: { current: number; limit: number | null; exceeded: boolean }
  }
}

export function useEntitlements() {
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id
  return useQuery({
    queryKey: ['billing', 'subscription', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<Entitlements>(`/api/v1/billing/subscription?workspaceId=${workspaceId}`),
    staleTime: 60_000,
  })
}
