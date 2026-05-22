// Tests pour business-profile-detector: mock Anthropic SDK pour vérifier
// l'appel et la normalisation de la réponse tool_use.

process.env.LOG_LEVEL = 'fatal'
process.env.ANTHROPIC_API_KEY = 'test'

const { test, mock } = require('node:test')
const assert = require('node:assert/strict')

const anthropicLib = require('../src/lib/anthropic')
const detector = require('../src/services/onboarding/business-profile-detector.service')

function withMockedClient(toolUseInput, fn) {
  const stub = {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', name: 'classify_business', input: toolUseInput }],
      }),
    },
  }
  const restore = mock.method(anthropicLib, 'getAnthropic', () => stub)
  return fn().finally(() => restore.mock.restore())
}

const SCRAPED_SAMPLE = {
  title: 'Sustainable Fashion Online — Marque Acme',
  metaDescription: "Mode éthique fabriquée en France",
  headings: ['Notre collection automne', 'Pourquoi nous'],
  bodyText: 'Marque française de prêt-à-porter durable…',
  detectedTools: { shopify: true, ga4: true, meta_pixel: true },
  finalUrl: 'https://acme.fr',
}

test('detectProfile returns the structured tool_use input', async () => {
  await withMockedClient(
    {
      sector: 'ecommerce',
      market: 'b2c',
      brand_keywords: ['mode', 'éthique', 'France'],
      description: "Marque française de prêt-à-porter durable, e-commerce.",
      confidence_score: 87,
    },
    async () => {
      const result = await detector.detectProfile({ url: 'https://acme.fr', scraped: SCRAPED_SAMPLE })
      assert.equal(result.sector, 'ecommerce')
      assert.equal(result.market, 'b2c')
      assert.deepEqual(result.brand_keywords, ['mode', 'éthique', 'France'])
      assert.equal(result.confidence_score, 87)
    },
  )
})

test('detectProfile falls back to "other"/"unknown" when AI returns invalid enums', async () => {
  await withMockedClient(
    {
      sector: 'crypto', // pas dans enum
      market: 'b2g', // pas dans enum
      brand_keywords: ['x'],
      description: 'desc',
      confidence_score: 50,
    },
    async () => {
      const result = await detector.detectProfile({ url: 'https://x.fr', scraped: SCRAPED_SAMPLE })
      assert.equal(result.sector, 'other')
      assert.equal(result.market, 'unknown')
    },
  )
})

test('detectProfile clamps confidence_score to 0-100', async () => {
  await withMockedClient(
    {
      sector: 'saas',
      market: 'b2b',
      brand_keywords: ['x'],
      description: 'd',
      confidence_score: 999,
    },
    async () => {
      const result = await detector.detectProfile({ url: 'https://x.fr', scraped: SCRAPED_SAMPLE })
      assert.equal(result.confidence_score, 100)
    },
  )
  await withMockedClient(
    {
      sector: 'saas',
      market: 'b2b',
      brand_keywords: ['x'],
      description: 'd',
      confidence_score: -42,
    },
    async () => {
      const result = await detector.detectProfile({ url: 'https://x.fr', scraped: SCRAPED_SAMPLE })
      assert.equal(result.confidence_score, 0)
    },
  )
})

test('detectProfile truncates brand_keywords to 5 entries max', async () => {
  await withMockedClient(
    {
      sector: 'ecommerce',
      market: 'b2c',
      brand_keywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      description: 'd',
      confidence_score: 80,
    },
    async () => {
      const result = await detector.detectProfile({ url: 'https://x.fr', scraped: SCRAPED_SAMPLE })
      assert.equal(result.brand_keywords.length, 5)
    },
  )
})

test('detectProfile throws AI_PARSE_FAILED if no tool_use block returned', async () => {
  const stub = {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: 'oops' }] }),
    },
  }
  const restore = mock.method(anthropicLib, 'getAnthropic', () => stub)
  try {
    await assert.rejects(
      () => detector.detectProfile({ url: 'https://x.fr', scraped: SCRAPED_SAMPLE }),
      (err) => err.code === 'AI_PARSE_FAILED',
    )
  } finally {
    restore.mock.restore()
  }
})

test('buildUserMessage includes URL, title, headings, detected tools', () => {
  const msg = detector.buildUserMessage({ url: 'https://acme.fr', scraped: SCRAPED_SAMPLE })
  assert.match(msg, /https:\/\/acme\.fr/)
  assert.match(msg, /Marque Acme/)
  assert.match(msg, /Notre collection automne/)
  assert.match(msg, /shopify/)
  assert.match(msg, /ga4/)
  assert.match(msg, /meta_pixel/)
})

test('SECTORS / MARKETS exports match enum in tool definition', () => {
  assert.deepEqual(detector.SECTORS, detector.TOOL_DEFINITION.input_schema.properties.sector.enum)
  assert.deepEqual(detector.MARKETS, detector.TOOL_DEFINITION.input_schema.properties.market.enum)
})
