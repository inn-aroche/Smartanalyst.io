// Types partagés pour l'audit (page Audit et nouveaux onglets Smart tag).
// Le contrat API est stable depuis Phase D — on les centralise ici pour
// éviter la duplication entre Audit.tsx et Live.tsx (onglets SEO/GEO/Perf/AI).

export type Severity = 'pass' | 'warn' | 'fail' | 'info'

export type Finding = {
  key: string
  severity: Severity
  title: string
  body: string
  weight: number
  recommendation?: string
}

export type AnalyzerResult = {
  findings: Finding[]
  score: number | null
  summary: { pass: number; warn: number; fail: number; info: number }
}

export type PerfMetrics = {
  lcp: number | null
  inp: number | null
  cls: number | null
  fcp: number | null
  tbt: number | null
  tti: number | null
}

export type PerfResult = AnalyzerResult & {
  skipped?: boolean
  reason?: string
  metrics?: PerfMetrics
  strategy?: 'mobile' | 'desktop'
}

export type AiResult = AnalyzerResult & {
  skipped?: boolean
  reason?: string
  ai?: {
    value_prop_clarity: number
    citation_worthiness: number
    qa_structure: number
    jargon_level: number
    title_content_coherence: number
    key_strengths: string[]
    key_weaknesses: string[]
    summary: string
  }
}

export type AuditRecord = {
  id: string
  url: string
  final_url: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  score: number | null
  error: string | null
  results: {
    seo?: AnalyzerResult
    geo?: AnalyzerResult
    perf?: PerfResult
    ai?: AiResult
    raw?: { finalUrl: string; httpStatus: number | null }
  } | null
  created_at: string
  completed_at: string | null
}

export type AuditListItem = Pick<
  AuditRecord,
  'id' | 'url' | 'final_url' | 'status' | 'score' | 'created_at' | 'completed_at'
>
