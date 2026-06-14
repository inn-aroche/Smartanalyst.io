// Consent Mode v2 — helpers app SaaS.
// - localStorage uniquement (pas de cookie tiers).
// - Re-prompt après 13 mois (CNIL).
// - applyGtag pousse `consent update` à GTM (qui contrôle GA4/Pixel/etc.).
// - Le snippet `default deny` est posé dans index.html AVANT GTM.

const STORAGE_KEY = 'sa-app-consent-v1'
const MAX_AGE_MS = 13 * 30 * 24 * 3600 * 1000

export type ConsentChoice = {
  analytics: boolean
  ads: boolean
  ts: string
  v: 1
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function readConsent(): ConsentChoice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as ConsentChoice
    if (!c?.ts) return null
    if (Date.now() - new Date(c.ts).getTime() > MAX_AGE_MS) return null
    return c
  } catch {
    return null
  }
}

export function writeConsent(analytics: boolean, ads: boolean): ConsentChoice {
  const c: ConsentChoice = {
    analytics: !!analytics,
    ads: !!ads,
    ts: new Date().toISOString(),
    v: 1,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    // localStorage indispo (mode privé strict) → on applique quand même en mémoire.
  }
  applyGtag(c.analytics, c.ads)
  return c
}

export function applyGtag(analytics: boolean, ads: boolean): void {
  if (typeof window === 'undefined') return
  if (typeof window.gtag !== 'function') return
  window.gtag('consent', 'update', {
    ad_storage: ads ? 'granted' : 'denied',
    ad_user_data: ads ? 'granted' : 'denied',
    ad_personalization: ads ? 'granted' : 'denied',
    analytics_storage: analytics ? 'granted' : 'denied',
  })
}

// Évènement custom pour rouvrir le banner depuis n'importe où (Settings, footer…).
export const CONSENT_OPEN_EVENT = 'sa-consent:open'

export function openConsentPreferences(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT))
}
