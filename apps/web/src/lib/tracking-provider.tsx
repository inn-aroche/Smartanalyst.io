// TrackingProvider — réagit au consent + à l'auth pour piloter le wrapper
// lib/tracking.ts. À monter une fois sous AuthProvider et au-dessus de App
// (cf. main.tsx).
//
// Cycle de vie :
// - Au mount, lit le consent stocké. Si analytics granted → enableTracking().
// - À chaque changement de consent (event CONSENT_OPEN_EVENT ou modif via
//   ConsentBanner), reflète l'état.
// - Quand l'utilisateur change (login/logout/refresh), appelle identify /
//   resetIdentity. Quand le workspace change, met à jour le contexte.

import { useEffect, type ReactNode } from 'react'

import { readConsent } from './consent'
import {
  disableTracking,
  enableTracking,
  identify,
  resetIdentity,
  setWorkspaceContext,
} from './tracking'

import { useAuth } from './auth'

export function TrackingProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const userId = state.user?.id ?? null
  const userEmail = state.user?.email ?? null
  const workspaceId = state.workspaces[0]?.id ?? null

  // ─── Consent ──────────────────────────────────────────────────────────
  // Le ConsentBanner écrit dans localStorage via writeConsent(). On synchro-
  // nise le tracking au mount et à chaque storage event (autre onglet) ou
  // event custom local. On poll aussi quelques fois au boot pour rattraper
  // un changement intra-onglet (writeConsent ne dispatch pas un event).
  useEffect(() => {
    function sync() {
      const c = readConsent()
      if (c?.analytics) enableTracking()
      else disableTracking()
    }
    sync()
    window.addEventListener('storage', sync)
    // Petit re-check après l'éventuel premier clic du banner.
    const t1 = window.setTimeout(sync, 1500)
    const t2 = window.setTimeout(sync, 6000)
    return () => {
      window.removeEventListener('storage', sync)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  // ─── Identity ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (userId) {
      identify(userId, userEmail ? { email: userEmail } : undefined)
    } else {
      resetIdentity()
    }
  }, [userId, userEmail])

  // ─── Workspace context ────────────────────────────────────────────────
  useEffect(() => {
    setWorkspaceContext(workspaceId)
  }, [workspaceId])

  return <>{children}</>
}
