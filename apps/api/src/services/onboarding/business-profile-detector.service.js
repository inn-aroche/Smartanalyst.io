// Business profile detector — Claude Haiku via tool_use (output structuré).
//
// Source: docs/08_API_ONBOARDING.md, docs/16_SERVICE_IA_INSIGHTS.md
//
// Pattern: tool_use force le modèle à retourner un JSON conforme au schéma
// (pas de parsing fragile sur un texte libre).

// Import en mode "objet" pour permettre aux tests de mocker via mock.method(anthropicLib, ...)
const anthropicLib = require('../../lib/anthropic')
const { logger } = require('../../lib/logger')

const SECTORS = [
  'ecommerce',
  'saas',
  'agency',
  'local_business',
  'media',
  'professional_services',
  'other',
]
const MARKETS = ['b2b', 'b2c', 'b2b2c', 'unknown']

const TOOL_DEFINITION = {
  name: 'classify_business',
  description:
    "Analyse un site web et retourne un profil business structuré: secteur, marché, mots-clés de marque, description, score de confiance.",
  input_schema: {
    type: 'object',
    properties: {
      sector: {
        type: 'string',
        enum: SECTORS,
        description: "Secteur d'activité détecté",
      },
      market: {
        type: 'string',
        enum: MARKETS,
        description: 'Marché cible',
      },
      brand_keywords: {
        type: 'array',
        items: { type: 'string' },
        description:
          '3 à 5 mots-clés caractérisant la marque (en français si le site est français)',
      },
      description: {
        type: 'string',
        description: '1 à 2 phrases décrivant le business, en français',
      },
      confidence_score: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Confiance dans la classification (100 = certitude, 0 = pure spéculation)',
      },
    },
    required: ['sector', 'market', 'brand_keywords', 'description', 'confidence_score'],
  },
}

const SYSTEM_PROMPT = `Tu es un analyste marketing senior chez SmartAnalyst. À partir du contenu scrapé d'un site web, tu identifies:
- Le secteur d'activité (ecommerce, saas, agency, local_business, media, professional_services, other)
- Le marché cible (b2b, b2c, b2b2c, unknown)
- Les mots-clés de marque (3-5, en français si le site l'est)
- Une description concise (1-2 phrases, en français)
- Un score de confiance (0-100)

Sois sobre: si le signal est faible, baisse le confidence_score. Ne pas inventer.
Tu DOIS répondre via l'outil classify_business.`

function buildUserMessage({ url, scraped }) {
  const detectedToolsList = Object.keys(scraped.detectedTools || {}).join(', ') || 'aucun détecté'
  return `Analyse ce site:

URL: ${url}
Final URL après redirections: ${scraped.finalUrl || url}
Titre: ${scraped.title || '(vide)'}
Meta description: ${scraped.metaDescription || '(vide)'}
Headings principaux: ${(scraped.headings || []).slice(0, 15).join(' | ') || '(aucun)'}
Outils détectés dans le HTML: ${detectedToolsList}

Extrait du contenu visible (max 5000 chars):
"""
${scraped.bodyText || '(vide)'}
"""`
}

/**
 * Classifie le site via Claude Haiku.
 * @param {Object} params
 * @param {string} params.url
 * @param {Object} params.scraped - sortie de scrapeWebsite()
 * @returns {Promise<{
 *   sector: string,
 *   market: string,
 *   brand_keywords: string[],
 *   description: string,
 *   confidence_score: number,
 * }>}
 */
async function detectProfile({ url, scraped }) {
  const client = anthropicLib.getAnthropic()
  const response = await client.messages.create({
    model: anthropicLib.FAST_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_DEFINITION],
    tool_choice: { type: 'tool', name: 'classify_business' },
    messages: [{ role: 'user', content: buildUserMessage({ url, scraped }) }],
  })

  const toolUse = (response.content || []).find((b) => b.type === 'tool_use')
  if (!toolUse) {
    logger.error(
      { event: 'profile_detect_no_tool_use', url, raw: response.content },
      'Claude did not return tool_use',
    )
    const err = new Error('AI did not return a structured profile')
    err.code = 'AI_PARSE_FAILED'
    throw err
  }

  const profile = toolUse.input
  // Garde-fou: vérifie que les enums sont bien respectées
  if (!SECTORS.includes(profile.sector)) profile.sector = 'other'
  if (!MARKETS.includes(profile.market)) profile.market = 'unknown'
  profile.confidence_score = Math.max(0, Math.min(100, parseInt(profile.confidence_score, 10) || 0))
  profile.brand_keywords = Array.isArray(profile.brand_keywords)
    ? profile.brand_keywords.slice(0, 5).map(String)
    : []

  return profile
}

module.exports = { detectProfile, SECTORS, MARKETS, TOOL_DEFINITION, SYSTEM_PROMPT, buildUserMessage }
