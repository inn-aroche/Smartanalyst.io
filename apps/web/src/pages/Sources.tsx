// Sources — fondation de l'analyse (handoff Claude Design §3.7, SourcesView).
// 2 onglets : Connecteurs live · Librairie de fichiers.
//
// Max-840px centré. Reprend les deux endpoints existants :
//   - /api/v1/connectors          : connecteurs du workspace
//   - /api/v1/connectors/catalog  : providers disponibles à la connexion
//   - /api/v1/files               : librairie de fichiers
//   - /api/v1/files/upload-url    : upload (créé en arrière-plan)
//   - /api/v1/files/:id/download  : URL signée
//
// Les modales d'ajout fines vivent dans la page /connectors existante —
// cette page est volontairement la "vue catalogue + état" du brief V2.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import AppLayout, { Topbar, useToast } from '@/components/AppLayout'
import ConnectorLogo from '@/components/connectors/ConnectorLogo'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { ConnectorDef } from '@/lib/connectors'
import { useLocale, useT } from '@/lib/i18n'

type WorkspaceConnector = {
  id: string
  source: string
  status: 'active' | 'expired' | 'error' | 'disconnected'
  account_name: string | null
  last_synced_at: string | null
}

type SaFile = {
  id: string
  filename: string
  mime_type: string
  size_bytes: number | null
  created_at: string
}

type Tab = 'connectors' | 'library'

export default function SourcesPage() {
  const t = useT()
  const navigate = useNavigate()
  const { state } = useAuth()
  const workspace = state.workspaces[0]
  const wsId = workspace?.id ?? ''
  const [tab, setTab] = useState<Tab>('connectors')

  return (
    <AppLayout>
      <Topbar
        title={t('sources.topbar.title')}
        subtitle={
          workspace ? `${workspace.name} · ${t('sources.subtitle')}` : t('sources.subtitle')
        }
        rightChip={
          <span className="sa-chip bg-brand-green/10 text-brand-green">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
            {t('nav.dataUpToDate')}
          </span>
        }
        primaryAction={{ label: t('nav.askQuestion'), onClick: () => navigate('/chat') }}
      />

      <div className="px-8 py-8 lg:px-10">
        <div className="mx-auto max-w-[840px]">
          {/* Hero intro */}
          <header className="mb-5">
            <h2 className="mb-1.5 font-head text-2xl font-bold tracking-[-0.02em] text-text-1">
              {t('sources.title')}
            </h2>
            <p className="max-w-[560px] text-[14.5px] leading-[1.6] text-text-2">
              {t('sources.intro')}
            </p>
          </header>

          {/* Tabs segmented */}
          <div className="mb-6 inline-flex gap-1.5 rounded-[12px] bg-bg-3 p-1.5">
            <SegBtn active={tab === 'connectors'} onClick={() => setTab('connectors')}>
              {t('sources.tab.connectors')}
            </SegBtn>
            <SegBtn active={tab === 'library'} onClick={() => setTab('library')}>
              {t('sources.tab.library')}
            </SegBtn>
          </div>

          {tab === 'connectors' ? <ConnectorsTab wsId={wsId} /> : <LibraryTab wsId={wsId} />}
        </div>
      </div>
    </AppLayout>
  )
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[8px] px-4.5 py-2 text-[13px] font-semibold transition-all',
        active ? 'bg-card text-text-1 shadow-card' : 'bg-transparent text-text-2 hover:text-text-1',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── Connectors tab ──────────────────────────────────────────────────────

function ConnectorsTab({ wsId }: { wsId: string }) {
  const t = useT()
  const navigate = useNavigate()
  const myQ = useQuery({
    queryKey: ['connectors', 'list', wsId],
    enabled: !!wsId,
    queryFn: () =>
      apiFetch<{ connectors: WorkspaceConnector[] }>(`/api/v1/connectors?workspaceId=${wsId}`),
    staleTime: 30_000,
  })
  const catalogQ = useQuery({
    queryKey: ['connectors', 'catalog'],
    queryFn: () => apiFetch<{ catalog: ConnectorDef[] }>('/api/v1/connectors/catalog'),
    staleTime: 5 * 60_000,
  })

  const mine = myQ.data?.connectors ?? []
  const catalog = catalogQ.data?.catalog ?? []

  // Compteurs
  const active = mine.filter((c) => c.status === 'active').length
  const expired = mine.filter((c) => c.status === 'expired' || c.status === 'error').length

  // Suggestions = providers available pas encore connectés (max 6).
  const mySources = new Set(mine.map((c) => c.source))
  const suggestions = catalog
    .filter((p) => p.status === 'available' && !mySources.has(p.source))
    .slice(0, 6)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="sa-chip bg-brand-green/10 text-brand-green">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
          {t('sources.counters.active', { n: active })}
        </span>
        {expired > 0 && (
          <span className="sa-chip bg-brand-amber/10 text-brand-amber">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />
            {t('sources.counters.reconnect', { n: expired })}
          </span>
        )}
        <button
          type="button"
          onClick={() => navigate('/connectors')}
          className="sa-btn sa-btn-primary ml-auto !text-[13px]"
        >
          + {t('sources.addSource')}
        </button>
      </div>

      {myQ.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[100px] animate-pulse rounded-brief border border-border bg-card"
            />
          ))}
        </div>
      ) : mine.length === 0 ? (
        <EmptyConnectors />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mine.map((c) => (
            <ConnectorCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <div className="sa-eyebrow mt-7">{t('sources.recommended')}</div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {suggestions.map((s) => (
              <button
                key={s.source}
                type="button"
                onClick={() => navigate('/connectors')}
                className="flex items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-border-bright hover:shadow-card"
              >
                <ConnectorLogo source={s.source} size={32} radius={9} />
                <span className="flex-1 truncate text-[13px] font-medium text-text-1">
                  {s.name}
                </span>
                <span className="text-[17px] leading-none text-brand-blue-deep">＋</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function ConnectorCard({ c }: { c: WorkspaceConnector }) {
  const t = useT()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const expired = c.status === 'expired' || c.status === 'error'
  const lastSync = c.last_synced_at
    ? formatRelative(c.last_synced_at, locale)
    : t('sources.neverSynced')
  const providerName = humanizeSource(c.source)

  return (
    <div
      className={[
        'flex items-center gap-3.5 rounded-brief border bg-card p-4 shadow-card',
        expired ? 'border-brand-amber/40' : 'border-border',
      ].join(' ')}
    >
      <ConnectorLogo source={c.source} size={44} />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold text-text-1">{providerName}</div>
        <div className="mb-1.5 truncate text-[12px] text-text-3">{c.account_name ?? '—'}</div>
        <span
          className={`sa-chip text-[11px] ${expired ? 'bg-brand-amber/10 text-brand-amber' : 'bg-brand-green/10 text-brand-green'}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {expired
            ? `${t('sources.status.expired')} · ${lastSync}`
            : `${t('sources.status.synced')} · ${lastSync}`}
        </span>
      </div>
      {expired && (
        <button
          type="button"
          onClick={() => navigate('/connectors')}
          className="sa-btn sa-btn-primary flex-shrink-0 !text-[12.5px]"
        >
          {t('sources.reconnect')}
        </button>
      )}
    </div>
  )
}

function EmptyConnectors() {
  const t = useT()
  const navigate = useNavigate()
  return (
    <div className="rounded-brief border border-dashed border-border bg-card/60 p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-dim text-2xl text-brand-blue-deep">
        ◈
      </div>
      <p className="mx-auto mb-4 max-w-[380px] text-sm text-text-2">
        {t('sources.empty.connectors')}
      </p>
      <button
        type="button"
        onClick={() => navigate('/connectors')}
        className="sa-btn sa-btn-primary !text-[13px]"
      >
        + {t('sources.addSource')}
      </button>
    </div>
  )
}

// ─── Library tab ─────────────────────────────────────────────────────────

function LibraryTab({ wsId }: { wsId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const toast = useToast()
  const filesQ = useQuery({
    queryKey: ['files', 'list', wsId],
    enabled: !!wsId,
    queryFn: () => apiFetch<{ files: SaFile[] }>(`/api/v1/files?workspaceId=${wsId}`),
    staleTime: 30_000,
  })

  // Upload via URL signée (handoff §3.7B). 2-step flow : createUploadUrl puis finalize.
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const ticket = await apiFetch<{ uploadUrl: string; path: string }>(
        '/api/v1/files/upload-url',
        {
          method: 'POST',
          body: { workspaceId: wsId, filename: file.name, mimeType: file.type },
        },
      )
      const resp = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`)
      await apiFetch('/api/v1/files/finalize', {
        method: 'POST',
        body: {
          workspaceId: wsId,
          path: ticket.path,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['files', 'list', wsId] })
      toast.push(t('sources.toast.uploaded'))
    },
    onError: (err: unknown) => {
      toast.push(err instanceof Error ? err.message : t('sources.toast.uploadFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/v1/files/${id}?workspaceId=${wsId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['files', 'list', wsId] })
      toast.push(t('sources.toast.deleted'))
    },
  })

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = '' // reset pour permettre re-upload même fichier
  }

  const files = filesQ.data?.files ?? []
  return (
    <>
      {/* Dropzone (input file caché derrière un label) */}
      <label className="mb-5 block cursor-pointer rounded-brief border-[1.5px] border-dashed border-border-bright bg-bg-2 p-8 text-center transition-colors hover:bg-bg-3">
        <input
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={onPickFile}
          disabled={uploadMutation.isPending}
        />
        <UploadIllus />
        <div className="mt-3 font-head text-[15px] font-bold text-text-1">
          {uploadMutation.isPending ? t('sources.dropzone.uploading') : t('sources.dropzone.title')}
        </div>
        <div className="mt-1 text-[13px] text-text-2">{t('sources.dropzone.body')}</div>
        <div className="mt-4 inline-flex sa-btn !text-[13px]">{t('sources.dropzone.browse')}</div>
      </label>

      {filesQ.isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[68px] animate-pulse rounded-brief border border-border bg-card"
            />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-brief border border-dashed border-border bg-card/60 p-8 text-center text-sm text-text-2">
          {t('sources.empty.files')}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {files.map((f) => (
            <FileRow key={f.id} f={f} onDelete={() => deleteMutation.mutate(f.id)} />
          ))}
        </div>
      )}
    </>
  )
}

function FileRow({ f, onDelete }: { f: SaFile; onDelete: () => void }) {
  const t = useT()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const type = fileType(f.filename, f.mime_type)
  return (
    <div className="flex items-center gap-3.5 rounded-brief border border-border bg-card p-3.5 shadow-card">
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: type.bg }}
      >
        <span
          className="font-mono text-[10px] font-semibold uppercase"
          style={{ color: type.color }}
        >
          {type.label}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-text-1">{f.filename}</div>
        <div className="font-mono text-[11px] text-text-3">
          {formatSize(f.size_bytes)} · {formatRelative(f.created_at, locale)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate(`/chat?file=${f.id}`)}
        className="sa-btn !text-[12.5px]"
      >
        {t('sources.askAbout')}
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={t('common.delete')}
        aria-label={t('common.delete')}
        className="text-text-3 hover:text-brand-red"
      >
        <span className="text-lg">⋯</span>
      </button>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

const FILE_TYPE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  xlsx: { bg: 'rgba(31,114,68,0.12)', color: '#1F7244', label: 'XLSX' },
  xls: { bg: 'rgba(31,114,68,0.12)', color: '#1F7244', label: 'XLS' },
  pdf: { bg: 'rgba(209,67,67,0.12)', color: '#D14343', label: 'PDF' },
  png: { bg: 'rgba(122,91,216,0.12)', color: '#7A5BD8', label: 'PNG' },
  jpg: { bg: 'rgba(122,91,216,0.12)', color: '#7A5BD8', label: 'JPG' },
  jpeg: { bg: 'rgba(122,91,216,0.12)', color: '#7A5BD8', label: 'JPG' },
  webp: { bg: 'rgba(122,91,216,0.12)', color: '#7A5BD8', label: 'IMG' },
  csv: { bg: 'rgba(46,139,158,0.12)', color: '#2E8B9E', label: 'CSV' },
}

function fileType(filename: string, _mime: string) {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  return FILE_TYPE_COLORS[ext] ?? { bg: 'rgba(92,92,120,0.12)', color: '#5C5C78', label: 'FILE' }
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatRelative(iso: string, locale: string): string {
  const d = new Date(iso)
  const diffH = Math.round((Date.now() - d.getTime()) / 3600_000)
  if (diffH < 1) return locale === 'en' ? 'just now' : "à l'instant"
  if (diffH < 24) return locale === 'en' ? `${diffH}h ago` : `il y a ${diffH} h`
  const diffD = Math.round(diffH / 24)
  if (diffD < 30) return locale === 'en' ? `${diffD}d ago` : `il y a ${diffD} j`
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

function humanizeSource(source: string): string {
  const map: Record<string, string> = {
    shopify: 'Shopify',
    meta_ads: 'Meta Ads',
    google_ads: 'Google Ads',
    ga4: 'GA4',
    stripe: 'Stripe',
    search_console: 'Search Console',
    klaviyo: 'Klaviyo',
    pinterest_ads: 'Pinterest Ads',
    tiktok_ads: 'TikTok Ads',
    prestashop: 'PrestaShop',
    hubspot: 'HubSpot',
    mailchimp: 'Mailchimp',
  }
  return map[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function UploadIllus() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="mx-auto" aria-hidden="true">
      <defs>
        <linearGradient id="up-grad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5C8FFF" />
          <stop offset="1" stopColor="#2DD9EE" />
        </linearGradient>
      </defs>
      <rect
        x="12"
        y="16"
        width="32"
        height="28"
        rx="4"
        fill="none"
        stroke="#5C5C78"
        strokeWidth="2.5"
      />
      <path
        d="M28 36 L28 22 M22 28 L28 22 L34 28"
        fill="none"
        stroke="url(#up-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="11" r="3.5" fill="#2DD9EE" />
    </svg>
  )
}
