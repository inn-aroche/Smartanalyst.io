import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import CopyButton from '@/components/CopyButton'
import { useAuth } from '@/lib/auth'
import { type StringKey, useT } from '@/lib/i18n'

// Les CMS supportés dans l'onglet de l'étape 2. Garder l'ordre déclaratif —
// c'est l'ordre d'affichage. Pour en ajouter un, ajoute une entrée ici + 2
// strings install.step2.tab.<id> et install.step2.<id>.body.
const PLATFORMS = ['html', 'wordpress', 'shopify', 'webflow', 'ghost'] as const
type Platform = (typeof PLATFORMS)[number]

export default function TrackingInstallPage() {
  const t = useT()
  const { state } = useAuth()
  const writeKey = state.workspaces[0]?.id ?? ''
  const [activePlatform, setActivePlatform] = useState<Platform>('html')

  const snippet = useMemo(() => buildSnippet(writeKey), [writeKey])

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-10">
          <Link
            to="/settings"
            className="font-mono text-[11px] uppercase tracking-widest text-text-3 hover:text-text-2"
          >
            ← {t('nav.settings')}
          </Link>
          <span className="ml-3 font-mono text-xs uppercase tracking-widest text-brand-cyan">
            {t('install.kicker')}
          </span>
          <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
            {t('install.title')}
          </h1>
          <p className="mt-3 max-w-2xl text-text-2">{t('install.subtitle')}</p>
        </div>

        {/* ─── Step 1 ─── */}
        <Step number={1} title={t('install.step1.title')} body={t('install.step1.body')}>
          <SnippetBlock snippet={snippet} />
        </Step>

        {/* ─── Step 2 ─── */}
        <Step number={2} title={t('install.step2.title')} body={t('install.step2.body')}>
          <div className="sa-card !p-0 overflow-hidden">
            <div className="flex flex-wrap border-b border-border" role="tablist">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={activePlatform === p}
                  onClick={() => setActivePlatform(p)}
                  className={[
                    'px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors',
                    activePlatform === p
                      ? 'border-b-2 border-brand-cyan text-text-1'
                      : 'border-b-2 border-transparent text-text-3 hover:text-text-2',
                  ].join(' ')}
                >
                  {t(`install.step2.tab.${p}` as StringKey)}
                </button>
              ))}
            </div>
            <div className="p-5">
              <p className="text-sm leading-relaxed text-text-2">
                {t(`install.step2.${activePlatform}.body` as StringKey)}
              </p>
            </div>
          </div>
        </Step>

        {/* ─── Step 3 ─── */}
        <Step number={3} title={t('install.step3.title')} body={t('install.step3.body')}>
          <Link
            to="/live"
            className="sa-btn sa-btn-primary inline-flex items-center gap-2 !text-sm"
          >
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-green" />
            {t('install.step3.cta')}
          </Link>
        </Step>

        {/* ─── FAQ ─── */}
        <section className="mt-16">
          <h2 className="mb-4 font-head text-sm font-semibold uppercase tracking-widest text-text-3">
            {t('install.faq.title')}
          </h2>
          <div className="flex flex-col gap-2">
            <FaqItem question={t('install.faq.q1')} answer={t('install.faq.a1')} />
            <FaqItem question={t('install.faq.q2')} answer={t('install.faq.a2')} />
            <FaqItem question={t('install.faq.q3')} answer={t('install.faq.a3')} />
            <FaqItem question={t('install.faq.q4')} answer={t('install.faq.a4')} />
            <FaqItem question={t('install.faq.q5')} answer={t('install.faq.a5')} />
          </div>
        </section>
      </div>
    </AppLayout>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────

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
    <section className="mb-10">
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

function SnippetBlock({ snippet }: { snippet: string }) {
  return (
    <div className="sa-card !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-bg-1 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
          HTML
        </span>
        <CopyButton value={snippet} size="sm" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-text-1">
        <code>{snippet}</code>
      </pre>
    </div>
  )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="sa-card group cursor-pointer">
      <summary className="flex items-center justify-between gap-3 text-sm font-semibold text-text-1 marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-text-3 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-text-2">{answer}</p>
    </details>
  )
}

// ─── Snippet builder ──────────────────────────────────────────────────────

function buildSnippet(writeKey: string): string {
  const key = writeKey || 'YOUR_WRITE_KEY'
  return `<!-- SmartAnalyst — analytics + live tag (1.5 KB gzipped, no cookies) -->
<script async src="https://smartanalyst.io/sa.js"></script>
<script>
  Smartanalyst('init', { writeKey: '${key}' });
</script>`
}
