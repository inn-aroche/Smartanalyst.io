// Composants de visualisation des résultats d'audit.
// Utilisés dans la page /audit et dans les onglets SEO/GEO/Perf/AI de la
// page Smart tag. Pure rendering — pas de fetch ni d'état métier ici.

import { useMemo, useState } from 'react'

import { type StringKey, useT } from '@/lib/i18n'
import type {
  AnalyzerResult,
  AiResult,
  Finding,
  PerfMetrics,
  Severity,
} from '@/lib/audit-types'

// ─── Score gauge SVG circulaire ──────────────────────────────────────────

export function ScoreGauge({ score, size = 140 }: { score: number; size?: number }) {
  const t = useT()
  const safe = Math.max(0, Math.min(100, score))
  const radius = 56 * (size / 140)
  const circumference = 2 * Math.PI * radius
  const dash = (safe / 100) * circumference
  const color = safe >= 80 ? '#22c55e' : safe >= 60 ? '#eab308' : '#ef4444'
  const center = size / 2

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="10" opacity="0.1" />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dasharray 600ms ease-out' }}
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-head"
          style={{ fill: 'currentColor', fontSize: size * 0.26, fontWeight: 700 }}
        >
          {safe}
        </text>
      </svg>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-text-3">
        {t('audit.score.label')}
      </div>
    </div>
  )
}

// ─── Summary pill (pass / warn / fail / info) ────────────────────────────

export function SumPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: Severity
}) {
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

// ─── Core Web Vitals chips (pour le tab Performance) ─────────────────────

export function CoreWebVitalsChips({ metrics }: { metrics: PerfMetrics }) {
  const t = useT()
  const items = [
    { label: 'LCP', value: metrics.lcp !== null ? fmtMs(metrics.lcp) : null, threshold: { good: 2500, ok: 4000 }, raw: metrics.lcp },
    { label: 'INP', value: metrics.inp !== null ? fmtMs(metrics.inp) : null, threshold: { good: 200, ok: 500 }, raw: metrics.inp },
    { label: 'CLS', value: metrics.cls !== null ? metrics.cls.toFixed(3) : null, threshold: { good: 0.1, ok: 0.25 }, raw: metrics.cls },
    { label: 'FCP', value: metrics.fcp !== null ? fmtMs(metrics.fcp) : null, threshold: { good: 1800, ok: 3000 }, raw: metrics.fcp },
  ]
  return (
    <div className="sa-card">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-3">
        {t('audit.cwv.title')}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((it) => {
          const tone =
            it.raw === null || it.value === null
              ? 'text-text-3'
              : it.raw <= it.threshold.good
                ? 'text-brand-green'
                : it.raw <= it.threshold.ok
                  ? 'text-yellow-500'
                  : 'text-brand-red'
          return (
            <div key={it.label} className="rounded-md border border-border bg-bg-1 px-2 py-2 text-center">
              <div className="font-mono text-[9px] uppercase tracking-widest text-text-3">{it.label}</div>
              <div className={`font-head text-lg font-bold ${tone}`}>{it.value ?? '—'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Findings (groupés par sévérité, expansibles) ────────────────────────

export function FindingsList({
  result,
  skipped,
}: {
  result: AnalyzerResult
  skipped?: boolean
}) {
  const grouped = useMemo(() => {
    const order: Severity[] = ['fail', 'warn', 'pass', 'info']
    return order.flatMap((sev) => result.findings.filter((f) => f.severity === sev))
  }, [result.findings])

  if (skipped && grouped.length === 0) return null

  return (
    <ul className="space-y-2">
      {grouped.map((f) => (
        <FindingRow key={f.key} finding={f} />
      ))}
    </ul>
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
      {open && finding.body && (
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

// ─── Score color helper ──────────────────────────────────────────────────

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-text-3'
  if (score >= 80) return 'text-brand-green'
  if (score >= 60) return 'text-yellow-500'
  return 'text-brand-red'
}

// ─── Format ms (1234ms → "1.23s") ────────────────────────────────────────

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`
}

// ─── Section header (titre + score badge "X / 100") ─────────────────────

export function SectionHeader({
  title,
  score,
  skipped,
  rightSlot,
}: {
  title: string
  score?: number | null
  skipped?: boolean
  rightSlot?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-head text-sm font-semibold uppercase tracking-widest text-text-3">
        {title}
      </h2>
      <div className="flex items-center gap-3">
        {!skipped && score !== null && score !== undefined && (
          <span className="font-mono text-[11px] uppercase tracking-widest text-text-3">
            <span className={`font-head text-base font-bold ${scoreColor(score)}`}>{score}</span> / 100
          </span>
        )}
        {rightSlot}
      </div>
    </div>
  )
}

// ─── AI sub-scores panel (visible dans le tab AI) ────────────────────────

export function AiSubScores({ ai }: { ai: NonNullable<AiResult['ai']> }) {
  const t = useT()
  const items: { labelKey: StringKey; score: number; inverted?: boolean }[] = [
    { labelKey: 'audit.ai.valueProp', score: ai.value_prop_clarity },
    { labelKey: 'audit.ai.citation', score: ai.citation_worthiness },
    { labelKey: 'audit.ai.qa', score: ai.qa_structure },
    { labelKey: 'audit.ai.jargon', score: ai.jargon_level, inverted: true },
    { labelKey: 'audit.ai.coherence', score: ai.title_content_coherence },
  ]
  return (
    <div className="sa-card">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map((it) => {
          // Pour jargon (inverted), un score haut = mauvais. On affiche 100-score
          // pour rester cohérent : barre verte = meilleur axe.
          const visual = it.inverted ? 100 - it.score : it.score
          return (
            <div key={it.labelKey} className="rounded-md border border-border bg-bg-1 px-2 py-2 text-center">
              <div className="font-mono text-[9px] uppercase tracking-widest text-text-3">
                {t(it.labelKey)}
              </div>
              <div className={`mt-0.5 font-head text-lg font-bold ${scoreColor(visual)}`}>
                {it.score}
              </div>
            </div>
          )
        })}
      </div>
      {(ai.key_strengths?.length > 0 || ai.key_weaknesses?.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ai.key_strengths?.length > 0 && (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-brand-green">
                {t('audit.ai.strengths')}
              </div>
              <ul className="space-y-1 text-xs text-text-2">
                {ai.key_strengths.map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="text-brand-green">+</span>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {ai.key_weaknesses?.length > 0 && (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-yellow-500">
                {t('audit.ai.weaknesses')}
              </div>
              <ul className="space-y-1 text-xs text-text-2">
                {ai.key_weaknesses.map((w, i) => (
                  <li key={i} className="flex gap-2"><span className="text-yellow-500">−</span>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {ai.summary && (
        <div className="mt-3 rounded-md border border-brand-cyan/20 bg-brand-cyan/5 px-3 py-2 text-xs leading-relaxed text-text-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-brand-cyan">
            {t('audit.ai.verdict')}
          </span>{' '}
          {ai.summary}
        </div>
      )}
    </div>
  )
}

// ─── Skipped reason banner ───────────────────────────────────────────────

export function SkippedBanner({ reason }: { reason: string }) {
  const t = useT()
  return (
    <div className="sa-card border-dashed text-sm text-text-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {t('audit.skipped.title')}
      </div>
      <p className="mt-1">{reason}</p>
    </div>
  )
}

// ─── Empty audit state (CTA "Run first audit") ──────────────────────────

export function AuditEmptyState({
  onTrigger,
  busy,
}: {
  onTrigger: (url: string) => void
  busy: boolean
}) {
  const t = useT()
  const [url, setUrl] = useState('')
  return (
    <div className="sa-card text-center">
      <div className="font-head text-lg font-semibold text-text-1">
        {t('dash.audit.empty.title')}
      </div>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-2">
        {t('dash.audit.empty.body')}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (url && !busy) onTrigger(url)
        }}
        className="mx-auto mt-4 flex max-w-md flex-col gap-2 sm:flex-row"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('dash.audit.empty.placeholder')}
          required
          disabled={busy}
          className="flex-1 rounded-md border border-border bg-bg-1 px-3 py-2 font-mono text-xs text-text-1 placeholder:text-text-3 focus:border-brand-cyan focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !url}
          className="sa-btn sa-btn-primary !text-xs disabled:opacity-50"
        >
          {busy ? t('dash.audit.empty.running') : t('dash.audit.empty.cta')}
        </button>
      </form>
    </div>
  )
}
