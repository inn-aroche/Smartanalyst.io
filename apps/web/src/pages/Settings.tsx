import { Link } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import CopyButton from '@/components/CopyButton'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

export default function SettingsPage() {
  const { state, logout } = useAuth()
  const t = useT()
  const user = state.user
  const workspace = state.workspaces[0]

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
            {t('settings.kicker')}
          </span>
          <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
            {t('settings.title')}
          </h1>
        </div>

        <Section title={t('settings.section.profile')}>
          <Field label={t('settings.field.fullName')} value={user?.full_name ?? '—'} />
          <Field label={t('common.email')} value={user?.email ?? '—'} />
          <Field label={t('settings.field.userId')} value={user?.id ?? '—'} mono />
        </Section>

        <Section title={t('settings.section.workspace')}>
          <Field label={t('settings.field.workspaceName')} value={workspace?.name ?? '—'} />
          <Field label={t('settings.field.workspaceId')} value={workspace?.id ?? '—'} mono />
          <Field label={t('settings.field.yourRole')} value={workspace?.role ?? '—'} />
        </Section>

        <Section title={t('settings.section.tracking')}>
          <div className="sa-card flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
              {t('tracking.writeKey.label')}
            </div>
            <div className="text-xs text-text-2">{t('tracking.writeKey.body')}</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border border-border bg-bg-1 px-3 py-2 font-mono text-xs text-text-1">
                {workspace?.id ?? '—'}
              </code>
              <CopyButton value={workspace?.id ?? ''} size="sm" />
            </div>
          </div>

          <div className="sa-card flex flex-col gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                {t('tracking.snippet.title')}
              </div>
              <div className="mt-1 text-xs text-text-2">{t('tracking.snippet.body')}</div>
            </div>
            <div className="overflow-hidden rounded-md border border-border bg-bg-1">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                  HTML
                </span>
                <CopyButton value={buildSettingsSnippet(workspace?.id ?? '')} size="sm" />
              </div>
              <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-text-1">
                <code>{buildSettingsSnippet(workspace?.id ?? '')}</code>
              </pre>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/tracking/install"
                className="sa-btn sa-btn-primary !text-xs"
              >
                {t('tracking.cta.viewInstall')} →
              </Link>
              <Link to="/live" className="sa-btn !text-xs">
                {t('tracking.cta.viewLive')}
              </Link>
            </div>
          </div>
        </Section>

        <Section title={t('settings.section.language')}>
          <div className="sa-card flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-text-1">
                {t('locale.label')}
              </div>
              <div className="mt-1 text-sm text-text-2">
                {t('settings.language.body')}
              </div>
            </div>
            <LocaleSwitcher variant="full" align="right" />
          </div>
        </Section>

        <Section title={t('settings.section.security')}>
          <div className="sa-card flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-text-1">
                {t('settings.password.title')}
              </div>
              <div className="mt-1 text-sm text-text-2">
                {t('settings.password.body')}
              </div>
            </div>
            <button
              type="button"
              className="sa-btn shrink-0 !text-xs"
              disabled
              title={t('nav.soon')}
            >
              {t('settings.password.button')}
            </button>
          </div>
        </Section>

        <Section title={t('settings.section.session')}>
          <div className="sa-card flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-text-1">
                {t('settings.signOut.title')}
              </div>
              <div className="mt-1 text-sm text-text-2">
                {t('settings.signOut.body')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="sa-btn shrink-0 !text-xs"
            >
              {t('common.signOut')}
            </button>
          </div>
        </Section>

        <Section title={t('settings.section.dangerZone')}>
          <div className="sa-card flex items-center justify-between gap-4 border-brand-red/20">
            <div>
              <div className="text-sm font-semibold text-text-1">
                {t('settings.delete.title')}
              </div>
              <div className="mt-1 text-sm text-text-2">
                {t('settings.delete.body')}
              </div>
            </div>
            <button
              type="button"
              className="sa-btn shrink-0 border-brand-red/40 !text-xs text-brand-red"
              disabled
              title={t('nav.soon')}
            >
              {t('settings.delete.button')}
            </button>
          </div>
        </Section>
      </div>
    </AppLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-widest text-text-3">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function buildSettingsSnippet(writeKey: string): string {
  const key = writeKey || 'YOUR_WRITE_KEY'
  return `<script async src="https://smartanalyst.io/sa.js"></script>
<script>Smartanalyst('init', { writeKey: '${key}' });</script>`
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="sa-card flex flex-col gap-1">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {label}
      </div>
      <div
        className={`${
          mono ? 'font-mono text-xs' : 'text-sm'
        } break-all text-text-1`}
      >
        {value}
      </div>
    </div>
  )
}
