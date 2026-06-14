// Pont d'erreurs vers le backend → Sentry server-side.
//
// Pourquoi pas @sentry/react ? Voir routes/client-errors.routes.js côté
// API : on évite +50kb gzip dans le bundle pour la beta. On bascule sur
// le SDK natif quand on aura besoin de breadcrumbs / replay / source
// maps en remote.
//
// Comportement :
//   - Fire-and-forget (jamais d'await dans le UI).
//   - Throttle local : pas plus de 1 envoi / 2s pour la même signature
//     d'erreur, pour éviter qu'un crash en boucle nous DDoS notre propre
//     endpoint.
//   - URL relative → pris en charge par le proxy Vite en dev et le
//     même domaine en prod (apiFetch utilise VITE_API_URL).

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const ENDPOINT = `${BASE_URL}/api/v1/client-errors`

type ErrorPayload = {
  message: string
  stack?: string
  componentStack?: string
  url?: string
  userAgent?: string
  userId?: string
}

const sentRecently = new Map<string, number>()
const THROTTLE_MS = 2000

function makeSignature(p: ErrorPayload): string {
  return `${p.message}::${(p.stack || '').slice(0, 80)}`
}

function shouldDrop(sig: string): boolean {
  const last = sentRecently.get(sig)
  const now = Date.now()
  if (last && now - last < THROTTLE_MS) return true
  sentRecently.set(sig, now)
  // GC mou (évite que la Map enfle)
  if (sentRecently.size > 50) {
    const cutoff = now - 60_000
    for (const [k, t] of sentRecently) if (t < cutoff) sentRecently.delete(k)
  }
  return false
}

function getUserId(): string | undefined {
  // L'auth stocke éventuellement l'id en localStorage pour persister. Si
  // c'est pas là, tant pis : Sentry recevra l'erreur sans user.
  try {
    const raw = localStorage.getItem('sa.user.id')
    return raw ? String(raw) : undefined
  } catch {
    return undefined
  }
}

/**
 * Envoie une erreur au backend. Toujours fire-and-forget (aucun await
 * remonté). Silencieux si l'envoi lui-même échoue.
 */
export function reportClientError(err: unknown, extra: { componentStack?: string } = {}): void {
  const payload: ErrorPayload = {
    message:
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
    componentStack: extra.componentStack,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    userId: getUserId(),
  }

  if (shouldDrop(makeSignature(payload))) return

  try {
    // Pas d'auth header — le endpoint est public + rate-limité côté API.
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // keepalive permet l'envoi même si la page se ferme (cas window.onerror
      // au unload).
      keepalive: true,
    }).catch(() => {
      /* silencieux */
    })
  } catch {
    /* silencieux */
  }
}

/**
 * Installe les listeners globaux (à appeler une fois au bootstrap).
 * Capture :
 *   - window.onerror  : erreurs synchrones non catchées
 *   - unhandledrejection : promesses non catchées
 *
 * On NE remplace PAS d'éventuels handlers existants — on ajoute juste les
 * nôtres via addEventListener.
 */
export function installGlobalErrorReporting(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    // event.error peut être null pour certaines erreurs (ex: scripts cross-
    // origin sans CORS). On fallback sur event.message.
    const e = event.error ?? event.message ?? 'unknown error'
    reportClientError(e)
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason ?? 'unhandled rejection')
  })
}
