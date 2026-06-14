// Bloc usage IA dans Settings : tokens consommés ce mois + coût + budget.
// Affiche une barre de progression si limite définie, breakdown par type.

import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { useT } from '@/lib/i18n'

type AiUsage = {
  month: string
  total_tokens: number
  total_cost_usd: number
  limit: number | null
  by_type: Array<{ request_type: string; tokens: number; cost_usd: number; calls: number }>
}

export default function AiUsageBlock({ workspaceId }: { workspaceId: string }) {
  const t = useT()
  const q = useQuery({
    queryKey: ['ai-usage', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => apiFetch<AiUsage>(`/api/v1/me/ai-usage?workspaceId=${workspaceId}`),
    staleTime: 60_000,
  })

  if (q.isLoading || !q.data) {
    return <div className="sa-card h-32 animate-pulse" />
  }

  const { total_tokens, total_cost_usd, limit, by_type } = q.data
  const pct = limit ? Math.min(100, (total_tokens / limit) * 100) : 0
  const barColor = pct >= 90 ? 'bg-brand-red' : pct >= 75 ? 'bg-brand-amber' : 'bg-brand-blue-deep'

  return (
    <div className="sa-card flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-head text-sm font-semibold text-text-1">{t('aiUsage.title')}</div>
          <div className="mt-0.5 text-xs text-text-2">{t('aiUsage.subtitle')}</div>
        </div>
        <div className="text-right">
          <div className="font-head text-xl font-bold text-text-1">
            {new Intl.NumberFormat('fr-FR').format(total_tokens)}
          </div>
          <div className="font-mono text-[10px] text-text-3">
            {t('aiUsage.tokensLabel')} · ${total_cost_usd.toFixed(4)}
          </div>
        </div>
      </div>

      {limit != null ? (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-3">
              {t('aiUsage.budget')}
            </span>
            <span className="font-mono text-[11px] text-text-2">
              {Math.round(pct)}% · {new Intl.NumberFormat('fr-FR').format(limit)}{' '}
              {t('aiUsage.tokensLabel')}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-3">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          {pct >= 90 && (
            <div className="mt-2 text-xs text-brand-red">{t('aiUsage.warningHigh')}</div>
          )}
        </div>
      ) : (
        <div className="text-xs text-text-3">{t('aiUsage.noBudget')}</div>
      )}

      {by_type.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="sa-label mb-2">{t('aiUsage.breakdown')}</div>
          <div className="flex flex-col gap-1.5">
            {by_type
              .sort((a, b) => b.tokens - a.tokens)
              .map((row) => (
                <div
                  key={row.request_type}
                  className="flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="font-mono text-[11px] text-text-2">
                    {row.request_type} · {row.calls} {t('aiUsage.calls')}
                  </span>
                  <span className="font-mono text-[11px] text-text-1">
                    {new Intl.NumberFormat('fr-FR').format(row.tokens)} · $
                    {Number(row.cost_usd).toFixed(4)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
