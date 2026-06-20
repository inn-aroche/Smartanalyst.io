import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import AppLayout, { useToast } from '@/components/AppLayout'
import BillingSection from '@/components/billing/BillingSection'
import CopyButton from '@/components/CopyButton'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import AiUsageBlock from '@/components/settings/AiUsageBlock'
import ApiKeysSection from '@/components/settings/ApiKeysSection'
import NotificationSettings from '@/components/settings/NotificationSettings'
import TeamSection from '@/components/settings/TeamSection'
import WhiteLabelSection from '@/components/settings/WhiteLabelSection'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openConsentPreferences } from '@/lib/consent'
import { useT } from '@/lib/i18n'

// Wrapper qui ne contient QUE <AppLayout> — pour que SettingsContent
// puisse utiliser `useToast` (qui exige d'être à l'intérieur du provider
// fourni par AppLayout).
export default function SettingsPage() {
  return (
    <AppLayout>
      <SettingsContent />
    </AppLayout>
  )
}

function SettingsContent() {
  const { state, logout } = useAuth()
  const t = useT()
  const toast = useToast()
  const user = state.user
  const workspace = state.workspaces[0]
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  // Ecoute la command palette pour scroller jusqu'a la section demandee.
  useEffect(() => {
    function onAction(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail === 'open-billing') scrollToSection('section-billing')
      else if (detail === 'invite-member') scrollToSection('section-team')
    }
    window.addEventListener('sa-palette:action', onAction)
    return () => window.removeEventListener('sa-palette:action', onAction)
  }, [])

  async function handleExport() {
    setExportError(null)
    setExporting(true)
    try {
      // apiFetch decode le JSON pour nous, on re-sérialise client-side pour
      // construire le fichier de download. La payload reste raisonnable
      // (metrics cap à 5000 lignes côté backend).
      const data = await apiFetch<unknown>('/api/v1/me/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `smartanalyst-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      // Si l'export ne contient que le squelette user (pas de connecteurs, pas
      // de métriques), l'user mérite d'être prévenu : sinon il télécharge un
      // fichier de 200 octets et se demande si quelque chose a foiré.
      if (isExportEmpty(data)) {
        toast.push(t('settings.export.empty'))
      } else {
        toast.push(t('settings.export.success'))
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export error')
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    setDeleteError(null)
    setDeleting(true)
    try {
      await apiFetch('/api/v1/me/delete', {
        method: 'POST',
        body: { confirm: 'DELETE MY ACCOUNT' },
      })
      // Données supprimées + token serveur invalidé. On force le logout local.
      // IMPORTANT : on AWAIT le logout — sinon en cas de réseau lent, l'user
      // peut naviguer ailleurs avant que le state auth soit clear, et se
      // retrouver dans un état zombie (token serveur invalidé mais session
      // React encore "connectée"). Le `finally` setDeleting attend la fin
      // du logout aussi pour éviter un flicker du bouton.
      await logout()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Delete error'
      setDeleteError(msg)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
          {t('settings.kicker')}
        </span>
        <h1 className="mt-2 font-head text-3xl font-bold text-text-1">{t('settings.title')}</h1>
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

      <Section title={t('settings.section.billing')} id="section-billing">
        <BillingSection />
      </Section>

      <Section title={t('settings.section.team')} id="section-team">
        <TeamSection />
      </Section>

      <Section title={t('settings.section.whiteLabel')}>
        <WhiteLabelSection />
      </Section>

      <Section title={t('settings.section.apiKeys')}>
        <ApiKeysSection />
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
            <Link to="/tracking/install" className="sa-btn sa-btn-primary !text-xs">
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
            <div className="text-sm font-semibold text-text-1">{t('locale.label')}</div>
            <div className="mt-1 text-sm text-text-2">{t('settings.language.body')}</div>
          </div>
          <LocaleSwitcher variant="full" align="right" />
        </div>
      </Section>

      <Section title={t('settings.section.privacy')}>
        <div className="sa-card flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-text-1">{t('settings.privacy.title')}</div>
            <div className="mt-1 text-sm text-text-2">{t('settings.privacy.body')}</div>
          </div>
          <button
            type="button"
            onClick={() => openConsentPreferences()}
            className="sa-btn shrink-0 !text-xs"
          >
            {t('settings.privacy.button')}
          </button>
        </div>
      </Section>

      {workspace?.id && (
        <Section title={t('settings.section.aiUsage')}>
          <AiUsageBlock workspaceId={workspace.id} />
        </Section>
      )}

      {workspace?.id && (
        <Section title={t('settings.section.notifications')}>
          <NotificationSettings workspaceId={workspace.id} />
        </Section>
      )}

      <Section title={t('settings.section.security')}>
        <div className="sa-card flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-text-1">{t('settings.password.title')}</div>
            <div className="mt-1 text-sm text-text-2">{t('settings.password.body')}</div>
          </div>
          <button type="button" className="sa-btn shrink-0 !text-xs" disabled title={t('nav.soon')}>
            {t('settings.password.button')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.section.session')}>
        <div className="sa-card flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-text-1">{t('settings.signOut.title')}</div>
            <div className="mt-1 text-sm text-text-2">{t('settings.signOut.body')}</div>
          </div>
          <button type="button" onClick={() => void logout()} className="sa-btn shrink-0 !text-xs">
            {t('common.signOut')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.section.data')}>
        <div className="sa-card flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-text-1">{t('settings.export.title')}</div>
            <div className="mt-1 text-sm text-text-2">{t('settings.export.body')}</div>
            {exportError && (
              <div className="mt-2 rounded-md border border-brand-red/30 bg-brand-red/10 px-2 py-1 text-xs text-brand-red">
                {exportError}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="sa-btn shrink-0 !text-xs disabled:opacity-60"
          >
            {exporting ? t('settings.export.busy') : t('settings.export.button')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.section.dangerZone')}>
        <div className="sa-card flex flex-col gap-3 border-brand-red/20">
          <div>
            <div className="text-sm font-semibold text-text-1">{t('settings.delete.title')}</div>
            <div className="mt-1 text-sm text-text-2">{t('settings.delete.body')}</div>
            <p className="mt-2 text-xs text-text-3">{t('settings.delete.confirmHint')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
              className="sa-input font-mono text-xs"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting || confirmText !== 'DELETE MY ACCOUNT'}
              className="sa-btn shrink-0 border-brand-red/40 !text-xs text-brand-red disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? t('settings.delete.busy') : t('settings.delete.button')}
            </button>
          </div>
          {deleteError && (
            <div className="rounded-md border border-brand-red/30 bg-brand-red/10 px-2 py-1 text-xs text-brand-red">
              {deleteError}
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
  id,
}: {
  title: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-widest text-text-3">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // Highlight visuel court (3s) pour signaler ou on a atterri.
  el.classList.add('ring-2', 'ring-brand-cyan/40', 'rounded-xl')
  setTimeout(() => el.classList.remove('ring-2', 'ring-brand-cyan/40', 'rounded-xl'), 2400)
}

function buildSettingsSnippet(writeKey: string): string {
  const key = writeKey || 'YOUR_WRITE_KEY'
  return `<script async src="https://smartanalyst.io/sa.js"></script>
<script>Smartanalyst('init', { writeKey: '${key}' });</script>`
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="sa-card flex flex-col gap-1">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">{label}</div>
      <div className={`${mono ? 'font-mono text-xs' : 'text-sm'} break-all text-text-1`}>
        {value}
      </div>
    </div>
  )
}

/**
 * Détecte un export "vide" : workspace sans connecteur ET sans métrique. Le
 * fichier contient quand même les infos user/workspace, mais aucune donnée
 * business — on prévient l'user pour éviter l'effet "le bouton est cassé ?".
 *
 * On garde la détection volontairement défensive (tous les champs optionnels)
 * pour ne pas péter si le backend change le shape de l'export.
 */
function isExportEmpty(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  const connectors = Array.isArray(d.connectors) ? d.connectors : null
  const metrics = Array.isArray(d.metrics) ? d.metrics : null
  if (connectors === null && metrics === null) return false
  return (connectors?.length ?? 0) === 0 && (metrics?.length ?? 0) === 0
}
