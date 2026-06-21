// Wrapper analytics — cahier des charges §6 (measurement plan, Lot 0).
//
// Provider : PostHog cloud EU (hébergement EU = cohérent avec la gouvernance
// des données promise par ADR-0003). Aucun event n'est émis tant que le user
// n'a pas consenti à analytics (Consent Mode v2 — lib/consent.ts).
//
// Conventions (cahier §6) :
// - Nom d'event en `snake_case`, verbe au passé.
// - Propriété `workspace_id` systématique (injectée par le provider — voir
//   tracking-provider.tsx) ; les call-sites n'ont pas à la passer.
// - Pas d'event avant consentement (Consent Mode v2).
//
// Mode dégradé : si `VITE_POSTHOG_KEY` n'est pas défini (dev local sans
// projet PostHog), le wrapper est une no-op silencieuse — le code applicatif
// peut appeler `track()` partout sans crash.

import posthog from 'posthog-js'

// Whitelist typée des events : empêche les fautes de frappe et matérialise
// le contrat avec le measurement plan §6. Tout nouvel event passe ici en
// premier (revue), sinon TypeScript bloque l'appel.
export type TrackEvent =
  // ── Activation (funnel onboarding) ────────────────────────────────────
  | 'onboarding_step_viewed'
  | 'url_submitted'
  | 'profile_confirmed'
  | 'profile_corrected'
  | 'connector_connect_started'
  | 'connector_connect_succeeded'
  | 'connector_connect_failed'
  | 'first_insight_shown'
  | 'onboarding_completed'
  | 'onboarding_dropped'
  // ── Engagement (boucle) ───────────────────────────────────────────────
  | 'brief_viewed'
  | 'chat_message_sent'
  | 'insight_resolved'
  | 'watch_created'
  | 'watch_triggered'
  | 'task_accepted'
  | 'task_completed'
  | 'notification_clicked'
  // ── Monétisation ──────────────────────────────────────────────────────
  | 'upgrade_prompt_shown'
  | 'billing_portal_opened'
  | 'plan_changed'
  | 'payment_failed'
  | 'dunning_recovered'
  // ── Qualité IA ────────────────────────────────────────────────────────
  | 'chat_error_shown'
  | 'chat_budget_blocked'
  | 'insight_dismissed_as_wrong'
  // ── Chat V2.1 (cahier 22b — copilote génératif) ───────────────────────
  | 'chat_quickcard_clicked'
  | 'chat_action_taken'
  | 'chat_export_generated'

type EventProps = Record<string, string | number | boolean | null | undefined>

// État interne du wrapper. `enabled` reste `false` tant qu'aucune clé n'est
// fournie ou que le consent n'est pas donné — `track()` devient alors no-op.
let enabled = false
let initialized = false
let workspaceContext: { workspace_id: string | null } = { workspace_id: null }

function readKey(): string | null {
  const k = import.meta.env.VITE_POSTHOG_KEY
  return typeof k === 'string' && k.length > 0 ? k : null
}

function readHost(): string {
  const h = import.meta.env.VITE_POSTHOG_HOST
  return typeof h === 'string' && h.length > 0 ? h : 'https://eu.i.posthog.com'
}

// Initialise PostHog une seule fois, idempotent. Doit être appelé après que
// le user a consenti à analytics ; sinon ne fait rien.
export function enableTracking(): void {
  if (typeof window === 'undefined') return
  if (enabled) return
  const key = readKey()
  if (!key) {
    // Pas de projet PostHog configuré → mode dégradé silencieux. On laisse
    // `enabled=false` pour que `track()` soit no-op.
    return
  }
  if (!initialized) {
    posthog.init(key, {
      api_host: readHost(),
      // EU : on n'envoie pas vers us.i.posthog.com.
      ui_host: 'https://eu.posthog.com',
      // Capture manuelle uniquement — le measurement plan §6 est explicite,
      // pas de heatmaps/autocapture pour respecter la frugalité de la donnée.
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      // Les pageviews sont déjà gérées via gtm.ts ; on ne double pas.
      disable_session_recording: true,
      // Persistance localStorage (pas de cookie tiers).
      persistence: 'localStorage',
    })
    initialized = true
  } else {
    posthog.opt_in_capturing()
  }
  enabled = true
}

// Désactive l'émission (mais ne purge pas l'instance — PostHog gère
// `opt_out` qui empêche toute capture future jusqu'à ré-opt-in).
export function disableTracking(): void {
  if (!initialized) {
    enabled = false
    return
  }
  posthog.opt_out_capturing()
  enabled = false
}

// Lie un user au profil PostHog (à appeler après login / au boot si
// l'utilisateur est déjà authentifié).
export function identify(userId: string, props?: EventProps): void {
  if (!enabled || !initialized) return
  posthog.identify(userId, props)
}

// À appeler au logout : casse le lien avec l'utilisateur courant pour
// éviter la fuite de session sur le navigateur partagé.
export function resetIdentity(): void {
  if (!initialized) return
  posthog.reset()
}

// Stocke le workspace courant pour qu'il soit injecté automatiquement
// dans tous les events. Appelé par le provider quand l'auth change.
export function setWorkspaceContext(workspaceId: string | null): void {
  workspaceContext = { workspace_id: workspaceId }
  if (enabled && initialized && workspaceId) {
    // Super-property : automatiquement attachée à chaque capture suivante.
    posthog.register({ workspace_id: workspaceId })
  } else if (initialized && !workspaceId) {
    posthog.unregister('workspace_id')
  }
}

// Émet un event. No-op silencieuse si :
// - SSR
// - lib non initialisée (pas de VITE_POSTHOG_KEY)
// - consent analytics refusé
export function track(event: TrackEvent, props?: EventProps): void {
  if (typeof window === 'undefined') return
  if (!enabled || !initialized) return
  // workspace_id est déjà en super-property (cf. setWorkspaceContext) mais on
  // le rappelle explicitement ici pour qu'il apparaisse dans les events sans
  // dépendre du moment où setWorkspaceContext a été appelé.
  posthog.capture(event, { ...workspaceContext, ...(props ?? {}) })
}
