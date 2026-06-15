// Tests validation NL d'une description de watch (Gemini mocké).

const test = require('node:test')
const assert = require('node:assert/strict')

const GEMINI_PATH = require.resolve('../src/services/ai/gemini.service')
const SERVICE_PATH = require.resolve('../src/services/watches/watch-validator.service')

function load({ json = null, throws = null } = {}) {
  require.cache[GEMINI_PATH] = {
    id: GEMINI_PATH,
    filename: GEMINI_PATH,
    loaded: true,
    exports: {
      generateStructured: async () => {
        if (throws) throw throws
        return { json, raw: '', modelName: 'gemini-2.5-flash' }
      },
    },
  }
  delete require.cache[SERVICE_PATH]
  return require(SERVICE_PATH)
}

test('description trop courte → confidence low, métrique null', async () => {
  const svc = load()
  const r = await svc.validateIntent('ab')
  assert.equal(r.confidence, 'low')
  assert.equal(r.metric_key, null)
})

test('Gemini renvoie un match clair → propagé tel quel', async () => {
  const svc = load({
    json: {
      metric_key: 'return_on_investment_paid',
      operator: 'drops_below',
      threshold: 2,
      confidence: 'high',
      explanation: 'Tu veux être prévenu quand ton ROAS descend sous 2.',
    },
  })
  const r = await svc.validateIntent('Préviens-moi quand mon ROAS descend sous 2')
  assert.equal(r.metric_key, 'return_on_investment_paid')
  assert.equal(r.operator, 'drops_below')
  assert.equal(r.threshold, 2)
  assert.equal(r.confidence, 'high')
})

test('Gemini renvoie unknown → métrique null', async () => {
  const svc = load({
    json: {
      metric_key: 'unknown',
      operator: 'unknown',
      threshold: 0,
      confidence: 'low',
      explanation: 'Description trop floue.',
    },
  })
  const r = await svc.validateIntent('truc bizarre')
  assert.equal(r.metric_key, null)
  assert.equal(r.operator, null)
  assert.equal(r.threshold, null)
})

test('threshold 0 ou négatif → null', async () => {
  const svc = load({
    json: {
      metric_key: 'sessions_all',
      operator: 'any_change',
      threshold: 0,
      confidence: 'high',
      explanation: 'OK',
    },
  })
  const r = await svc.validateIntent('Surveille mes sessions')
  assert.equal(r.threshold, null)
})

test('Gemini down → fallback confidence low + explanation pédagogique', async () => {
  const svc = load({ throws: new Error('Gemini timeout') })
  const r = await svc.validateIntent('Préviens-moi sur le ROAS')
  assert.equal(r.confidence, 'low')
  assert.equal(r.metric_key, null)
  assert.match(r.explanation, /interpr/i)
})

test('ALLOWED_METRICS exporte la whitelist canonique', () => {
  const svc = load()
  assert.ok(Array.isArray(svc.ALLOWED_METRICS))
  assert.ok(svc.ALLOWED_METRICS.includes('return_on_investment_paid'))
})
