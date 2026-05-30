// SmartAnalyst tracking script — entry point.
//
// Exposes a global `window.Smartanalyst(action, ...args)` function.
// Dormant until `Smartanalyst('init', { writeKey })` is invoked.
//
// Compliance:
//   - No reading of input fields (zero PII leakage)
//   - No fingerprinting (no Canvas/WebGL/font enumeration)
//   - SessionStorage-only identifiers (cleared at tab close)
//   - URL anonymized (path + query keys, never values)
//   - Referrer anonymized (origin only)
//   - Error messages truncated, file:line:col only
//   - IP truncation happens server-side
//
// Build target: <3KB gzipped (cf esbuild.config.mjs)

import type { SaApi, SaConfig, SaEvent } from './types'
import { safeProps, safeReferrer, safeUrl, selectorFor } from './sanitize'

declare const __SA_DEFAULT_ENDPOINT__: string
declare const __SA_VERSION__: string

const W = window as unknown as Window & { Smartanalyst?: SaApi & { q?: unknown[][] } }

// ━━━ État interne (jamais persisté hors SessionStorage) ━━━
let initialized = false
let config: SaConfig | null = null
let sessionId = ''

function getSessionId(): string {
  if (sessionId) return sessionId
  const key = '_sa_sid'
  try {
    let id = sessionStorage.getItem(key)
    if (!id) {
      // 16 octets de Math.random suffisent pour une session courte (pas une crypto).
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      sessionStorage.setItem(key, id)
    }
    sessionId = id
  } catch {
    sessionId = 'nosess-' + Date.now().toString(36)
  }
  return sessionId
}

// ━━━ Transport : sendBeacon si dispo, fallback fetch keepalive ━━━
function send(ev: SaEvent): void {
  if (!config || !initialized) return
  const endpoint = config.endpoint || __SA_DEFAULT_ENDPOINT__
  const body = JSON.stringify({
    wk: config.writeKey,
    v: __SA_VERSION__,
    ev,
  })
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(endpoint, blob)) return
    }
    // Fallback : fetch en mode keepalive (survit à un unload)
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      /* swallow — we don't break the host page if our endpoint fails */
    })
  } catch {
    /* swallow */
  }
}

function buildEvent(type: SaEvent['type'], extra: Partial<SaEvent> = {}): SaEvent {
  return {
    type,
    sid: getSessionId(),
    ts: Date.now(),
    url: safeUrl(location.href),
    ref: document.referrer ? safeReferrer(document.referrer) : undefined,
    ...extra,
  }
}

// ━━━ Listeners ━━━

let lastPath = ''
function trackPageview(): void {
  const path = location.pathname + location.search
  if (path === lastPath) return
  lastPath = path
  send(buildEvent('pageview'))
}

function onClick(e: MouseEvent): void {
  const target = e.target as Element | null
  if (!target || target.nodeType !== 1) return
  // Ne capture pas les clics dans des inputs (anti-PII : keystrokes accidentels).
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  send(buildEvent('click', { el: selectorFor(target) }))
}

function onError(e: ErrorEvent): void {
  const msg = (e.message || '').slice(0, 200)
  const loc = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : ''
  send(buildEvent('error', { err: `${msg} @ ${loc}`.slice(0, 300) }))
}

function onRejection(e: PromiseRejectionEvent): void {
  const reason = e.reason
  const msg = typeof reason === 'string' ? reason : reason?.message ? reason.message : 'unhandled rejection'
  send(buildEvent('error', { err: ('promise: ' + String(msg)).slice(0, 300) }))
}

// SPA navigation : patch pushState/replaceState pour détecter les changements d'URL
function installHistoryHook(): void {
  const origPush = history.pushState
  const origReplace = history.replaceState
  history.pushState = function (...args) {
    const r = origPush.apply(this, args as never)
    setTimeout(trackPageview, 0)
    return r
  }
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args as never)
    setTimeout(trackPageview, 0)
    return r
  }
  addEventListener('popstate', () => setTimeout(trackPageview, 0))
}

// ━━━ Public API ━━━

function init(cfg: SaConfig): void {
  if (initialized) return
  if (!cfg || !cfg.writeKey) return
  config = cfg
  initialized = true

  send(buildEvent('session_start'))

  if (!cfg.disableAutoPageview) {
    trackPageview()
    installHistoryHook()
  }
  addEventListener('click', onClick, true)
  if (!cfg.disableErrorTracking) {
    addEventListener('error', onError)
    addEventListener('unhandledrejection', onRejection)
  }
}

const api: SaApi = ((action: string, ...args: unknown[]): void => {
  if (action === 'init') {
    init(args[0] as SaConfig)
  } else if (action === 'page') {
    if (!initialized) return
    lastPath = '' // force re-send
    trackPageview()
  } else if (action === 'track') {
    if (!initialized) return
    const name = String(args[0] || '').slice(0, 60)
    if (!name) return
    send(
      buildEvent('custom', {
        name,
        props: safeProps(args[1] as Record<string, unknown>),
      }),
    )
  } else if (action === 'runAudit') {
    // Audit SEO/GEO on-demand est implémenté dans une phase ultérieure.
    // Pour l'instant on no-op pour ne pas casser une intégration anticipée.
  }
}) as SaApi

// Si un loader a déjà bufferisé des appels avant que le script soit chargé
// (pattern Segment-like), on les rejoue.
const existing = W.Smartanalyst
if (existing && Array.isArray(existing.q)) {
  for (const args of existing.q) {
    try {
      api.apply(null, args as never)
    } catch {
      /* swallow */
    }
  }
}

W.Smartanalyst = api
