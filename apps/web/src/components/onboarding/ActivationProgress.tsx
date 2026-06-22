// ActivationProgress — barre fine sticky sous la Topbar qui montre les 3
// premieres actions a faire (next-steps F). Disparait quand les 3 sont faites
// OU quand l'user clique ✕ (persiste son choix par workspace).
//
// Signaux :
//   - Connect source     : entitlements.quotas.connectors.current > 0
//   - Ask first question : localStorage `sa-chat:last-conversation:${wsId}` set
//   - Pin first widget   : pinned_widgets.length > 0
//
// Pas de table dediee : tout vient de signaux deja loades ailleurs (cache
// React Query reutilise via useQuery — pas de double fetch).

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useEntitlements } from '@/lib/use-entitlements'
import { useT, type StringKey } from '@/lib/i18n'
import { track } from '@/lib/tracking'

function dismissKey(wsId: string | undefined): string | null {
  return wsId ? `sa-activation-dismissed:${wsId}` : null
}

function lastConvKey(wsId: string | undefined): string | null {
  return wsId ? `sa-chat:last-conversation:${wsId}` : null
}

export default function ActivationProgress() {
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id
  const [dismissed, setDismissed] = useState(false)
  // Compteur force-reload pour relire localStorage apres navigation chat.
  const [hasConversation, setHasConversation] = useState(false)

  // Lit le dismiss persistant au mount.
  useEffect(() => {
    if (!workspaceId) return
    const k = dismissKey(workspaceId)
    if (k && typeof window !== 'undefined' && window.localStorage.getItem(k)) {
      setDismissed(true)
    }
    const lk = lastConvKey(workspaceId)
    if (lk && typeof window !== 'undefined' && window.localStorage.getItem(lk)) {
      setHasConversation(true)
    }
  }, [workspaceId])

  // Re-check apres navigation (event focus/storage). Permet d'updater quand
  // l'user revient sur une autre page apres avoir ouvert son 1er chat.
  useEffect(() => {
    if (!workspaceId) return
    function check() {
      const lk = lastConvKey(workspaceId)
      if (lk && typeof window !== 'undefined' && window.localStorage.getItem(lk)) {
        setHasConversation(true)
      }
    }
    window.addEventListener('focus', check)
    window.addEventListener('storage', check)
    return () => {
      window.removeEventListener('focus', check)
      window.removeEventListener('storage', check)
    }
  }, [workspaceId])

  const entitlementsQ = useEntitlements()
  const widgetsQ = useQuery({
    queryKey: ['pinned-widgets', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ widgets: unknown[] }>(`/api/v1/pinned-widgets?workspaceId=${workspaceId}`),
    staleTime: 60_000,
  })

  if (!workspaceId || dismissed) return null
  if (entitlementsQ.isLoading) return null

  const hasConnector = (entitlementsQ.data?.quotas?.connectors?.current ?? 0) > 0
  const hasPin = (widgetsQ.data?.widgets?.length ?? 0) > 0
  const steps = [
    {
      id: 'connect',
      done: hasConnector,
      labelKey: 'activation.step.connect' as StringKey,
      to: '/sources',
    },
    { id: 'ask', done: hasConversation, labelKey: 'activation.step.ask' as StringKey, to: '/chat' },
    { id: 'pin', done: hasPin, labelKey: 'activation.step.pin' as StringKey, to: '/chat' },
  ]
  const doneCount = steps.filter((s) => s.done).length

  // Tous faits → on dispose le banner automatiquement (avec persistance pour
  // ne plus jamais reapparaitre).
  if (doneCount === steps.length) {
    if (typeof window !== 'undefined' && workspaceId) {
      const k = dismissKey(workspaceId)
      if (k) window.localStorage.setItem(k, '1')
    }
    return null
  }

  function dismiss() {
    setDismissed(true)
    if (typeof window !== 'undefined' && workspaceId) {
      const k = dismissKey(workspaceId)
      if (k) window.localStorage.setItem(k, '1')
    }
    track('onboarding_dropped', { dismissed_at: doneCount })
  }

  const pct = (doneCount / steps.length) * 100
  const nextStep = steps.find((s) => !s.done)

  return (
    <div
      role="region"
      aria-label={t('activation.aria')}
      className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-gradient-to-r from-brand-blue-deep/5 to-brand-cyan/5 px-6 py-2"
    >
      {/* Progress ring textuel + bar */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-brand-blue-deep">
          {t('activation.label')}
        </span>
        <span className="font-mono text-[11px] text-text-2">
          {doneCount}/{steps.length}
        </span>
      </div>

      <div className="hidden h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-bg-3 sm:block">
        <div
          className="h-full rounded-full bg-brand-blue-deep transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Checkboxes inline */}
      <ul className="flex flex-1 items-center gap-3 overflow-x-auto">
        {steps.map((s) => (
          <li key={s.id}>
            <Link
              to={s.to}
              className={[
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] transition',
                s.done
                  ? 'text-brand-green'
                  : s.id === nextStep?.id
                    ? 'bg-brand-blue-deep/10 font-semibold text-brand-blue-deep hover:bg-brand-blue-deep/15'
                    : 'text-text-3 hover:text-text-1',
              ].join(' ')}
            >
              <span aria-hidden="true">{s.done ? '✓' : '○'}</span>
              <span>{t(s.labelKey)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={dismiss}
        aria-label={t('activation.dismiss')}
        title={t('activation.dismiss')}
        className="ml-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-text-3 hover:bg-bg-3 hover:text-text-1"
      >
        ✕
      </button>
    </div>
  )
}
