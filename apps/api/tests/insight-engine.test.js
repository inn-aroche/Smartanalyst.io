// Tests du pipeline Insight Engine (aggregator + Gemini + Supabase mockés).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const GEMINI_PATH = require.resolve('../src/services/ai/gemini.service')
const AGG_PATH = require.resolve('../src/services/insights/aggregator.service')
const ENGINE_PATH = require.resolve('../src/services/insights/insight-engine.service')

function load({ context, geminiJson, geminiThrows, insertError = null } = {}) {
  const inserted = { insights: [], actions: [] }

  const insightsChain = {
    insert(row) {
      this._last = row
      inserted.insights.push(row)
      return this
    },
    select() { return this },
    single: async () => (insertError ? { data: null, error: insertError } : { data: { id: 'ins-1' }, error: null }),
  }
  const actionsChain = {
    insert(rows) {
      inserted.actions.push(...rows)
      return Promise.resolve({ error: null })
    },
  }

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: (table) => (table === 'insights' ? insightsChain : actionsChain),
      }),
    },
  }
  require.cache[GEMINI_PATH] = {
    id: GEMINI_PATH, filename: GEMINI_PATH, loaded: true,
    exports: {
      generateStructured: async () => {
        if (geminiThrows) throw geminiThrows
        return { json: geminiJson, raw: JSON.stringify(geminiJson), modelName: 'gemini-2.5-flash' }
      },
    },
  }
  require.cache[AGG_PATH] = {
    id: AGG_PATH, filename: AGG_PATH, loaded: true,
    exports: { buildContext: async () => context },
  }

  delete require.cache[ENGINE_PATH]
  const engine = require(ENGINE_PATH)
  return { engine, inserted }
}

const CONTEXT = {
  period: { start: '2026-05-14', end: '2026-06-13', comparison_start: '2026-04-13', comparison_end: '2026-05-13' },
  connected_sources: ['ga4'],
  smarttag_active: false,
  metrics: [{ metric_key: 'sessions_all', source: 'ga4', value: 12000, previous_value: 14000, delta_percent: -14.2 }],
  smarttag: [],
}

const GOOD_INSIGHT = {
  insights: [
    {
      title: 'Sessions en baisse',
      summary: 'Les sessions ont baissé de 14%.',
      category: 'traffic',
      severity: 'high',
      confidence: 'medium',
      evidence: [{ label: 'Sessions', source: 'ga4', explanation: 'Baisse vs période précédente.', value: 12000 }],
      recommended_actions: [{ title: 'Auditer SEO', description: 'Vérifier titres/metas.', priority: 'high', impact: 'medium', effort: 'low', confidence: 'medium' }],
      limitations: ['Sans Search Console, analyse partielle.'],
    },
  ],
}

test('génère et stocke un insight + son action', async () => {
  const { engine, inserted } = load({ context: CONTEXT, geminiJson: GOOD_INSIGHT })
  const res = await engine.generateForWorkspace('ws-1')
  assert.equal(res.generated, 1)
  assert.equal(inserted.insights.length, 1)
  assert.equal(inserted.insights[0].dedup_key, 'traffic:sessions-en-baisse')
  assert.equal(inserted.actions.length, 1)
  assert.equal(inserted.actions[0].insight_id, 'ins-1')
})

test('skip proprement si pas de données', async () => {
  const { engine, inserted } = load({ context: null, geminiJson: GOOD_INSIGHT })
  const res = await engine.generateForWorkspace('ws-1')
  assert.equal(res.skipped, true)
  assert.equal(res.generated, 0)
  assert.equal(inserted.insights.length, 0)
})

test('skip si Gemini non configuré (ne casse pas le sync)', async () => {
  const err = new Error('no key'); err.code = 'GEMINI_NOT_CONFIGURED'
  const { engine } = load({ context: CONTEXT, geminiThrows: err })
  const res = await engine.generateForWorkspace('ws-1')
  assert.equal(res.skipped, true)
  assert.equal(res.generated, 0)
})

test('insight invalide du modèle → 0 généré, compté en dropped', async () => {
  const bad = { insights: [{ title: 'x', summary: 'y', category: 'traffic', severity: 'high', confidence: 'low', evidence: [], recommended_actions: [] }] }
  const { engine, inserted } = load({ context: CONTEXT, geminiJson: bad })
  const res = await engine.generateForWorkspace('ws-1')
  assert.equal(res.generated, 0)
  assert.equal(res.dropped, 1)
  assert.equal(inserted.insights.length, 0)
})

test('conflit dedup (23505) → insight sauté sans throw', async () => {
  const { engine, inserted } = load({ context: CONTEXT, geminiJson: GOOD_INSIGHT, insertError: { code: '23505', message: 'dup' } })
  const res = await engine.generateForWorkspace('ws-1')
  assert.equal(res.generated, 0)
  assert.equal(inserted.actions.length, 0)
})
