// Onboarding du Smart tag, affiché tant qu'aucun event n'a été reçu pour
// le workspace. Une fois le 1er event détecté (poll /smarttag/status),
// l'orchestrateur Live.tsx bascule sur le dashboard.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import CopyButton from '@/components/CopyButton'
import { apiFetch } from '@/lib/api'
import { type StringKey, useT } from '@/lib/i18n'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 15 // 15 × 2s = 30s

type VerifyState = 'idle' | 'checking' | 'success' | 'timeout'

type Props = {
  workspaceId: string
  onInstalled: () => void
}

export default function LiveOnboarding({ workspaceId, onInstalled }: Props) {
  const t = useT()
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const pollIntervalRef = useRef<number | null>(null)
  const pollAttemptsRef = useRef(0)

  const snippet = buildSnippet(workspaceId)

  // Cleanup à l'unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current)
    }
  }, [])

  const verifyInstall = useCallback(() => {
    setVerifyState('checking')
    pollAttemptsRef.current = 0
    if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = window.setInterval(async () => {
      pollAttemptsRef.current++
      try {
        const status = await apiFetch<{ installed: boolean; lastEventAt: number | null }>(
          `/api/v1/smarttag/status?workspaceId=${workspaceId}`,
        )
        if (status.installed) {
          if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current)
          setVerifyState('success')
          // Petite pause pour que l'utilisateur voie le ✓ avant de basculer
          window.setTimeout(() => onInstalled(), 1200)
          return
        }
      } catch {
        /* poll fail = on retry au prochain tick */
      }
      if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) {
        if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current)
        setVerifyState('timeout')
      }
    }, POLL_INTERVAL_MS)
  }, [workspaceId, onInstalled])

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* ─── Hero ─── */}
      <div className="mb-12 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
          {t('live.onboarding.kicker')}
        </span>
        <h1 className="mt-3 font-head text-4xl font-bold text-text-1 sm:text-5xl">
          {t('live.onboarding.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-text-2">
          {t('live.onboarding.subtitle')}
        </p>
      </div>

      {/* ─── Why cards ─── */}
      <div className="mb-12">
        <h2 className="mb-4 text-center font-mono text-[10px] uppercase tracking-widest text-text-3">
          {t('live.onboarding.why.title')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <WhyCard
            icon="◉"
            title={t('live.onboarding.why.analytics.title')}
            body={t('live.onboarding.why.analytics.body')}
          />
          <WhyCard
            icon="◇"
            title={t('live.onboarding.why.audit.title')}
            body={t('live.onboarding.why.audit.body')}
          />
          <WhyCard
            icon="◐"
            title={t('live.onboarding.why.privacy.title')}
            body={t('live.onboarding.why.privacy.body')}
          />
        </div>
      </div>

      {/* ─── Steps ─── */}
      <div className="space-y-8">
        {/* Step 1 — Copy */}
        <Step number={1} title={t('live.onboarding.step1.title')} body={t('live.onboarding.step1.body')}>
          <div className="overflow-hidden rounded-md border border-border bg-bg-1">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                HTML
              </span>
              <CopyButton value={snippet} size="sm" />
            </div>
            <pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-relaxed text-text-1">
              <code>{snippet}</code>
            </pre>
          </div>
        </Step>

        {/* Step 2 — Paste */}
        <Step number={2} title={t('live.onboarding.step2.title')} body={t('live.onboarding.step2.body')}>
          <div className="flex flex-wrap gap-2">
            <Link to="/tracking/install" className="sa-btn !text-xs">
              {t('live.onboarding.step2.cta')} →
            </Link>
          </div>
        </Step>

        {/* Step 3 — Verify */}
        <Step number={3} title={t('live.onboarding.step3.title')} body={t('live.onboarding.step3.body')}>
          <VerifyBlock state={verifyState} onClick={verifyInstall} t={t} />
        </Step>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

function WhyCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="sa-card">
      <div className="mb-2 font-mono text-2xl text-brand-cyan">{icon}</div>
      <div className="font-head text-sm font-semibold text-text-1">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-text-2">{body}</div>
    </div>
  )
}

function Step({
  number,
  title,
  body,
  children,
}: {
  number: number
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-cyan/30 bg-brand-cyan/10 font-head text-base font-bold text-brand-cyan">
          {number}
        </div>
        <div className="flex-1">
          <h2 className="font-head text-xl font-semibold text-text-1">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-text-2">{body}</p>
        </div>
      </div>
      <div className="ml-14">{children}</div>
    </section>
  )
}

function VerifyBlock({
  state,
  onClick,
  t,
}: {
  state: VerifyState
  onClick: () => void
  t: (key: StringKey) => string
}) {
  if (state === 'success') {
    return (
      <div className="sa-card border-brand-green/30 bg-brand-green/10 text-center text-sm text-brand-green">
        <div className="font-head text-2xl">✓</div>
        <div className="mt-1">{t('live.onboarding.step3.success')}</div>
      </div>
    )
  }
  if (state === 'checking') {
    return (
      <div className="sa-card flex items-center gap-3 text-sm text-text-2">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-cyan" />
        <span>{t('live.onboarding.step3.checking')}</span>
      </div>
    )
  }
  if (state === 'timeout') {
    return (
      <div className="sa-card border-brand-red/30 bg-brand-red/5 text-sm">
        <div className="text-brand-red">{t('live.onboarding.step3.timeout')}</div>
        <button
          type="button"
          onClick={onClick}
          className="sa-btn mt-3 !text-xs"
        >
          {t('live.onboarding.step3.retry')}
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="sa-btn sa-btn-primary inline-flex items-center gap-2 !text-sm"
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
      {t('live.onboarding.step3.button')}
    </button>
  )
}

// ─── Snippet builder ──────────────────────────────────────────────────────

function buildSnippet(writeKey: string): string {
  const key = writeKey || 'YOUR_WRITE_KEY'
  return `<script async src="https://smartanalyst.io/sa.js"></script>
<script>Smartanalyst('init', { writeKey: '${key}' });</script>`
}
