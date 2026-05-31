// AI Readability analyzer — évalue la "citation-worthiness" du contenu pour
// les LLMs (ChatGPT, Claude, Perplexity, Google AI Overview).
//
// Pattern: Anthropic Haiku via tool_use, comme business-profile-detector.
// On force un output structuré pour ne pas dépendre d'un parsing texte
// fragile.
//
// Coût : ~$0.002 par audit (Haiku, ~3K tokens input + ~500 output).
// Latence : 3-5s typiquement.
//
// Si pas d'`ANTHROPIC_API_KEY` en env, on retourne un résultat "skipped"
// proprement, comme Performance. Pas de hard fail bruyant.

const anthropicLib = require('../../../lib/anthropic')
const { getAnthropic, FAST_MODEL } = anthropicLib
const { logger } = require('../../../lib/logger')

// Schéma forcé via tool_use. Chaque axe noté 0-100, plus quelques arrays
// pour les forces/faiblesses qu'on affiche en findings.
const TOOL_DEFINITION = {
  name: 'rate_ai_readability',
  description:
    'Évalue le contenu d’une page web pour sa capacité à être compris et cité par les modèles d’IA générative (ChatGPT, Claude, Perplexity).',
  input_schema: {
    type: 'object',
    properties: {
      value_prop_clarity: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Clarté de la proposition de valeur : en lisant juste le title + meta description + h1, comprend-on en 5s ce que fait/propose le site ?',
      },
      citation_worthiness: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Probabilité qu\'un LLM cite cette page comme source : présence de chiffres, dates, sources, faits vérifiables, statements concrets vs flou marketing.',
      },
      qa_structure: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Le contenu est-il structuré en question/réponse ou en sections thématiques claires que les LLMs peuvent extraire ? 100 = très clair, 0 = bloc de texte indivisible.',
      },
      jargon_level: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Niveau de jargon (terme métier non expliqué, acronymes obscurs, anglicismes inutiles). 0 = aucun jargon, 100 = inintelligible pour un non-expert. Plus c\'est bas, plus c\'est citable.',
      },
      title_content_coherence: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Cohérence entre la promesse du title et ce que livre réellement le contenu. 100 = title tient parole, 0 = clickbait / titre trompeur.',
      },
      key_strengths: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 4,
        description:
          '2 à 4 points forts du contenu du point de vue d\'un LLM (en français, courts et concrets).',
      },
      key_weaknesses: {
        type: 'array',
        items: { type: 'string' },
        minItems: 0,
        maxItems: 4,
        description:
          '0 à 4 points faibles à corriger pour booster la citation par les LLMs (en français, actionnables).',
      },
      summary: {
        type: 'string',
        maxLength: 400,
        description:
          'Verdict synthétique en 1-2 phrases (français), neutre et factuel.',
      },
    },
    required: [
      'value_prop_clarity',
      'citation_worthiness',
      'qa_structure',
      'jargon_level',
      'title_content_coherence',
      'key_strengths',
      'key_weaknesses',
      'summary',
    ],
  },
}

const SYSTEM_PROMPT = `Tu es un expert en Generative Engine Optimization (GEO) — la discipline qui consiste à optimiser le contenu pour qu'il soit cité par les LLMs comme ChatGPT, Claude, Perplexity, Google AI Overview.

À partir du contenu d'une page web (title, meta description, headings, body), tu évalues sur 5 axes (0-100) :
- value_prop_clarity : clarté de la proposition de valeur dès le title + intro
- citation_worthiness : présence de faits, chiffres, sources, statements concrets vs flou marketing
- qa_structure : contenu en sections claires que les LLMs peuvent isoler vs bloc indivisible
- jargon_level : 0 = clair pour un non-expert, 100 = inintelligible
- title_content_coherence : le title tient-il parole ?

Tu identifies aussi 2-4 forces et 0-4 faiblesses ACTIONNABLES, en français produit (pas "ajoute du SEO", mais par exemple "Le H1 ne reprend pas la promesse du title, qui parle de X alors que le H1 parle de Y").

Sois sobre dans les scores : 80+ doit être réservé aux contenus vraiment bien faits. La moyenne d'un site bien fait est ~65.

Tu DOIS répondre via l'outil rate_ai_readability.`

/**
 * Analyse le contenu via Claude Haiku.
 * @param {AuditScraped} scraped
 * @returns {Promise<{
 *   skipped: false, score: number, findings: Finding[], summary: object, ai: object
 * } | {
 *   skipped: true, reason: string, findings: Finding[], score: null, summary: object
 * }>}
 */
async function analyzeAI(scraped) {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.info({ event: 'ai_analyzer_skipped_no_key' })
    return _buildSkippedResult(
      'AI_KEY_MISSING',
      'Pour activer l\'analyse IA-readiness (citation par ChatGPT/Claude/Perplexity), définir ANTHROPIC_API_KEY côté API.',
    )
  }

  const userMessage = _buildUserMessage(scraped)

  try {
    const client = getAnthropic()
    const response = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'tool', name: TOOL_DEFINITION.name },
      messages: [{ role: 'user', content: userMessage }],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse) {
      logger.warn({ event: 'ai_analyzer_no_tool_use', response: response.content })
      return _buildSkippedResult('AI_PARSE_FAILED', 'L\'IA n\'a pas renvoyé de résultat structuré.')
    }

    const parsed = toolUse.input
    // Clamp défensif (Haiku peut techniquement renvoyer hors-bornes malgré
    // le schema, et silencieusement tronquer/clamper coté serveur évite un
    // crash côté front).
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))
    const ai = {
      value_prop_clarity: clamp(parsed.value_prop_clarity),
      citation_worthiness: clamp(parsed.citation_worthiness),
      qa_structure: clamp(parsed.qa_structure),
      jargon_level: clamp(parsed.jargon_level),
      title_content_coherence: clamp(parsed.title_content_coherence),
      key_strengths: Array.isArray(parsed.key_strengths)
        ? parsed.key_strengths.slice(0, 4).filter((s) => typeof s === 'string')
        : [],
      key_weaknesses: Array.isArray(parsed.key_weaknesses)
        ? parsed.key_weaknesses.slice(0, 4).filter((s) => typeof s === 'string')
        : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 400) : '',
    }

    const findings = _buildFindings(ai)

    // Score AI global = moyenne pondérée des 5 axes (jargon inversé).
    const score = Math.round(
      (ai.value_prop_clarity * 3 +
        ai.citation_worthiness * 3 +
        ai.qa_structure * 2 +
        (100 - ai.jargon_level) * 1 +
        ai.title_content_coherence * 1) /
        10,
    )

    const summary = {
      pass: findings.filter((f) => f.severity === 'pass').length,
      warn: findings.filter((f) => f.severity === 'warn').length,
      fail: findings.filter((f) => f.severity === 'fail').length,
      info: findings.filter((f) => f.severity === 'info').length,
    }

    return { skipped: false, score, findings, summary, ai }
  } catch (err) {
    logger.error(
      { event: 'ai_analyzer_failed', error: err.message },
      'AI analyzer call failed',
    )
    return _buildSkippedResult('AI_ERROR', `Erreur IA : ${err.message?.slice(0, 200) || 'inconnue'}.`)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function _buildUserMessage(scraped) {
  return `Analyse cette page web :

URL: ${scraped.url}
Titre: ${scraped.title || '(vide)'}
Meta description: ${scraped.metaDescription || '(vide)'}

Headings H1: ${(scraped.h1 || []).slice(0, 5).join(' | ') || '(aucun)'}
Headings H2: ${(scraped.h2 || []).slice(0, 15).join(' | ') || '(aucun)'}

Body text (extrait, ~5000 caractères max) :
${(scraped.bodyText || '').slice(0, 5000) || '(contenu textuel non récupéré)'}`
}

function _buildFindings(ai) {
  const sev = (score, goodThreshold, warnThreshold) =>
    score >= goodThreshold ? 'pass' : score >= warnThreshold ? 'warn' : 'fail'
  // Pour jargon_level, plus c'est BAS, mieux c'est. On inverse les seuils.
  const sevInverted = (score, goodThreshold, warnThreshold) =>
    score <= goodThreshold ? 'pass' : score <= warnThreshold ? 'warn' : 'fail'

  const findings = [
    {
      key: 'value_prop_clarity',
      severity: sev(ai.value_prop_clarity, 75, 50),
      title: `Clarté de la proposition de valeur : ${ai.value_prop_clarity}/100`,
      body:
        ai.value_prop_clarity >= 75
          ? 'En lisant ton title + intro, on comprend en 5s ce que tu proposes — exactement ce que les LLMs cherchent pour citer.'
          : ai.value_prop_clarity >= 50
            ? 'La promesse est compréhensible mais peut être plus directe. Les LLMs préfèrent des phrases claires de type "X fait Y pour Z".'
            : 'La promesse est floue. Les LLMs auront du mal à expliquer ce que tu fais — donc à te citer comme source.',
      weight: 4,
    },
    {
      key: 'citation_worthiness',
      severity: sev(ai.citation_worthiness, 75, 50),
      title: `Citation-worthiness : ${ai.citation_worthiness}/100`,
      body:
        ai.citation_worthiness >= 75
          ? 'Le contenu contient des faits, chiffres, dates précises. Excellent — les LLMs aiment citer des sources avec données vérifiables.'
          : ai.citation_worthiness >= 50
            ? 'Quelques faits mais beaucoup de phrases marketing génériques. Ajouter des chiffres, dates, sources renforce la citabilité.'
            : 'Le contenu manque de faits concrets — surtout du flou marketing. Les LLMs préfèrent citer Wikipédia, Statista ou un blog avec données.',
      weight: 3,
    },
    {
      key: 'ai_qa_structure',
      severity: sev(ai.qa_structure, 70, 45),
      title: `Structure citable : ${ai.qa_structure}/100`,
      body:
        ai.qa_structure >= 70
          ? 'Le contenu est bien découpé en sections que les LLMs peuvent isoler pour citation par passage.'
          : 'Le contenu mériterait d\'être plus découpé en sous-questions ou sections thématiques que les LLMs peuvent extraire.',
      weight: 2,
    },
    {
      key: 'jargon',
      severity: sevInverted(ai.jargon_level, 30, 55),
      title: `Niveau de jargon : ${ai.jargon_level}/100`,
      body:
        ai.jargon_level <= 30
          ? 'Vocabulaire accessible — un LLM peut résumer ton contenu pour un public large.'
          : ai.jargon_level <= 55
            ? 'Quelques termes métier non expliqués. Définir le jargon dans la première occurrence aide les LLMs à généraliser.'
            : 'Beaucoup de jargon non expliqué. Les LLMs vont soit te paraphraser maladroitement, soit ne pas te citer pour un public général.',
      weight: 2,
    },
    {
      key: 'title_content_coherence',
      severity: sev(ai.title_content_coherence, 80, 55),
      title: `Cohérence titre/contenu : ${ai.title_content_coherence}/100`,
      body:
        ai.title_content_coherence >= 80
          ? 'Le titre tient sa promesse. Pas de clickbait.'
          : ai.title_content_coherence >= 55
            ? 'Cohérence moyenne — le contenu répond partiellement à ce que le titre promet.'
            : 'Le titre promet quelque chose que le contenu ne livre pas. Les LLMs détectent ça et évitent de citer (pénalisé en post-training).',
      weight: 1,
    },
  ]

  // Forces & faiblesses → findings info
  for (const strength of ai.key_strengths || []) {
    findings.push({
      key: `strength_${findings.length}`,
      severity: 'info',
      title: '+ ' + strength,
      body: '',
      weight: 0,
    })
  }
  for (const weakness of ai.key_weaknesses || []) {
    findings.push({
      key: `weakness_${findings.length}`,
      severity: 'info',
      title: '− ' + weakness,
      body: '',
      weight: 0,
      recommendation: weakness,
    })
  }

  // Résumé en finding info à la fin
  if (ai.summary) {
    findings.push({
      key: 'ai_summary',
      severity: 'info',
      title: 'Verdict IA',
      body: ai.summary,
      weight: 0,
    })
  }

  return findings
}

function _buildSkippedResult(reason, message) {
  return {
    skipped: true,
    reason,
    findings: [
      {
        key: 'ai_skipped',
        severity: 'info',
        title: 'Analyse IA-readiness non disponible',
        body: message,
        weight: 0,
      },
    ],
    score: null,
    summary: { pass: 0, warn: 0, fail: 0, info: 1 },
  }
}

module.exports = { analyzeAI, TOOL_DEFINITION, SYSTEM_PROMPT, _buildFindings, _buildUserMessage }
