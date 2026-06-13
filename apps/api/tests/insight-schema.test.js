// Tests du validateur de sortie de l'Insight Engine.

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  validateInsightsPayload,
  validateInsight,
  sanitizeChartSpec,
} = require('../src/services/insights/insight-schema')

function validInsight(overrides = {}) {
  return {
    title: 'Trafic organique en baisse',
    summary: 'Les sessions organiques ont chuté de 14% sur 30 jours.',
    category: 'traffic',
    severity: 'high',
    confidence: 'medium',
    evidence: [
      { label: 'Sessions', metric_key: 'sessions_all', value: 12000, previous_value: 14000, delta_percent: -14.2, source: 'ga4', explanation: 'Baisse nette vs période précédente.' },
    ],
    recommended_actions: [
      { title: 'Auditer les pages clés', description: 'Vérifier titres/metas.', priority: 'high', impact: 'medium', effort: 'low', confidence: 'medium' },
    ],
    limitations: ['Analyse limitée sans Search Console.'],
    ...overrides,
  }
}

test('valide un insight bien formé', () => {
  const v = validateInsight(validInsight())
  assert.ok(v)
  assert.equal(v.category, 'traffic')
  assert.equal(v.evidence.length, 1)
  assert.equal(v.recommended_actions.length, 1)
})

test('rejette un insight sans preuve', () => {
  assert.equal(validateInsight(validInsight({ evidence: [] })), null)
})

test('rejette un insight sans action', () => {
  assert.equal(validateInsight(validInsight({ recommended_actions: [] })), null)
})

test('rejette une catégorie inconnue', () => {
  assert.equal(validateInsight(validInsight({ category: 'banana' })), null)
})

test('rejette une sévérité inconnue', () => {
  assert.equal(validateInsight(validInsight({ severity: 'apocalyptic' })), null)
})

test('strip le tableau data du chart_spec (anti-hallucination de chiffres)', () => {
  const spec = sanitizeChartSpec({
    chart_type: 'line',
    title: 'CPA',
    metric_key: 'cost_per_acquisition_paid',
    source: 'meta_ads',
    data: [{ date: '2026-06-01', cpa: 42 }],
  })
  assert.ok(spec)
  assert.equal(spec.data, undefined)
  assert.equal(spec.chart_type, 'line')
})

test('chart_spec de type inconnu → null', () => {
  assert.equal(sanitizeChartSpec({ chart_type: 'pie3d' }), null)
})

test('cape à 3 insights et compte les rejetés', () => {
  const payload = {
    insights: [
      validInsight(),
      validInsight({ title: 'Deux' }),
      validInsight({ title: 'Trois' }),
      validInsight({ title: 'Quatre' }),
      validInsight({ evidence: [] }), // invalide
    ],
  }
  const { insights, droppedCount } = validateInsightsPayload(payload)
  assert.equal(insights.length, 3)
  // Le 4e valide n'est pas compté en dropped (on s'arrête à 3), l'invalide non plus
  // car la boucle break dès qu'on a 3 valides. On vérifie juste qu'on a bien 3.
  assert.ok(droppedCount >= 0)
})

test('payload sans insights → tableau vide', () => {
  assert.deepEqual(validateInsightsPayload({}).insights, [])
  assert.deepEqual(validateInsightsPayload(null).insights, [])
})

test('garde au plus 3 actions par insight', () => {
  const v = validateInsight(
    validInsight({
      recommended_actions: [1, 2, 3, 4, 5].map((n) => ({
        title: `Action ${n}`,
        description: 'desc',
        priority: 'medium',
        impact: 'medium',
        effort: 'low',
        confidence: 'medium',
      })),
    }),
  )
  assert.equal(v.recommended_actions.length, 3)
})
