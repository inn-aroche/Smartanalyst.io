// Types partagés Insight Engine / Santé du tracking.
// Refletent les contrats des endpoints :
//   - GET /api/v1/insights
//   - GET /api/v1/insights/actions
//   - GET /api/v1/smarttag/health

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Confidence = 'low' | 'medium' | 'high'
export type Impact = 'low' | 'medium' | 'high'
export type Effort = 'low' | 'medium' | 'high'
export type InsightStatus = 'open' | 'snoozed' | 'resolved' | 'dismissed'
export type ActionStatus = 'todo' | 'in_progress' | 'done' | 'dismissed'

export type InsightEvidence = {
  label: string
  metric_key: string | null
  value: number | string | null
  previous_value: number | string | null
  delta_percent: number | null
  source: string
  explanation: string
}

export type ChartSpec = {
  chart_type: 'line' | 'bar' | 'donut' | 'funnel' | 'sparkline'
  title: string
  metric_key: string | null
  dimension: string | null
  source: string | null
  // pas de "data" — le backend remplira si on rend les graphes plus tard
}

export type ActionCard = {
  id: string
  workspace_id: string
  insight_id: string | null
  title: string
  description: string | null
  priority: Severity
  impact: Impact
  effort: Effort
  confidence: Confidence
  status: ActionStatus
  source: unknown
  expected_impact: unknown
  follow_up_check: unknown
  created_at: string
  updated_at: string
}

export type Insight = {
  id: string
  workspace_id: string
  title: string
  summary: string
  category: string
  severity: Severity
  confidence: Confidence
  status: InsightStatus
  period_start: string | null
  period_end: string | null
  comparison_start: string | null
  comparison_end: string | null
  primary_source: string | null
  evidence: InsightEvidence[]
  chart_spec: ChartSpec | null
  limitations: string[]
  created_at: string
  updated_at: string
  actions: ActionCard[]
}

export type TrackingHealth = {
  smarttag_active: boolean
  last_event_at: number | null
  events_last_7d: number
  events_last_30d: number
  by_type: { event_type: string; event_name: string | null; count: number }[]
  connected_sources: string[]
  confidence: Confidence
}
