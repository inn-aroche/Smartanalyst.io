// Schéma + validateur de la sortie de l'Insight Engine.
//
// Gemini est appelé en responseMimeType=application/json (force du JSON
// valide). Mais "JSON valide" ≠ "JSON conforme à notre contrat" : on
// re-valide ici, en mode TOLÉRANT — on garde les insights bien formés et
// on jette silencieusement ceux qui ne le sont pas, plutôt que de faire
// échouer tout le batch. Mieux vaut 2 insights propres que 0.

const CATEGORIES = new Set([
  'tracking',
  'traffic',
  'conversion',
  'paid_media',
  'seo',
  'revenue',
  'data_quality',
  'opportunity',
])
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])
const CONFIDENCES = new Set(['low', 'medium', 'high'])
const IMPACTS = new Set(['low', 'medium', 'high'])
const EFFORTS = new Set(['low', 'medium', 'high'])
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical'])

const MAX_INSIGHTS = 3
const MAX_ACTIONS_PER_INSIGHT = 3

// Bloc inséré dans le prompt pour décrire le contrat attendu.
const SCHEMA_DESCRIPTION_FOR_PROMPT = `Tu dois retourner UNIQUEMENT un objet JSON de cette forme :
{
  "insights": [
    {
      "title": "string court et clair",
      "summary": "string compréhensible par un non-technicien",
      "category": "tracking|traffic|conversion|paid_media|seo|revenue|data_quality|opportunity",
      "severity": "low|medium|high|critical",
      "confidence": "low|medium|high",
      "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "comparison_start": "YYYY-MM-DD", "comparison_end": "YYYY-MM-DD" },
      "primary_source": "ga4|meta_ads|stripe|shopify|smarttag|...",
      "evidence": [
        { "label": "string", "metric_key": "string|null", "value": number|string|null, "previous_value": number|string|null, "delta_percent": number|null, "source": "string", "explanation": "string" }
      ],
      "chart_spec": { "chart_type": "line|bar|donut|funnel|sparkline", "title": "string", "metric_key": "string", "dimension": "string|null", "source": "string" } OU null,
      "recommended_actions": [
        { "title": "string", "description": "string", "priority": "low|medium|high|critical", "impact": "low|medium|high", "effort": "low|medium|high", "confidence": "low|medium|high", "expected_impact": {}, "follow_up_check": {} }
      ],
      "limitations": ["string"]
    }
  ]
}
Maximum ${MAX_INSIGHTS} insights, ${MAX_ACTIONS_PER_INSIGHT} actions par insight.
IMPORTANT : ne mets JAMAIS de tableau "data" dans chart_spec — tu décris seulement quelle métrique/dimension afficher, le système remplira les valeurs lui-même. Tu ne dois jamais inventer de chiffres.`

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function cleanString(v, max = 2000) {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function validateAction(a) {
  if (!a || typeof a !== 'object') return null
  if (!isNonEmptyString(a.title)) return null
  if (!PRIORITIES.has(a.priority)) return null
  if (!IMPACTS.has(a.impact)) return null
  if (!EFFORTS.has(a.effort)) return null
  if (!CONFIDENCES.has(a.confidence)) return null
  return {
    title: cleanString(a.title, 300),
    description: cleanString(a.description, 1500),
    priority: a.priority,
    impact: a.impact,
    effort: a.effort,
    confidence: a.confidence,
    expected_impact: a.expected_impact && typeof a.expected_impact === 'object' ? a.expected_impact : null,
    follow_up_check: a.follow_up_check && typeof a.follow_up_check === 'object' ? a.follow_up_check : null,
  }
}

function validateEvidence(e) {
  if (!e || typeof e !== 'object') return null
  if (!isNonEmptyString(e.label) || !isNonEmptyString(e.source) || !isNonEmptyString(e.explanation)) {
    return null
  }
  return {
    label: cleanString(e.label, 200),
    metric_key: isNonEmptyString(e.metric_key) ? e.metric_key : null,
    value: ['number', 'string'].includes(typeof e.value) ? e.value : null,
    previous_value: ['number', 'string'].includes(typeof e.previous_value) ? e.previous_value : null,
    delta_percent: typeof e.delta_percent === 'number' ? e.delta_percent : null,
    source: cleanString(e.source, 60),
    explanation: cleanString(e.explanation, 1000),
  }
}

/**
 * Nettoie un chart_spec : on RETIRE tout tableau `data` que le modèle aurait
 * mis (il ne doit pas transcrire de chiffres — c'est le backend qui remplira).
 * On garde la description du graphe (type, métrique, dimension).
 */
function sanitizeChartSpec(spec) {
  if (!spec || typeof spec !== 'object') return null
  const VALID_TYPES = new Set(['line', 'bar', 'donut', 'funnel', 'sparkline'])
  if (!VALID_TYPES.has(spec.chart_type)) return null
  return {
    chart_type: spec.chart_type,
    title: cleanString(spec.title, 200),
    metric_key: isNonEmptyString(spec.metric_key) ? spec.metric_key : null,
    dimension: isNonEmptyString(spec.dimension) ? spec.dimension : null,
    source: isNonEmptyString(spec.source) ? spec.source : null,
    // data: VOLONTAIREMENT absent — rempli côté backend au rendu.
  }
}

function validateInsight(ins) {
  if (!ins || typeof ins !== 'object') return null
  if (!isNonEmptyString(ins.title) || !isNonEmptyString(ins.summary)) return null
  if (!CATEGORIES.has(ins.category)) return null
  if (!SEVERITIES.has(ins.severity)) return null
  if (!CONFIDENCES.has(ins.confidence)) return null

  const evidence = Array.isArray(ins.evidence)
    ? ins.evidence.map(validateEvidence).filter(Boolean)
    : []
  const actions = Array.isArray(ins.recommended_actions)
    ? ins.recommended_actions.map(validateAction).filter(Boolean).slice(0, MAX_ACTIONS_PER_INSIGHT)
    : []

  // Règle métier : un insight DOIT avoir au moins une preuve et une action,
  // sinon ce n'est pas actionnable → on le jette.
  if (evidence.length === 0 || actions.length === 0) return null

  const limitations = Array.isArray(ins.limitations)
    ? ins.limitations.filter(isNonEmptyString).map((s) => cleanString(s, 500))
    : []

  const period = ins.period && typeof ins.period === 'object' ? ins.period : {}

  return {
    title: cleanString(ins.title, 300),
    summary: cleanString(ins.summary, 2000),
    category: ins.category,
    severity: ins.severity,
    confidence: ins.confidence,
    primary_source: isNonEmptyString(ins.primary_source) ? ins.primary_source : null,
    period: {
      start: isNonEmptyString(period.start) ? period.start : null,
      end: isNonEmptyString(period.end) ? period.end : null,
      comparison_start: isNonEmptyString(period.comparison_start) ? period.comparison_start : null,
      comparison_end: isNonEmptyString(period.comparison_end) ? period.comparison_end : null,
    },
    evidence,
    chart_spec: sanitizeChartSpec(ins.chart_spec),
    recommended_actions: actions,
    limitations,
  }
}

/**
 * Valide la payload complète renvoyée par Gemini.
 * @returns {{ insights: Array, droppedCount: number }}
 */
function validateInsightsPayload(payload) {
  const arr = payload && Array.isArray(payload.insights) ? payload.insights : []
  const valid = []
  let dropped = 0
  for (const raw of arr) {
    const v = validateInsight(raw)
    if (v) valid.push(v)
    else dropped++
    if (valid.length >= MAX_INSIGHTS) break
  }
  return { insights: valid, droppedCount: dropped }
}

module.exports = {
  validateInsightsPayload,
  validateInsight,
  sanitizeChartSpec,
  SCHEMA_DESCRIPTION_FOR_PROMPT,
  CATEGORIES,
  SEVERITIES,
  CONFIDENCES,
  MAX_INSIGHTS,
}
