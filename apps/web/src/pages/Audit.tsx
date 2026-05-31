import { useCallback, useEffect, useMemo, useState } from 'react'

import AppLayout from '@/components/AppLayout'
import { ApiError, apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { type StringKey, useT } from '@/lib/i18n'

type Severity = 'pass' | 'warn' | 'fail' | 'info'

type Finding = {
  key: string
  severity: Severity
  title: string
  body: string
  weight: number
  recommendation?: string
}

type AuditRecord = {
  id: string
  url: string
  final_url: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  score: number | null
  error: string | null
  results: {
    seo?: {
      findings: Finding[]
      score: number
      summary: { pass: number; warn: number; fail: number; info: number }
    }
    raw?: { finalUrl: string; httpStatus: number | null }
  } | null
  created_at: string
  completed_at: string | null
}

type ListItem = Pick<
  AuditRecord,
  'id' | 'url' | 'final_url' | 'status' | 'score' | 'created_at' | 'completed_at'
>

export default function AuditPage() {
  const t = useT()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id ?? ''

  const [url, setUrl] = useState('')
  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState<AuditRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ListItem[]>([])

  // Charge l'historique au mount.
  useEffect(() => {
    if (!workspaceId) return
    apiFetch<ListItem[]>(`/api/v1/audit?workspaceId=${workspaceId}`)
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [workspaceId])

  const handleRun = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!url || running) return
      setError(null)
      setRunning(true)
      try {
        const audit = await apiFetch<AuditRecord>(`/api/v1/audit?workspaceId=${workspaceId}`, {
          method: 'POST',
          body: { url },
        })
        setCurrent(audit)
        setHistory((prev) => [
          {
            id: audit.id,
            url: audit.url,
            final_url: audit.final_url,
            status: audit.status,
            score: audit.score,
            created_at: audit.created_at,
            completed_at: audit.completed_at,
          },
          ...prev,
        ].slice(0, 50))
      } catch (err) {
        setError(errorKeyFrom(err))
      } finally {
        setRunning(false)
      }
    },
    [url, running, workspaceId],
  )

  const openFromHistory = useCallback(
    async (id: string) => {
      setError(null)
      try {
        const audit = await apiFetch<AuditRecord>(`/api/v1/audit/${id}?workspaceId=${workspaceId}`)
        setCurrent(audit)
        // scroll up
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } catch (err) {
        setError(errorKeyFrom(err))
      }
    },
    [workspaceId],
  )

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
            {t('audit.kicker')}
          </span>
          <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
            {t('audit.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-text-2">{t('audit.subtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRun} className="sa-card mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="audit-url" className="block font-mono text-[10px] uppercase tracking-widest text-text-3">
              {t('audit.form.url.label')}
            </label>
            <input
              id="audit-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('audit.form.url.placeholder')}
              required
              disabled={running}
              className="mt-1.5 block w-full rounded-md border border-border bg-bg-1 px-3 py-2 font-mono text-sm text-text-1 placeholder:text-text-3 focus:border-brand-cyan focus:outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={running || !url}
            className="sa-btn sa-btn-primary !text-sm whitespace-nowrap disabled:opacity-50"
          >
            {running ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                {t('audit.form.running')}
              </span>
            ) : (
              t('audit.form.run')
            )}
          </button>
        </form>

        {running && (
          <div className="mb-6 text-center font-mono text-xs text-text-3">
            {t('audit.form.runningHint')}
          </div>
        )}

        {error && (
          <div className="sa-card mb-6 border-brand-red/30 bg-brand-red/5 text-sm text-brand-red">
            {t(error as StringKey)}
          </div>
        )}

        {/* Result */}
        {current && current.status === 'completed' && <AuditResult audit={current} />}

        {/* History */}
        <section className="mt-12">
          <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-widest text-text-3">
            {t('audit.history.title')}
          </h2>
          {history.length === 0 ? (
            <div className="sa-card text-center text-text-2">{t('audit.history.empty')}</div>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <HistoryRow key={h.id} item={h} onOpen={() => void openFromHistory(h.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppLayout>
  )
}

// ─── Result ──────────────────────────────────────────────────────────────

function AuditResult({ audit }: { audit: AuditRecord }) {
  const t = useT()
  const seo = audit.results?.seo
  const findings = seo?.findings ?? []
  // Groupe les findings par sévérité (ordre: fail > warn > pass > info).
  // useMemo doit être appelé inconditionnellement (rules of hooks).
  const grouped = useMemo(() => {
    const order: Severity[] = ['fail', 'warn', 'pass', 'info']
    return order.flatMap((sev) => findings.filter((f) => f.severity === sev))
  }, [findings])

  if (!seo) return null

  return (
    <div className="space-y-6">
      {/* Score + summary */}
      <div className="sa-card flex flex-col items-center gap-6 sm:flex-row sm:items-stretch">
        <div className="flex flex-1 items-center justify-center">
          <ScoreGauge score={audit.score ?? 0} />
        </div>
        <div className="flex-1 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            {audit.final_url || audit.url}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <SumPill label={t('audit.summary.pass')} value={seo.summary.pass} tone="pass" />
            <SumPill label={t('audit.summary.warn')} value={seo.summary.warn} tone="warn" />
            <SumPill label={t('audit.summary.fail')} value={seo.summary.fail} tone="fail" />
            <SumPill label={t('audit.summary.info')} value={seo.summary.info} tone="info" />
          </div>
          {audit.results?.raw?.httpStatus && (
            <div className="font-mono text-[11px] text-text-3">
              {t('audit.httpStatus')}: <span className="text-text-2">{audit.results.raw.httpStatus}</span>
            </div>
          )}
        </div>
      </div>

      {/* Findings list */}
      <section>
        <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-widest text-text-3">
          {t('audit.section.seo')}
        </h2>
        <ul className="space-y-2">
          {grouped.map((f) => (
            <FindingRow key={f.key} finding={f} />
          ))}
        </ul>
      </section>

      {/* Coming-soon placeholders for the next analyzers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ComingSoonCard title={t('audit.section.geo')} />
        <ComingSoonCard title={t('audit.section.perf')} />
      </div>
    </div>
  )
}

function ScoreGauge({ score }: { score: number }) {
  const t = useT()
  const safe = Math.max(0, Math.min(100, score))
  const radius = 56
  const circumference = 2 * Math.PI * radius
  const dash = (safe / 100) * circumference
  const color = safe >= 80 ? '#22c55e' : safe >= 60 ? '#eab308' : '#ef4444'
  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="10" opacity="0.1" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dasharray 600ms ease-out' }}
        />
        <text x="70" y="70" textAnchor="middle" dominantBaseline="central" className="font-head" style={{ fill: 'currentColor', fontSize: 36, fontWeight: 700 }}>
          {safe}
        </text>
      </svg>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-text-3">
        {t('audit.score.label')}
      </div>
    </div>
  )
}

function SumPill({ label, value, tone }: { label: string; value: number; tone: Severity }) {
  const tones: Record<Severity, string> = {
    pass: 'border-brand-green/30 bg-brand-green/10 text-brand-green',
    warn: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
    fail: 'border-brand-red/30 bg-brand-red/10 text-brand-red',
    info: 'border-border bg-card text-text-3',
  }
  return (
    <div className={`rounded-md border px-2 py-1.5 text-center ${tones[tone]}`}>
      <div className="font-head text-lg font-bold">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-widest opacity-80">{label}</div>
    </div>
  )
}

function FindingRow({ finding }: { finding: Finding }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const tones: Record<Severity, { dot: string; label: string }> = {
    pass: { dot: 'bg-brand-green', label: t('audit.severity.pass') },
    warn: { dot: 'bg-yellow-500', label: t('audit.severity.warn') },
    fail: { dot: 'bg-brand-red', label: t('audit.severity.fail') },
    info: { dot: 'bg-text-3', label: t('audit.severity.info') },
  }
  const tone = tones[finding.severity]

  return (
    <li className="sa-card !p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-card-h"
        aria-expanded={open}
      >
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
        <span className="font-mono text-[10px] w-12 shrink-0 uppercase tracking-widest text-text-3">
          {tone.label}
        </span>
        <span className="flex-1 text-sm text-text-1">{finding.title}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-border bg-bg-1 px-4 py-3 text-sm text-text-2">
          <p className="leading-relaxed">{finding.body}</p>
          {finding.recommendation && (
            <div className="mt-3 rounded-md border border-brand-cyan/20 bg-brand-cyan/5 px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-widest text-brand-cyan">
                {t('audit.findings.recommendation')}
              </div>
              <p className="mt-1 leading-relaxed text-text-1">{finding.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function ComingSoonCard({ title }: { title: string }) {
  return (
    <div className="sa-card flex items-center justify-center border-dashed text-center text-text-3">
      <span className="font-mono text-[11px] uppercase tracking-widest">{title}</span>
    </div>
  )
}

function HistoryRow({ item, onOpen }: { item: ListItem; onOpen: () => void }) {
  const t = useT()
  const date = new Date(item.created_at).toLocaleString()
  const score = item.score
  const scoreColor =
    score === null || score === undefined
      ? 'text-text-3'
      : score >= 80
        ? 'text-brand-green'
        : score >= 60
          ? 'text-yellow-500'
          : 'text-brand-red'

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span className={`font-head text-lg font-bold w-10 text-right ${scoreColor}`}>
        {score ?? '—'}
      </span>
      <span className="flex-1 min-w-0">
        <div className="truncate text-text-1">{item.final_url || item.url}</div>
        <div className="font-mono text-[10px] text-text-3">{date}</div>
      </span>
      <button type="button" onClick={onOpen} className="sa-btn !py-1 !text-[11px]">
        {t('audit.history.open')}
      </button>
    </li>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function errorKeyFrom(err: unknown): string {
  if (err instanceof ApiError) {
    const code = ((err.body as { code?: string } | null)?.code ?? '').toString()
    if (code === 'INVALID_URL' || code === 'INVALID_URL_SCHEME') return 'audit.error.invalid_url'
    if (code === 'SCRAPE_FAILED') return 'audit.error.scrape_failed'
  }
  return 'audit.error.generic'
}
