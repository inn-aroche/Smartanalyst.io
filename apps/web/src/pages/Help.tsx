// Help — page de documentation user (next-steps D).
//
// Documentation discoverable, accessible depuis la sidebar (link "Aide").
// Sections : premiers pas, sources, chat copilote, rapports, veilles, widgets,
// quotas/plans, raccourcis. Volontairement statique (JSX) plutot que markdown
// dynamique : le contenu evolue lentement et la perf vaut le coup (zero parser).

import { Link } from 'react-router-dom'

import AppLayout, { Topbar } from '@/components/AppLayout'
import { useT } from '@/lib/i18n'

export default function HelpPage() {
  const t = useT()
  return (
    <AppLayout>
      <Topbar title={t('help.topbar.title')} subtitle={t('help.topbar.subtitle')} />

      <div className="px-8 py-8 lg:px-10">
        <div className="mx-auto flex max-w-3xl gap-8 lg:gap-12">
          {/* Sommaire sticky (desktop seulement) */}
          <nav
            aria-label={t('help.toc.aria')}
            className="sticky top-24 hidden h-max w-48 flex-shrink-0 lg:block"
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
              {t('help.toc.title')}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
              {TOC.map((s) => (
                <li key={s.anchor}>
                  <a
                    href={`#${s.anchor}`}
                    className="block rounded px-1.5 py-0.5 text-text-2 hover:bg-card-hover hover:text-text-1"
                  >
                    {t(s.titleKey)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contenu */}
          <article className="min-w-0 flex-1">
            <header className="mb-8">
              <span className="font-mono text-[10px] uppercase tracking-widest text-brand-cyan">
                {t('help.eyebrow')}
              </span>
              <h1 className="mt-2 font-head text-3xl font-bold tracking-[-0.02em] text-text-1">
                {t('help.title')}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-text-2">{t('help.intro')}</p>
            </header>

            <Section anchor="getting-started" title={t('help.gs.title')}>
              <p>{t('help.gs.body1')}</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>
                  <Link to="/sources" className="text-brand-blue-deep hover:underline">
                    {t('help.gs.step1')}
                  </Link>{' '}
                  — {t('help.gs.step1.sub')}
                </li>
                <li>
                  <Link to="/" className="text-brand-blue-deep hover:underline">
                    {t('help.gs.step2')}
                  </Link>{' '}
                  — {t('help.gs.step2.sub')}
                </li>
                <li>
                  <Link to="/chat" className="text-brand-blue-deep hover:underline">
                    {t('help.gs.step3')}
                  </Link>{' '}
                  — {t('help.gs.step3.sub')}
                </li>
              </ol>
            </Section>

            <Section anchor="sources" title={t('help.sources.title')}>
              <p>{t('help.sources.body')}</p>
              <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SOURCES.map((s) => (
                  <li
                    key={s.key}
                    className="rounded-md border border-border bg-bg-2 px-3 py-2 text-[13px]"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wider text-text-3">
                      {s.key}
                    </span>
                    <div className="mt-0.5 text-text-1">{t(s.labelKey)}</div>
                  </li>
                ))}
              </ul>
              <Callout>{t('help.sources.callout')}</Callout>
            </Section>

            <Section anchor="chat" title={t('help.chat.title')}>
              <p>{t('help.chat.body')}</p>
              <h3 className="mt-5 font-head text-base font-semibold text-text-1">
                {t('help.chat.outputs.title')}
              </h3>
              <ul className="mt-2 space-y-2">
                {OUTPUTS.map((o) => (
                  <li key={o.key} className="flex items-start gap-2.5">
                    <span aria-hidden="true" className="mt-0.5 text-base leading-none">
                      {o.icon}
                    </span>
                    <div>
                      <strong className="text-text-1">{t(o.titleKey)}</strong>
                      <span className="text-text-2"> — {t(o.descKey)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <h3 className="mt-5 font-head text-base font-semibold text-text-1">
                {t('help.chat.actions.title')}
              </h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] text-text-2">
                <li>
                  <strong>📥 {t('help.chat.actions.excel')}</strong> —{' '}
                  {t('help.chat.actions.excel.desc')}
                </li>
                <li>
                  <strong>📌 {t('help.chat.actions.pin')}</strong> —{' '}
                  {t('help.chat.actions.pin.desc')}
                </li>
                <li>
                  <strong>🎴 {t('help.chat.actions.slides')}</strong> —{' '}
                  {t('help.chat.actions.slides.desc')}
                </li>
                <li>
                  <strong>🔁 {t('help.chat.actions.rerun')}</strong> —{' '}
                  {t('help.chat.actions.rerun.desc')}
                </li>
              </ul>
            </Section>

            <Section anchor="reports" title={t('help.reports.title')}>
              <p>{t('help.reports.body')}</p>
              <Callout>{t('help.reports.callout')}</Callout>
            </Section>

            <Section anchor="veilles" title={t('help.watches.title')}>
              <p>{t('help.watches.body')}</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-text-2">
                <li>{t('help.watches.op.drops_below')}</li>
                <li>{t('help.watches.op.rises_above')}</li>
                <li>{t('help.watches.op.changes_by_pct')}</li>
                <li>{t('help.watches.op.any_change')}</li>
              </ul>
            </Section>

            <Section anchor="pinned" title={t('help.pinned.title')}>
              <p>{t('help.pinned.body')}</p>
            </Section>

            <Section anchor="plans" title={t('help.plans.title')}>
              <div className="mt-2 overflow-x-auto rounded-brief border border-border">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="bg-bg-2">
                    <tr>
                      <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-text-3">
                        {t('help.plans.col.feature')}
                      </th>
                      <th className="px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-text-3">
                        Free
                      </th>
                      <th className="px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-text-3">
                        Starter
                      </th>
                      <th className="px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-text-3">
                        Pro
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <PlanRow label={t('help.plans.row.price')} f="0 €" s="29 €" p="59 €" mono />
                    <PlanRow label={t('help.plans.row.connectors')} f="1" s="3" p="∞" />
                    <PlanRow label={t('help.plans.row.insights')} f="3" s="100" p="∞" />
                    <PlanRow label={t('help.plans.row.reports')} f="·" s="✓" p="✓" />
                    <PlanRow label={t('help.plans.row.deep')} f="·" s="·" p="✓" />
                    <PlanRow label={t('help.plans.row.pin')} f="·" s="·" p="✓" />
                    <PlanRow label={t('help.plans.row.slides')} f="·" s="·" p="✓" />
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[13px] text-text-3">
                {t('help.plans.foot')}{' '}
                <Link to="/settings" className="text-brand-blue-deep hover:underline">
                  Settings → Billing
                </Link>
                .
              </p>
            </Section>

            <Section anchor="shortcuts" title={t('help.shortcuts.title')}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ['Cmd / Ctrl + K', t('help.shortcuts.search')],
                  ['Cmd / Ctrl + Enter', t('help.shortcuts.send')],
                  ['Esc', t('help.shortcuts.close')],
                ].map(([combo, label]) => (
                  <li
                    key={combo}
                    className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-bg-2 px-3 py-2 text-[13px]"
                  >
                    <span className="text-text-2">{label}</span>
                    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-text-1">
                      {combo}
                    </kbd>
                  </li>
                ))}
              </ul>
            </Section>

            <Section anchor="contact" title={t('help.contact.title')}>
              <p>
                {t('help.contact.body')}{' '}
                <a
                  href="mailto:support@smartanalyst.io"
                  className="text-brand-blue-deep hover:underline"
                >
                  support@smartanalyst.io
                </a>
                .
              </p>
            </Section>
          </article>
        </div>
      </div>
    </AppLayout>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────

function Section({
  anchor,
  title,
  children,
}: {
  anchor: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      id={anchor}
      className="mb-10 scroll-mt-24 border-b border-border/60 pb-8 last:border-0"
    >
      <h2 className="mb-4 font-head text-xl font-semibold tracking-[-0.01em] text-text-1">
        {title}
      </h2>
      <div className="text-[14.5px] leading-relaxed text-text-2 [&_p]:mb-2">{children}</div>
    </section>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-md border-l-3 border-l-brand-cyan bg-brand-cyan/5 px-3 py-2 text-[13px] text-text-2">
      💡 {children}
    </div>
  )
}

function PlanRow({
  label,
  f,
  s,
  p,
  mono,
}: {
  label: string
  f: string
  s: string
  p: string
  mono?: boolean
}) {
  const cellClass = mono
    ? 'px-3 py-2 text-center font-mono text-[12.5px] text-text-1'
    : 'px-3 py-2 text-center text-[13px] text-text-1'
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 text-[13px] text-text-2">{label}</td>
      <td className={cellClass}>{f}</td>
      <td className={cellClass}>{s}</td>
      <td className={cellClass}>{p}</td>
    </tr>
  )
}

// ─── Static catalogues (i18n via t()) ──────────────────────────────────

import type { StringKey } from '@/lib/i18n'

const TOC: Array<{ anchor: string; titleKey: StringKey }> = [
  { anchor: 'getting-started', titleKey: 'help.gs.title' },
  { anchor: 'sources', titleKey: 'help.sources.title' },
  { anchor: 'chat', titleKey: 'help.chat.title' },
  { anchor: 'reports', titleKey: 'help.reports.title' },
  { anchor: 'veilles', titleKey: 'help.watches.title' },
  { anchor: 'pinned', titleKey: 'help.pinned.title' },
  { anchor: 'plans', titleKey: 'help.plans.title' },
  { anchor: 'shortcuts', titleKey: 'help.shortcuts.title' },
  { anchor: 'contact', titleKey: 'help.contact.title' },
]

const SOURCES: Array<{ key: string; labelKey: StringKey }> = [
  { key: 'GA4', labelKey: 'help.sources.ga4' },
  { key: 'Meta Ads', labelKey: 'help.sources.meta_ads' },
  { key: 'Google Ads', labelKey: 'help.sources.google_ads' },
  { key: 'Stripe', labelKey: 'help.sources.stripe' },
  { key: 'Search Console', labelKey: 'help.sources.search_console' },
  { key: 'SmartTag', labelKey: 'help.sources.smarttag' },
]

const OUTPUTS: Array<{ key: string; icon: string; titleKey: StringKey; descKey: StringKey }> = [
  { key: 'kpi', icon: '🔢', titleKey: 'help.chat.out.kpi', descKey: 'help.chat.out.kpi.desc' },
  {
    key: 'chart',
    icon: '📊',
    titleKey: 'help.chat.out.chart',
    descKey: 'help.chat.out.chart.desc',
  },
  {
    key: 'table',
    icon: '📋',
    titleKey: 'help.chat.out.table',
    descKey: 'help.chat.out.table.desc',
  },
  {
    key: 'compare',
    icon: '🆚',
    titleKey: 'help.chat.out.compare',
    descKey: 'help.chat.out.compare.desc',
  },
  {
    key: 'funnel',
    icon: '⏬',
    titleKey: 'help.chat.out.funnel',
    descKey: 'help.chat.out.funnel.desc',
  },
  {
    key: 'dashboard',
    icon: '🗂',
    titleKey: 'help.chat.out.dashboard',
    descKey: 'help.chat.out.dashboard.desc',
  },
]
