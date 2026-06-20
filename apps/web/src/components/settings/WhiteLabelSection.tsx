// WhiteLabelSection — édite brand_color + logo_url du workspace courant
// (cahier §3 Lot 4 + §4.8). Reflété dans les rapports HTML générés.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

const HEX_RE = /^#[0-9a-fA-F]{6}$/
const DEFAULT_COLOR = '#6366f1'

type WorkspaceBranding = {
  workspace: { id: string; name: string; brand_color: string | null; logo_url: string | null }
}

export default function WhiteLabelSection() {
  const t = useT()
  const queryClient = useQueryClient()
  const { state } = useAuth()
  const workspace = state.workspaces[0]
  const workspaceId = workspace?.id

  // Le type Workspace exposé par useAuth n'inclut pas brand_color/logo_url
  // (volontairement minimal pour ne pas leaker partout). On les ramène via
  // un GET dédié — cache 5min, refetch après save.
  const brandingQ = useQuery({
    queryKey: ['workspace', 'branding', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<WorkspaceBranding>(`/api/v1/me`).then((me) => {
        // /me retourne workspaces[]; on récupère le bon
        const data = me as unknown as { workspaces?: WorkspaceBranding['workspace'][] }
        const ws = data.workspaces?.find((w) => w.id === workspaceId)
        return {
          workspace: ws || { id: workspaceId!, name: '', brand_color: null, logo_url: null },
        }
      }),
    staleTime: 5 * 60_000,
  })

  const [color, setColor] = useState<string>(DEFAULT_COLOR)
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [savedToast, setSavedToast] = useState(false)

  useEffect(() => {
    if (brandingQ.data?.workspace.brand_color) setColor(brandingQ.data.workspace.brand_color)
    if (brandingQ.data?.workspace.logo_url) setLogoUrl(brandingQ.data.workspace.logo_url)
  }, [brandingQ.data?.workspace.brand_color, brandingQ.data?.workspace.logo_url])

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | null> = {
        workspaceId,
        brand_color: HEX_RE.test(color) ? color : DEFAULT_COLOR,
        logo_url: logoUrl.trim() ? logoUrl.trim() : null,
      }
      return apiFetch<{ workspace: { brand_color: string; logo_url: string | null } }>(
        '/api/v1/workspaces',
        { method: 'PATCH', body },
      )
    },
    onSuccess: () => {
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 2000)
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'branding', workspaceId] })
    },
  })

  const colorValid = HEX_RE.test(color)
  const logoValid = !logoUrl || /^https:\/\//.test(logoUrl.trim())
  const canSave = colorValid && logoValid && !save.isPending

  return (
    <div className="sa-card flex flex-col gap-4">
      <div>
        <div className="font-head text-[14px] font-semibold text-text-1">
          {t('whiteLabel.title')}
        </div>
        <p className="mt-1 text-[12.5px] text-text-2">{t('whiteLabel.body')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Couleur de marque */}
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-32 flex-shrink-0 text-text-2">{t('whiteLabel.color')}</span>
          <input
            type="color"
            value={colorValid ? color : DEFAULT_COLOR}
            onChange={(e) => setColor(e.target.value)}
            aria-label={t('whiteLabel.color')}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder={DEFAULT_COLOR}
            className="sa-input flex-1 !text-[12.5px]"
          />
          {!colorValid && (
            <span className="font-mono text-[10.5px] text-brand-red">
              {t('whiteLabel.color.invalid')}
            </span>
          )}
        </label>

        {/* URL logo */}
        <label className="flex items-start gap-3 text-[13px]">
          <span className="w-32 flex-shrink-0 pt-2 text-text-2">{t('whiteLabel.logo')}</span>
          <div className="flex-1">
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="sa-input w-full !text-[12.5px]"
            />
            {!logoValid && (
              <div className="mt-1 font-mono text-[10.5px] text-brand-red">
                {t('whiteLabel.logo.invalid')}
              </div>
            )}
            {logoUrl && logoValid && (
              <img
                src={logoUrl}
                alt=""
                className="mt-2 h-10 max-w-[160px] rounded border border-border bg-bg-2 object-contain p-1"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
          </div>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!canSave}
          className="sa-btn sa-btn-primary !text-[13px] disabled:opacity-60"
        >
          {save.isPending ? t('whiteLabel.saving') : t('whiteLabel.save')}
        </button>
        {savedToast && (
          <span className="font-mono text-[11px] uppercase tracking-widest text-brand-green">
            ✓ {t('whiteLabel.saved')}
          </span>
        )}
        {save.isError && (
          <span className="font-mono text-[11px] text-brand-red">
            {save.error instanceof ApiError ? save.error.message : t('whiteLabel.error')}
          </span>
        )}
      </div>
    </div>
  )
}
