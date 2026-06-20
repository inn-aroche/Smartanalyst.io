// DataFreshnessChip — chip topbar qui montre la fraîcheur réelle (cahier
// §3 Lot 2 + §4.2). Remplace le chip hardcodé "Data up to date" qui ment.
//
// Affichage :
//   - aucun connecteur     → "No source connected" (chip neutre)
//   - tous récents (<2h)   → "Up to date"           (chip vert)
//   - sync il y a Xh/Xj    → "Last sync 5h ago"     (chip neutre/ambre selon âge)
//   - une panne            → "1 source needs help"  (chip rouge, cliquable → /sources)
//
// Polling court (60s) au lieu d'un push : suffisant pour un produit où les
// syncs sont quotidiennes. Désactivé hors-focus pour économiser réseau.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLocale, useT } from '@/lib/i18n'

type FreshnessResponse = {
  connectorCount: number
  latestSync: string | null
  oldestSync: string | null
  worstState: 'failing' | 'expired' | 'stale' | 'unknown' | 'healthy'
  states: string[]
}

const POLL_MS = 60_000

export default function DataFreshnessChip() {
  const { state } = useAuth()
  const { locale } = useLocale()
  const t = useT()
  const workspaceId = state.workspaces[0]?.id

  const q = useQuery({
    queryKey: ['freshness', workspaceId],
    enabled: Boolean(workspaceId),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: () =>
      apiFetch<FreshnessResponse>(`/api/v1/connectors/freshness?workspaceId=${workspaceId}`),
    staleTime: POLL_MS / 2,
  })

  if (!workspaceId) return null
  if (q.isLoading) {
    return (
      <span className="sa-chip bg-bg-3 text-text-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-3" />
        {t('freshness.loading')}
      </span>
    )
  }

  // Échec API : on n'affiche rien (mieux que de mentir).
  if (q.isError || !q.data) return null

  const { connectorCount, latestSync, worstState } = q.data
  if (connectorCount === 0) {
    return (
      <Link to="/sources" className="sa-chip bg-bg-3 text-text-2 hover:text-text-1">
        {t('freshness.none')}
      </Link>
    )
  }

  // Une panne / expiré → chip rouge cliquable vers la page Sources où l'user
  // pourra diagnostiquer.
  if (worstState === 'failing' || worstState === 'expired') {
    return (
      <Link to="/sources" className="sa-chip bg-brand-red/10 text-brand-red hover:bg-brand-red/15">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
        {t('freshness.needsHelp')}
      </Link>
    )
  }

  const rel = latestSync ? formatRelative(latestSync, locale) : '—'
  // Stale (>36h) → ambre, mais on n'éclate pas l'attention de l'user comme
  // un échec dur — c'est juste un signal.
  if (worstState === 'stale') {
    return (
      <Link
        to="/sources"
        className="sa-chip bg-brand-amber/10 text-brand-amber hover:bg-brand-amber/15"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />
        {t('freshness.lastSync', { rel })}
      </Link>
    )
  }

  // Healthy : on indique "Up to date" si très récent (<2h), sinon le délai
  // exact — plus honnête que de toujours dire "à jour".
  const ageHours = latestSync ? (Date.now() - new Date(latestSync).getTime()) / 3_600_000 : null
  const isFresh = ageHours !== null && ageHours < 2
  return (
    <span className="sa-chip bg-brand-green/10 text-brand-green">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
      {isFresh ? t('freshness.upToDate') : t('freshness.lastSync', { rel })}
    </span>
  )
}

// Helper local — équivalent simple de date-fns formatDistance. Garde l'app
// libre d'une dépendance supplémentaire.
function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.max(1, Math.round((now - then) / 1000))
  const fr = locale.startsWith('fr')
  if (sec < 60) return fr ? "à l'instant" : 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return fr ? `il y a ${min} min` : `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 24) return fr ? `il y a ${h} h` : `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return fr ? `il y a ${d} j` : `${d}d ago`
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US')
}
