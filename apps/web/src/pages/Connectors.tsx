import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import SourceHealthBadge from '@/components/connectors/SourceHealthBadge'
import { SkeletonCardGrid } from '@/components/Skeleton'
import {
  CATEGORIES,
  countByStatus,
  type ConnectorCategory,
  type ConnectorDef,
} from '@/lib/connectors'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { HealthState } from '@/lib/connector-health'
import { type StringKey, useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'

type WorkspaceConnector = {
  id: string
  source: string
  status: 'active' | 'expired' | 'error' | 'disconnected'
  account_name: string | null
  last_synced_at: string | null
  status_reason?: string | null
  health_state?: HealthState
}

function categoryKey(cat: ConnectorCategory): StringKey {
  return `connectors.category.${cat}` as StringKey
}

export default function ConnectorsPage() {
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id ?? ''
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | 'All'>('All')
  const [searchParams, setSearchParams] = useSearchParams()

  // Reprise post-callback OAuth — le backend redirige vers /connectors avec
  // ?status=connected&source=X ou ?status=error&reason=X (cf.
  // apps/api/src/routes/connectors.routes.js). On en profite pour tracker
  // l'event activation (measurement plan §6) et nettoyer l'URL.
  useEffect(() => {
    const status = searchParams.get('status')
    const source = searchParams.get('source')
    const reason = searchParams.get('reason')
    if (!status) return
    if (status === 'connected' && source) {
      track('connector_connect_succeeded', { source })
    } else if (status === 'error') {
      track('connector_connect_failed', {
        source: source ?? null,
        reason: reason ?? null,
      })
    }
    const next = new URLSearchParams(searchParams)
    next.delete('status')
    next.delete('source')
    next.delete('reason')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Catalogue dynamique depuis l'API (alimenté par la table integration_providers)
  const catalogQuery = useQuery({
    queryKey: ['connectors', 'catalog'],
    queryFn: () => apiFetch<{ catalog: ConnectorDef[] }>('/api/v1/connectors/catalog'),
    staleTime: 5 * 60_000, // catalog change rarement
  })
  const catalog = catalogQuery.data?.catalog ?? []
  const counts = useMemo(() => countByStatus(catalog), [catalog])

  const connectedQuery = useQuery({
    queryKey: ['connectors', 'list', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ connectors: WorkspaceConnector[] }>(
        `/api/v1/connectors?workspaceId=${workspaceId}`,
      ),
  })

  const connectedBySource = useMemo(() => {
    const map = new Map<string, WorkspaceConnector>()
    for (const c of connectedQuery.data?.connectors ?? []) {
      map.set(c.source, c)
    }
    return map
  }, [connectedQuery.data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((c) => {
      if (c.status === 'disabled') return false
      if (activeCategory !== 'All' && c.category !== activeCategory) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.source.includes(q) ||
        c.description.toLowerCase().includes(q)
      )
    })
  }, [catalog, query, activeCategory])

  const available = filtered.filter((c) => c.status === 'available' || c.status === 'beta')
  const soon = filtered.filter((c) => c.status === 'soon')

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
            {t('connectors.kicker')}
          </span>
          <h1 className="mt-2 font-head text-3xl font-bold text-text-1">{t('connectors.title')}</h1>
          <p className="mt-2 text-text-2">
            {t('connectors.subtitle', {
              available: counts.available + counts.beta,
              soon: counts.soon,
            })}{' '}
            <a
              href="mailto:hello@smartanalyst.io"
              className="text-brand-blue hover:text-brand-cyan"
            >
              {t('connectors.tellUs')}
            </a>
            .
          </p>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('connectors.searchPlaceholder')}
            className="sa-input sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            <CategoryPill
              label={t('connectors.category.all')}
              active={activeCategory === 'All'}
              onClick={() => setActiveCategory('All')}
            />
            {CATEGORIES.map((cat) => (
              <CategoryPill
                key={cat}
                label={t(categoryKey(cat))}
                active={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
              />
            ))}
          </div>
        </div>

        {catalogQuery.isLoading && (
          <div className="mb-6">
            <h2 className="mb-4 font-head text-lg font-semibold text-text-1">
              {t('connectors.section.available')}
            </h2>
            <SkeletonCardGrid count={6} />
          </div>
        )}

        {available.length > 0 && (
          <Section title={t('connectors.section.available')}>
            <ConnectorGrid
              items={available}
              connectedBySource={connectedBySource}
              workspaceId={workspaceId}
              onListChanged={() =>
                connectedQuery.refetch().catch(() => {
                  /* surfaced inline */
                })
              }
            />
          </Section>
        )}

        {soon.length > 0 && (
          <Section title={t('connectors.section.soon')}>
            <ConnectorGrid
              items={soon}
              connectedBySource={connectedBySource}
              workspaceId={workspaceId}
              onListChanged={() => {}}
            />
          </Section>
        )}

        {!catalogQuery.isLoading && available.length === 0 && soon.length === 0 && (
          <div className="sa-card text-center text-text-2">{t('connectors.emptyResults')}</div>
        )}
      </div>
    </AppLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="mb-4 font-head text-lg font-semibold text-text-1">{title}</h2>
      {children}
    </div>
  )
}

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition',
        active
          ? 'border-brand-blue bg-brand-blue-dim text-text-1'
          : 'border-border text-text-3 hover:border-border-bright hover:text-text-2',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function ConnectorGrid({
  items,
  connectedBySource,
  workspaceId,
  onListChanged,
}: {
  items: ConnectorDef[]
  connectedBySource: Map<string, WorkspaceConnector>
  workspaceId: string
  onListChanged: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => (
        <ConnectorCard
          key={c.source}
          def={c}
          connected={connectedBySource.get(c.source)}
          workspaceId={workspaceId}
          onListChanged={onListChanged}
        />
      ))}
    </div>
  )
}

function ConnectorCard({
  def,
  connected,
  workspaceId,
  onListChanged,
}: {
  def: ConnectorDef
  connected?: WorkspaceConnector
  workspaceId: string
  onListChanged: () => void
}) {
  const t = useT()
  const isConnected = Boolean(connected)
  const isSoon = def.status === 'soon'
  // Un provider peut être 'available' côté status mais sans Client ID/Secret
  // hydratés en DB (l'app OAuth pas encore créée chez le provider). On le
  // marque comme non-connectable pour l'instant.
  const isMisconfigured = !isSoon && !def.credentials_configured
  const initials = def.name
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 2)
    .toUpperCase()

  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [syncedMsg, setSyncedMsg] = useState<string | null>(null)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [subdomainOpen, setSubdomainOpen] = useState(false)
  const [subdomainValue, setSubdomainValue] = useState('')

  const connectMutation = useMutation({
    mutationFn: async (subst?: Record<string, string>) => {
      const qs = new URLSearchParams({ source: def.source, workspaceId })
      if (subst && Object.keys(subst).length > 0) {
        qs.set('subst', JSON.stringify(subst))
      }
      const res = await apiFetch<{ authorize_url: string }>(
        `/api/v1/connectors/oauth/authorize?${qs.toString()}`,
      )
      window.location.href = res.authorize_url
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('connectors.err.startOauth')),
  })

  const apiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const { connector } = await apiFetch<{ connector: { id: string } }>('/api/v1/connectors', {
        method: 'POST',
        body: {
          workspaceId,
          source: def.source,
          accountId: 'primary',
          accountName: def.name,
          apiKey: apiKey.trim(),
        },
      })
      const today = new Date()
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      await apiFetch(`/api/v1/connectors/${connector.id}/sync`, {
        method: 'POST',
        body: {
          workspaceId,
          startDate: fmt(monthAgo),
          endDate: fmt(today),
        },
      }).catch(() => {
        // a failed first sync doesn't undo the connection
      })
    },
    onSuccess: () => {
      setApiKeyOpen(false)
      setApiKeyValue('')
      void queryClient.invalidateQueries({ queryKey: ['connectors'] })
      onListChanged()
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('connectors.err.startOauth')),
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!connected) return
      await apiFetch(`/api/v1/connectors/${connected.id}?workspaceId=${workspaceId}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['connectors'] })
      onListChanged()
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('connectors.err.disconnect')),
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!connected) return { metricsCount: 0 }
      const today = new Date()
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      return (await apiFetch(`/api/v1/connectors/${connected.id}/sync`, {
        method: 'POST',
        body: { workspaceId, startDate: fmt(monthAgo), endDate: fmt(today) },
      })) as { metricsCount?: number }
    },
    onSuccess: (result) => {
      setError(null)
      setSyncedMsg(t('connectors.sync.success', { count: String(result.metricsCount ?? 0) }))
      void queryClient.invalidateQueries({ queryKey: ['connectors'] })
      onListChanged()
    },
    onError: (err) => {
      setSyncedMsg(null)
      setError(err instanceof Error ? err.message : t('connectors.err.sync'))
    },
  })

  // Calcule l'action déclenchée par le bouton "Connect" selon le type d'auth
  // et les pré-requis du provider (Shopify a besoin d'un shop subdomain).
  function handleConnect() {
    setError(null)
    if (def.auth_kind === 'apikey') {
      setApiKeyOpen((v) => !v)
      return
    }
    if (def.requires_subdomain) {
      setSubdomainOpen((v) => !v)
      return
    }
    connectMutation.mutate(undefined)
  }

  return (
    <div className="sa-card flex flex-col">
      <div className="flex items-start gap-3">
        {def.icon_url ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1.5">
            <img
              src={def.icon_url}
              alt={def.name}
              className="h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-2 font-mono text-xs font-bold text-text-1">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-head text-base font-semibold text-text-1">{def.name}</h3>
            {isConnected && connected?.health_state ? (
              <SourceHealthBadge health={connected.health_state} size="sm" />
            ) : isConnected ? (
              <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand-green">
                {t('connectors.badge.connected')}
              </span>
            ) : null}
            {def.status === 'beta' && (
              <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand-cyan">
                BETA
              </span>
            )}
            {isSoon && (
              <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-text-3">
                {t('connectors.badge.soon')}
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-3">
            {t(categoryKey(def.category))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-text-2">{def.description}</p>

      {error && (
        <div className="mt-3 rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-brand-red">
          {error}
        </div>
      )}

      {syncedMsg && (
        <div className="mt-3 rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-xs text-brand-green">
          {syncedMsg}
        </div>
      )}

      {isMisconfigured && !isConnected && (
        <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-text-3">
          {t('connectors.badge.notConfigured')}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
          {def.auth_kind === 'oauth2' ? t('connectors.auth.oauth') : t('connectors.auth.apiKey')}
        </span>
        {isSoon ? (
          <button type="button" className="sa-btn !py-1.5 !text-xs opacity-60" disabled>
            {t('connectors.action.notifyMe')}
          </button>
        ) : isConnected ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setSyncedMsg(null)
                syncMutation.mutate()
              }}
              disabled={syncMutation.isPending}
              className="sa-btn !py-1.5 !text-xs"
            >
              {syncMutation.isPending
                ? t('connectors.action.syncing')
                : t('connectors.action.sync')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm(t('connectors.confirmDisconnect', { name: def.name }))) return
                setError(null)
                disconnectMutation.mutate()
              }}
              disabled={disconnectMutation.isPending || syncMutation.isPending}
              className="sa-btn !py-1.5 !text-xs"
            >
              {disconnectMutation.isPending
                ? t('connectors.action.disconnecting')
                : t('connectors.action.disconnect')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isMisconfigured || connectMutation.isPending}
            className="sa-btn sa-btn-primary !py-1.5 !text-xs disabled:opacity-50"
          >
            {connectMutation.isPending
              ? t('connectors.action.opening')
              : apiKeyOpen || subdomainOpen
                ? t('connectors.action.cancel')
                : t('connectors.action.connect')}
          </button>
        )}
      </div>

      {apiKeyOpen && !isConnected && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!apiKeyValue.trim()) return
            setError(null)
            apiKeyMutation.mutate(apiKeyValue)
          }}
          className="mt-3 flex flex-col gap-2 border-t border-border pt-3"
        >
          <label className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            {t('connectors.apikey.label', { name: def.name })}
          </label>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKeyValue}
            onChange={(e) => setApiKeyValue(e.target.value)}
            placeholder={def.source === 'stripe' ? 'sk_test_… / rk_test_…' : ''}
            className="sa-input !py-2 !text-xs"
            disabled={apiKeyMutation.isPending}
          />
          <button
            type="submit"
            disabled={apiKeyMutation.isPending || !apiKeyValue.trim()}
            className="sa-btn sa-btn-primary !py-1.5 !text-xs disabled:opacity-50"
          >
            {apiKeyMutation.isPending ? t('connectors.apikey.saving') : t('connectors.apikey.save')}
          </button>
        </form>
      )}

      {subdomainOpen && !isConnected && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const shop = subdomainValue
              .trim()
              .toLowerCase()
              .replace(/\.myshopify\.com$/, '')
            if (!shop) return
            setError(null)
            connectMutation.mutate({ shop })
          }}
          className="mt-3 flex flex-col gap-2 border-t border-border pt-3"
        >
          <label className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            {t('connectors.subdomain.label')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={subdomainValue}
              onChange={(e) => setSubdomainValue(e.target.value)}
              placeholder="maboutique"
              className="sa-input !py-2 !text-xs flex-1"
              disabled={connectMutation.isPending}
            />
            <span className="font-mono text-xs text-text-3">.myshopify.com</span>
          </div>
          <button
            type="submit"
            disabled={connectMutation.isPending || !subdomainValue.trim()}
            className="sa-btn sa-btn-primary !py-1.5 !text-xs disabled:opacity-50"
          >
            {connectMutation.isPending
              ? t('connectors.action.opening')
              : t('connectors.action.connect')}
          </button>
        </form>
      )}
    </div>
  )
}

// silence unused import; kept for symmetry with other pages that import it.
export { ApiError }
