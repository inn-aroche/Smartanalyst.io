// WatchModal — création d'alerte custom (handoff Claude Design §3.3, brief V2).
// Flow guidé en 3 étapes (PAS de sélection brute de métrique) :
//   1. DÉCRIRE     : input NL "ce que je veux surveiller" + chip "Validé par
//                    l'assistant" qui apparaît après validation
//   2. CONDITION   : select métrique + opérateur + seuil (sauf any_change)
//   3. NOTIFICATION : checkboxes in-app/email + récap + bouton "Créer l'alerte"

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useToast } from '@/components/AppLayout'
import { apiFetch, ApiError } from '@/lib/api'
import { useT } from '@/lib/i18n'

type Operator = 'drops_below' | 'rises_above' | 'changes_by_pct' | 'any_change'

// Liste curatée de métriques canoniques exposées dans le sélecteur. Les clés
// matchent celles des canonical metrics côté API. Labels FR/EN à terme.
const METRICS: Array<{ key: string; label: string; unit: string }> = [
  { key: 'revenue_recurring_monthly', label: 'MRR', unit: '€' },
  { key: 'revenue_ecommerce', label: 'Chiffre d’affaires', unit: '€' },
  { key: 'orders_count', label: 'Commandes', unit: '' },
  { key: 'order_value_average', label: 'Panier moyen', unit: '€' },
  { key: 'sessions_all', label: 'Sessions', unit: '' },
  { key: 'users_active', label: 'Utilisateurs actifs', unit: '' },
  { key: 'conversions_total', label: 'Conversions', unit: '' },
  { key: 'bounce_rate_all', label: 'Taux de rebond', unit: '%' },
  { key: 'churn_rate_subscription', label: 'Taux de churn', unit: '%' },
  { key: 'spend_paid_social', label: 'Dépense paid social', unit: '€' },
  { key: 'spend_paid_search', label: 'Dépense paid search', unit: '€' },
  { key: 'return_on_investment_paid', label: 'ROAS', unit: '' },
  { key: 'click_through_rate_paid', label: 'CTR paid', unit: '%' },
  { key: 'clicks_organic_search', label: 'Clics organiques', unit: '' },
]

export default function WatchModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [description, setDescription] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low' | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [metricKey, setMetricKey] = useState(METRICS[0].key)
  const [operator, setOperator] = useState<Operator>('drops_below')
  const [threshold, setThreshold] = useState('')
  const [notifyInApp, setNotifyInApp] = useState(true)
  const [notifyEmail, setNotifyEmail] = useState(false)

  const { state } = useWorkspace()
  const wsId = state.workspaceId

  const createMutation = useMutation({
    mutationFn: async () =>
      apiFetch('/api/v1/watches', {
        method: 'POST',
        body: {
          workspaceId: wsId,
          description,
          metric_key: metricKey,
          operator,
          threshold: operator === 'any_change' ? undefined : Number(threshold),
          notify_in_app: notifyInApp,
          notify_email: notifyEmail,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watches', wsId] })
      toast.push(t('watchModal.toast.created'))
      onClose()
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : t('watchModal.toast.failed')
      toast.push(msg)
    },
  })

  // Step 1 : validation NL réelle via Gemini structured output.
  // POST /watches/validate retourne { metric_key, operator, threshold,
  // confidence, explanation }. On pré-remplit les champs du step 2 quand
  // confidence ≥ medium, sinon l'user choisit lui-même.
  async function handleValidateDescription() {
    if (description.trim().length < 5) return
    setConfirmed(false)
    setValidating(true)
    try {
      const res = await apiFetch<{
        metric_key: string | null
        operator: Operator | null
        threshold: number | null
        confidence: 'high' | 'medium' | 'low'
        explanation: string
      }>('/api/v1/watches/validate', {
        method: 'POST',
        body: { description: description.trim() },
      })
      setConfidence(res.confidence)
      setExplanation(res.explanation)
      // Pré-remplit seulement si l'IA est confiante.
      if (res.confidence !== 'low') {
        if (res.metric_key && METRICS.some((m) => m.key === res.metric_key)) {
          setMetricKey(res.metric_key)
        }
        if (res.operator) setOperator(res.operator)
        if (res.threshold && res.threshold > 0) setThreshold(String(res.threshold))
      }
      setConfirmed(true)
    } catch (err) {
      // Erreur réseau ou Gemini down — on tombe en confiance low et l'user
      // pourra continuer manuellement.
      setConfidence('low')
      setExplanation(err instanceof Error ? err.message : t('watchModal.s1.error'))
      setConfirmed(true)
    } finally {
      setValidating(false)
    }
  }

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0]
  const thresholdNeeded = operator !== 'any_change'
  const step2Valid = !!metricKey && !!operator && (!thresholdNeeded || Number(threshold) > 0)

  return (
    <div
      className="fixed inset-0 z-[2500] flex items-center justify-center bg-text-1/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('watchModal.title')}
    >
      <div className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-brief border border-border bg-card shadow-float">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <div className="font-head text-base font-bold text-text-1">{t('watchModal.title')}</div>
            <div className="mt-0.5 font-mono text-[11px] text-text-3">
              {t('watchModal.step')} {step}/3
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-text-3 hover:text-text-1"
          >
            ✕
          </button>
        </header>

        {/* Progress */}
        <div className="flex gap-1 px-5 pt-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-brand-blue-deep' : 'bg-bg-3'}`}
            />
          ))}
        </div>

        <div className="p-5">
          {step === 1 && (
            <Step1
              description={description}
              setDescription={setDescription}
              confirmed={confirmed}
              onValidate={handleValidateDescription}
              validating={validating}
              confidence={confidence}
              explanation={explanation}
            />
          )}
          {step === 2 && (
            <Step2
              metricKey={metricKey}
              setMetricKey={setMetricKey}
              operator={operator}
              setOperator={setOperator}
              threshold={threshold}
              setThreshold={setThreshold}
              metric={metric}
            />
          )}
          {step === 3 && (
            <Step3
              description={description}
              metric={metric}
              operator={operator}
              threshold={threshold}
              notifyInApp={notifyInApp}
              setNotifyInApp={setNotifyInApp}
              notifyEmail={notifyEmail}
              setNotifyEmail={setNotifyEmail}
            />
          )}
        </div>

        <footer className="flex items-center gap-2.5 border-t border-border bg-bg-2 px-5 py-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="sa-btn !text-sm"
            >
              ← {t('watchModal.back')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={step === 1 ? !confirmed : !step2Valid}
              className="sa-btn sa-btn-primary !text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('watchModal.next')} →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || (!notifyInApp && !notifyEmail)}
              className="sa-btn sa-btn-primary !text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? t('watchModal.creating') : t('watchModal.create')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

// ─── Sub-step 1 : Décrire ────────────────────────────────────────────────

function Step1({
  description,
  setDescription,
  confirmed,
  onValidate,
  validating,
  confidence,
  explanation,
}: {
  description: string
  setDescription: (v: string) => void
  confirmed: boolean
  onValidate: () => void
  validating: boolean
  confidence: 'high' | 'medium' | 'low' | null
  explanation: string | null
}) {
  const t = useT()
  // Couleur du chip selon la confiance retournée par Gemini.
  const chipCls =
    confidence === 'high'
      ? 'bg-brand-green/10 text-brand-green'
      : confidence === 'medium'
        ? 'bg-brand-amber/10 text-brand-amber'
        : 'bg-text-3/10 text-text-3'
  const chipDotCls =
    confidence === 'high'
      ? 'bg-brand-green'
      : confidence === 'medium'
        ? 'bg-brand-amber'
        : 'bg-text-3'
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="sa-label">{t('watchModal.s1.label')}</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('watchModal.s1.placeholder')}
          rows={3}
          className="sa-input !py-2.5"
          maxLength={280}
        />
        <div className="mt-1 font-mono text-[10px] text-text-3">
          {description.length}/280 · {t('watchModal.s1.hint')}
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-[10px] bg-bg-2 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {confirmed ? (
            <span className={`sa-chip ${chipCls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${chipDotCls}`} />
              {confidence === 'high'
                ? t('watchModal.s1.conf.high')
                : confidence === 'medium'
                  ? t('watchModal.s1.conf.medium')
                  : t('watchModal.s1.conf.low')}
            </span>
          ) : (
            <span className="text-[13px] text-text-2">{t('watchModal.s1.askToValidate')}</span>
          )}
          <button
            type="button"
            onClick={onValidate}
            disabled={description.trim().length < 5 || validating}
            className="sa-btn !text-xs disabled:opacity-50"
          >
            {validating ? t('watchModal.s1.validating') : t('watchModal.s1.askButton')}
          </button>
        </div>
        {confirmed && explanation && (
          <p className="text-[12.5px] leading-[1.5] text-text-2">{explanation}</p>
        )}
      </div>
    </div>
  )
}

// ─── Sub-step 2 : Condition ──────────────────────────────────────────────

function Step2({
  metricKey,
  setMetricKey,
  operator,
  setOperator,
  threshold,
  setThreshold,
  metric,
}: {
  metricKey: string
  setMetricKey: (v: string) => void
  operator: Operator
  setOperator: (v: Operator) => void
  threshold: string
  setThreshold: (v: string) => void
  metric: (typeof METRICS)[number]
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="sa-label">{t('watchModal.s2.metric')}</div>
        <select
          value={metricKey}
          onChange={(e) => setMetricKey(e.target.value)}
          className="sa-input !py-2.5"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="sa-label">{t('watchModal.s2.operator')}</div>
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value as Operator)}
          className="sa-input !py-2.5"
        >
          <option value="drops_below">{t('watchModal.op.drops_below')}</option>
          <option value="rises_above">{t('watchModal.op.rises_above')}</option>
          <option value="changes_by_pct">{t('watchModal.op.changes_by_pct')}</option>
          <option value="any_change">{t('watchModal.op.any_change')}</option>
        </select>
      </div>
      {operator !== 'any_change' && (
        <div>
          <div className="sa-label">
            {t('watchModal.s2.threshold')} (
            {operator === 'changes_by_pct' ? '%' : metric.unit || ''})
          </div>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder={operator === 'changes_by_pct' ? '15' : '1000'}
            className="sa-input !py-2.5"
            step="any"
          />
        </div>
      )}
    </div>
  )
}

// ─── Sub-step 3 : Notification + récap ───────────────────────────────────

function Step3({
  description,
  metric,
  operator,
  threshold,
  notifyInApp,
  setNotifyInApp,
  notifyEmail,
  setNotifyEmail,
}: {
  description: string
  metric: (typeof METRICS)[number]
  operator: Operator
  threshold: string
  notifyInApp: boolean
  setNotifyInApp: (v: boolean) => void
  notifyEmail: boolean
  setNotifyEmail: (v: boolean) => void
}) {
  const t = useT()
  const summary = useMemo(
    () => buildSummary({ metric, operator, threshold, t }),
    [metric, operator, threshold, t],
  )
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="sa-label">{t('watchModal.s3.channels')}</div>
        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-bg-2 px-3 py-2.5">
            <input
              type="checkbox"
              checked={notifyInApp}
              onChange={(e) => setNotifyInApp(e.target.checked)}
              className="accent-brand-blue-deep"
            />
            <span className="text-sm text-text-1">{t('watchModal.s3.inApp')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-bg-2 px-3 py-2.5">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
              className="accent-brand-blue-deep"
            />
            <span className="text-sm text-text-1">{t('watchModal.s3.email')}</span>
          </label>
        </div>
      </div>
      <div>
        <div className="sa-label">{t('watchModal.s3.summary')}</div>
        <div className="rounded-brief border border-brand-blue-deep/20 bg-brand-blue-dim px-4 py-3">
          <div className="text-[13.5px] leading-[1.5] text-text-1">
            <strong className="font-semibold">{t('watchModal.s3.if')}</strong> {summary}
          </div>
          {description && (
            <div className="mt-2 border-t border-border pt-2 font-mono text-[11px] italic text-text-3">
              « {description} »
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useAuth } from '@/lib/auth'

function useWorkspace() {
  const { state } = useAuth()
  return { state: { workspaceId: state.workspaces[0]?.id ?? '' } }
}

function buildSummary({
  metric,
  operator,
  threshold,
  t,
}: {
  metric: (typeof METRICS)[number]
  operator: Operator
  threshold: string
  t: ReturnType<typeof useT>
}): string {
  const m = metric.label
  switch (operator) {
    case 'drops_below':
      return `${m} ${t('watchModal.summary.dropsBelow')} ${threshold || '?'}${metric.unit}`
    case 'rises_above':
      return `${m} ${t('watchModal.summary.risesAbove')} ${threshold || '?'}${metric.unit}`
    case 'changes_by_pct':
      return `${m} ${t('watchModal.summary.changesByPct', { n: threshold || '?' })}`
    case 'any_change':
      return `${m} ${t('watchModal.summary.anyChange')}`
  }
}
