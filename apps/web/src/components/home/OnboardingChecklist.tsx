import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { apiFetch } from '@/lib/api'
import { useT } from '@/lib/i18n'

// Clés localStorage : on persiste le dismissal manuel + le fait que l'user
// a cliqué "poser une question" (pas de signal backend pour ça en V1).
const DISMISS_KEY = 'sa.onboarding.dismissed.v1'
const ASKED_KEY = 'sa.onboarding.askedChat.v1'

function lsGet(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function lsSet(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* ignore */
  }
}

type Step = {
  key: string
  done: boolean
  titleKey:
    | 'onboarding.step.connect.title'
    | 'onboarding.step.tag.title'
    | 'onboarding.step.ask.title'
  bodyKey: 'onboarding.step.connect.body' | 'onboarding.step.tag.body' | 'onboarding.step.ask.body'
  ctaKey: 'onboarding.step.connect.cta' | 'onboarding.step.tag.cta' | 'onboarding.step.ask.cta'
  to: string
  onCta?: () => void
}

/**
 * Checklist d'accueil pour les nouveaux users : guide les 3 premières
 * actions. Pilotée par l'état réel (connecteur actif, tag installé). Se
 * cache si tout est fait ou si l'user a dismiss.
 */
export default function OnboardingChecklist({
  workspaceId,
  hasActiveConnector,
}: {
  workspaceId: string
  hasActiveConnector: boolean
}) {
  const t = useT()
  const [dismissed, setDismissed] = useState(() => lsGet(DISMISS_KEY))
  const [asked, setAsked] = useState(() => lsGet(ASKED_KEY))

  const tagStatus = useQuery({
    queryKey: ['smarttag', 'status', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ installed: boolean; lastEventAt: number | null }>(
        `/api/v1/smarttag/status?workspaceId=${workspaceId}`,
      ),
    staleTime: 60_000,
  })
  const tagInstalled = tagStatus.data?.installed ?? false

  const steps: Step[] = [
    {
      key: 'connect',
      done: hasActiveConnector,
      titleKey: 'onboarding.step.connect.title',
      bodyKey: 'onboarding.step.connect.body',
      ctaKey: 'onboarding.step.connect.cta',
      to: '/connectors',
    },
    {
      key: 'tag',
      done: tagInstalled,
      titleKey: 'onboarding.step.tag.title',
      bodyKey: 'onboarding.step.tag.body',
      ctaKey: 'onboarding.step.tag.cta',
      to: '/tracking/install',
    },
    {
      key: 'ask',
      done: asked,
      titleKey: 'onboarding.step.ask.title',
      bodyKey: 'onboarding.step.ask.body',
      ctaKey: 'onboarding.step.ask.cta',
      to: '/chat',
      onCta: () => {
        lsSet(ASKED_KEY)
        setAsked(true)
      },
    },
  ]

  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length

  // Caché si dismiss, ou si tout est fait. On attend le retour du tag status
  // pour éviter un flash (mais hasActiveConnector vient déjà du parent).
  if (dismissed || allDone) return null

  // Premier step non-fait = celui qu'on met en avant.
  const nextStep = steps.find((s) => !s.done)

  return (
    <div className="sa-card border-brand-cyan/25 bg-brand-cyan/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-brand-cyan">
            {t('onboarding.kicker')}
          </div>
          <h2 className="mt-1 font-head text-lg font-semibold text-text-1">
            {t('onboarding.title')}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            lsSet(DISMISS_KEY)
            setDismissed(true)
          }}
          className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-text-1"
          aria-label={t('onboarding.dismiss')}
        >
          {t('onboarding.dismiss')}
        </button>
      </div>

      {/* Barre de progression */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-2">
          <div
            className="h-full rounded-full bg-brand-cyan transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-text-3">
          {doneCount}/{steps.length}
        </span>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {steps.map((s) => {
          const isNext = s.key === nextStep?.key
          return (
            <li
              key={s.key}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                s.done
                  ? 'border-border bg-bg-2/30'
                  : isNext
                    ? 'border-brand-cyan/30 bg-card'
                    : 'border-border bg-bg-2/30'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  s.done ? 'bg-brand-green/20 text-brand-green' : 'border border-border text-text-3'
                }`}
              >
                {s.done ? '✓' : ''}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-medium ${s.done ? 'text-text-3 line-through' : 'text-text-1'}`}
                >
                  {t(s.titleKey)}
                </div>
                {!s.done && <div className="mt-0.5 text-xs text-text-2">{t(s.bodyKey)}</div>}
              </div>
              {!s.done && (
                <Link
                  to={s.to}
                  onClick={s.onCta}
                  className={`shrink-0 ${
                    isNext ? 'sa-btn sa-btn-primary' : 'sa-btn'
                  } !py-1.5 !text-xs`}
                >
                  {t(s.ctaKey)}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
