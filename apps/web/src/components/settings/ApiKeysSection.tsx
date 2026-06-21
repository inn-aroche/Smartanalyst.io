// ApiKeysSection — gestion des clés API par workspace (cahier §3 Lot 4).
//
// 3 actions UI :
//   - lister les clés (avec prefix masqué, lastUsed, statut revoked)
//   - créer une nouvelle clé (modal qui montre la clé en CLAIR une seule fois)
//   - révoquer une clé existante (soft delete)

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import CopyButton from '@/components/CopyButton'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

type ApiKeyRow = {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

type CreatedKey = {
  key: string
  prefix: string
  id: string
  createdAt: string
}

export default function ApiKeysSection() {
  const t = useT()
  const queryClient = useQueryClient()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [revealed, setRevealed] = useState<CreatedKey | null>(null)

  const listQ = useQuery({
    queryKey: ['apiKeys', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => apiFetch<{ keys: ApiKeyRow[] }>(`/api/v1/api-keys?workspaceId=${workspaceId}`),
    staleTime: 30_000,
  })

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<CreatedKey>('/api/v1/api-keys', {
        method: 'POST',
        body: { workspaceId, name: newKeyName.trim() },
      })
      return res
    },
    onSuccess: (data) => {
      setRevealed(data)
      setNewKeyName('')
      setCreateOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['apiKeys', workspaceId] })
    },
  })

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/v1/api-keys/${id}?workspaceId=${workspaceId}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['apiKeys', workspaceId] })
    },
  })

  const keys = listQ.data?.keys || []

  return (
    <div className="flex flex-col gap-3">
      <div className="sa-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="font-head text-[14px] font-semibold text-text-1">
              {t('apiKeys.title')}
            </div>
            <p className="mt-1 text-[12.5px] text-text-2">{t('apiKeys.body')}</p>
          </div>
          {!createOpen && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="sa-btn sa-btn-primary flex-shrink-0 !text-[12px]"
            >
              + {t('apiKeys.create')}
            </button>
          )}
        </div>

        {createOpen && (
          <div className="rounded-[10px] border border-border bg-bg-2 p-3">
            <label className="block text-[12px] font-medium text-text-1">
              {t('apiKeys.create.nameLabel')}
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t('apiKeys.create.namePlaceholder')}
              className="sa-input mt-1 w-full !text-[13px]"
              maxLength={80}
              autoFocus
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => create.mutate()}
                disabled={create.isPending || newKeyName.trim().length < 1}
                className="sa-btn sa-btn-primary !text-[12px] disabled:opacity-60"
              >
                {create.isPending ? t('apiKeys.creating') : t('apiKeys.confirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false)
                  setNewKeyName('')
                }}
                className="sa-btn !text-[12px]"
              >
                {t('apiKeys.cancel')}
              </button>
              {create.isError && (
                <span className="font-mono text-[11px] text-brand-red">
                  {create.error instanceof ApiError ? create.error.message : t('apiKeys.error')}
                </span>
              )}
            </div>
          </div>
        )}

        {revealed && (
          <div className="mt-3 rounded-[10px] border border-brand-amber/40 bg-brand-amber/10 p-3">
            <div className="text-[12.5px] font-semibold text-brand-amber">
              {t('apiKeys.revealed.warning')}
            </div>
            <p className="mt-1 text-[11.5px] text-text-2">{t('apiKeys.revealed.body')}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded border border-border bg-bg-1 px-2 py-1.5 font-mono text-[12px] text-text-1">
                {revealed.key}
              </code>
              <CopyButton value={revealed.key} size="sm" />
            </div>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="mt-2 font-mono text-[11px] uppercase tracking-widest text-text-3 hover:text-text-1"
            >
              {t('apiKeys.revealed.dismiss')}
            </button>
          </div>
        )}
      </div>

      {/* Liste */}
      {listQ.isLoading ? (
        <div className="sa-card animate-pulse">
          <div className="h-3 w-1/2 rounded bg-bg-3" />
        </div>
      ) : keys.length === 0 ? (
        <div className="sa-card text-center text-[12.5px] text-text-3">{t('apiKeys.empty')}</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {keys.map((k) => {
            const isRevoked = !!k.revokedAt
            return (
              <li
                key={k.id}
                className="flex items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={[
                      'truncate text-[13px] font-medium',
                      isRevoked ? 'text-text-3 line-through' : 'text-text-1',
                    ].join(' ')}
                  >
                    {k.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-text-3">
                    <code>{k.prefix}…</code>
                    <span>·</span>
                    <span>
                      {t('apiKeys.lastUsed')} : {k.lastUsedAt ? formatRel(k.lastUsedAt) : '—'}
                    </span>
                    {isRevoked && (
                      <span className="rounded bg-brand-red/15 px-1.5 py-0.5 text-brand-red">
                        {t('apiKeys.revoked')}
                      </span>
                    )}
                  </div>
                </div>
                {!isRevoked && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t('apiKeys.revoke.confirm'))) revoke.mutate(k.id)
                    }}
                    disabled={revoke.isPending}
                    className="sa-btn !text-[11.5px] disabled:opacity-60"
                  >
                    {t('apiKeys.revoke')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-[11.5px] text-text-3">{t('apiKeys.footer')}</p>
    </div>
  )
}

function formatRel(iso: string): string {
  const then = new Date(iso).getTime()
  const sec = Math.max(1, Math.round((Date.now() - then) / 1000))
  if (sec < 60) return 'à l’instant'
  const min = Math.round(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  return `il y a ${d} j`
}
