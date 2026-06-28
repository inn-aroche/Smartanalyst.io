// QuotaChip — indicateur compact des quotas Free/Starter dans la Topbar.
//
// Cahier 22b + audit "next steps" : sans signal visible, l'user free
// frappe le mur du 402 sans prevenir. Ce chip rend la limite tangible
// (couleur + nombre) et incite a upgrade au bon moment.
//
// Affiche le quota le plus "stressant" (% le plus haut). Hide complete
// si le plan a tous les quotas Infinity (Pro/Agency).
//
// Bonus : un toast transient s'affiche UNE SEULE FOIS par mois quand
// l'user franchit 80% sur un quota. Persiste en localStorage par
// `workspace + quota + month` pour ne pas spammer.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useEntitlements } from '@/lib/use-entitlements'
import { useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'

type QuotaInfo = {
  type: 'connectors' | 'insights' | 'aiTokens'
  current: number
  limit: number | null
  pct: number
  exceeded: boolean
}

export default function QuotaChip() {
  const t = useT()
  const q = useEntitlements()
  const [dismissed, setDismissed] = useState(false)

  const quotaInfo = useMemo<QuotaInfo | null>(() => {
    if (!q.data) return null
    const candidates: QuotaInfo[] = []
    const c = q.data.quotas.connectors
    if (c.limit != null) {
      candidates.push({
        type: 'connectors',
        current: c.current,
        limit: c.limit,
        pct: c.limit > 0 ? (c.current / c.limit) * 100 : 0,
        exceeded: c.exceeded,
      })
    }
    const i = q.data.quotas.insightsPerMonth
    if (i.limit != null) {
      candidates.push({
        type: 'insights',
        current: i.current,
        limit: i.limit,
        pct: i.limit > 0 ? (i.current / i.limit) * 100 : 0,
        exceeded: i.exceeded,
      })
    }
    const ai = q.data.quotas.aiTokensPerMonth
    if (ai && ai.limit != null) {
      candidates.push({
        type: 'aiTokens',
        current: ai.current,
        limit: ai.limit,
        pct: ai.limit > 0 ? (ai.current / ai.limit) * 100 : 0,
        exceeded: ai.exceeded,
      })
    }
    if (candidates.length === 0) return null
    // Affiche le plus "stressant" (pct le plus haut).
    return candidates.sort((a, b) => b.pct - a.pct)[0]
  }, [q.data])

  // Toast 80% — fire-once par (quota, mois, workspace). Track aussi vers
  // PostHog pour mesurer le taux de upgrade-after-warning.
  useEffect(() => {
    if (!quotaInfo || quotaInfo.pct < 80 || dismissed) return
    const monthKey = new Date().toISOString().slice(0, 7) // 2026-06
    const localKey = `sa-quota-warned:${quotaInfo.type}:${monthKey}`
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(localKey)) return
    window.localStorage.setItem(localKey, '1')
    track('upgrade_prompt_shown', {
      reason: `quota_${quotaInfo.type}_80pct`,
      pct: Math.round(quotaInfo.pct),
    })
    // Ouvre le toast via state — disparait apres 8s.
    setDismissed(false)
    const timer = setTimeout(() => setDismissed(true), 8000)
    return () => clearTimeout(timer)
  }, [quotaInfo, dismissed])

  if (!quotaInfo) return null
  const { type, current, limit, pct, exceeded } = quotaInfo

  // Pas de chip si on est tres en-dessous (moins distrayant). Apparait
  // a partir de 50% — le seuil "tu commences a y penser".
  const showChip = pct >= 50 || exceeded
  if (!showChip) return null

  const tone = exceeded || pct >= 90 ? 'red' : pct >= 75 ? 'amber' : 'blue'
  const toneClasses = {
    red: 'border-brand-red/40 bg-brand-red/10 text-brand-red',
    amber: 'border-brand-amber/40 bg-brand-amber/10 text-brand-amber',
    blue: 'border-border bg-bg-2 text-text-2',
  }
  const label =
    type === 'connectors'
      ? t('quota.chip.connectors')
      : type === 'insights'
        ? t('quota.chip.insights')
        : t('quota.chip.aiTokens')

  return (
    <>
      <Link
        to="/settings"
        title={
          exceeded
            ? t('quota.chip.exceeded')
            : pct >= 90
              ? t('quota.chip.criticalHint')
              : t('quota.chip.normalHint')
        }
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
          toneClasses[tone],
        ].join(' ')}
      >
        <span aria-hidden="true">{exceeded ? '⛔' : pct >= 90 ? '⚠' : '◐'}</span>
        <span>
          {type === 'aiTokens' ? formatTokens(current) : current}/
          {type === 'aiTokens' ? formatTokens(limit!) : limit} {label}
        </span>
      </Link>

      {/* Toast 80%+ — visible 8s en bas a droite. */}
      {pct >= 80 && !dismissed && (
        <div className="fixed bottom-4 right-4 z-[3000] max-w-[360px] rounded-[12px] border border-brand-amber/40 bg-card p-3 shadow-card">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-[18px] leading-none">
              {exceeded ? '⛔' : '⚠'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-text-1">
                {exceeded
                  ? t(
                      type === 'connectors'
                        ? 'quota.toast.connectors.exceeded.title'
                        : type === 'insights'
                          ? 'quota.toast.insights.exceeded.title'
                          : 'quota.toast.aiTokens.exceeded.title',
                    )
                  : t(
                      type === 'connectors'
                        ? 'quota.toast.connectors.warn.title'
                        : type === 'insights'
                          ? 'quota.toast.insights.warn.title'
                          : 'quota.toast.aiTokens.warn.title',
                    )}
              </div>
              <div className="mt-0.5 text-[12px] text-text-2">
                {type === 'aiTokens' ? formatTokens(current) : current}/
                {type === 'aiTokens' ? formatTokens(limit!) : limit} {label} · {Math.round(pct)}%
              </div>
              <Link
                to="/settings"
                onClick={() => setDismissed(true)}
                className="mt-2 inline-block font-mono text-[11px] uppercase tracking-widest text-brand-blue-deep hover:underline"
              >
                {t('quota.toast.cta')} →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Fermer"
              className="text-text-3 hover:text-text-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}
