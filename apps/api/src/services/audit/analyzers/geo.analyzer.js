// GEO (Generative Engine Optimization) analyzer — pure function.
//
// L'objectif est différent du SEO classique : on ne cherche pas à être bien
// classé dans Google, mais à être **cité par les LLMs** (ChatGPT, Claude,
// Perplexity, Google AI Overview, etc.) quand un utilisateur pose une
// question sur ton sujet.
//
// Les 7 checks :
//   1. AI bots autorisés dans robots.txt (GPTBot, ClaudeBot, etc.)
//   2. /llms.txt présent (standard 2024 pour briefer les LLMs)
//   3. Schema.org types riches (Organization, FAQPage, Article, etc.)
//   4. Title en format question ("How", "Why", "What") — citation-friendly
//   5. Meta description longue (>100c) — donne du contexte au LLM
//   6. Hiérarchie H2 substantielle (≥ 3 H2) — contenu structuré
//   7. Sitemap avec dates (lastmod) — signal de fraîcheur

// Liste des user-agents que tu DOIS allow dans robots.txt si tu veux être
// scrapé pour les modèles IA. Source: docs officielles de chaque provider.
const AI_BOTS = [
  // OpenAI : entraînement + search ChatGPT
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Anthropic : entraînement Claude
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google
  'Google-Extended', // Gemini training opt-out
  // Common Crawl (base d'entraînement de la plupart des LLMs)
  'CCBot',
  // Meta
  'FacebookBot',
  'meta-externalagent',
]

// Schema.org types "high signal" — leur présence indique un contenu structuré
// que les LLMs peuvent extraire facilement.
const VALUABLE_SCHEMA_TYPES = new Set([
  'Organization',
  'WebSite',
  'Article',
  'NewsArticle',
  'BlogPosting',
  'FAQPage',
  'HowTo',
  'Product',
  'Review',
  'Recipe',
  'Event',
  'BreadcrumbList',
  'Person',
  'LocalBusiness',
])

// Question-words anglais + français — un title qui commence par ça matche
// directement les requêtes utilisateurs aux LLMs.
const QUESTION_PREFIXES =
  /^(how|why|what|when|where|who|which|can|should|is|are|do|does|comment|pourquoi|qu(?:e|el|elle|els|elles)?|quand|où|qui|peut|doit|est-ce)\b/i

/**
 * @param {AuditScraped} scraped
 * @returns {{ findings: Finding[], score: number|null, summary: object }}
 */
function analyzeGEO(scraped) {
  const findings = []

  // ─── 1. AI bots dans robots.txt ─────────────────────────────────
  // On considère qu'un bot est "allowed" si :
  //   - Il a une section explicite "User-agent: <bot>" avec Allow: / OU
  //     pas de Disallow pour son user-agent
  //   - OU pas de directive du tout pour lui (= il tombe sur User-agent: *)
  //     et User-agent: * n'a pas Disallow: /
  // On considère qu'il est "blocked" si :
  //   - Section "User-agent: <bot>" avec Disallow: / explicite
  //   - OU "User-agent: *" avec Disallow: / et pas d'override pour lui
  const robotsAnalysis = analyzeRobotsForAiBots(scraped.robotsTxt)
  const blockedCount = robotsAnalysis.blocked.length
  const totalChecked = AI_BOTS.length

  findings.push({
    key: 'ai_bots_allowed',
    severity:
      blockedCount === 0 ? 'pass' : blockedCount >= totalChecked / 2 ? 'fail' : 'warn',
    title:
      blockedCount === 0
        ? `Tous les bots IA autorisés (${totalChecked} vérifiés)`
        : `${blockedCount}/${totalChecked} bots IA bloqués`,
    body:
      blockedCount === 0
        ? 'Les bots des principaux moteurs IA (OpenAI, Anthropic, Perplexity, Google Gemini) peuvent crawler ton site. C’est le prérequis pour être cité dans leurs réponses.'
        : `Bots bloqués dans robots.txt : ${robotsAnalysis.blocked.join(', ')}. Ces moteurs ne pourront pas indexer ton contenu, donc ne te citeront jamais.`,
    weight: 5,
    recommendation:
      blockedCount > 0
        ? 'Retirer les directives Disallow pour les bots IA dans robots.txt, ou ajouter explicitement des `User-agent: <bot>\\nAllow: /` pour chaque.'
        : undefined,
  })

  // ─── 2. /llms.txt ────────────────────────────────────────────────
  findings.push({
    key: 'llms_txt',
    severity: scraped.llmsTxt ? 'pass' : 'info',
    title: scraped.llmsTxt ? '/llms.txt détecté' : '/llms.txt absent',
    body: scraped.llmsTxt
      ? 'Tu fournis un fichier llms.txt — résumé Markdown structuré qui aide les LLMs à comprendre ton site sans tout crawler. Excellent.'
      : 'Le standard llms.txt (2024) permet de fournir un résumé Markdown du site optimisé pour les LLMs. Optionnel mais en croissance.',
    weight: 2,
    recommendation: scraped.llmsTxt
      ? undefined
      : 'Créer un fichier /llms.txt avec une description courte du site + liens vers les pages-clés. Voir https://llmstxt.org.',
  })

  // ─── 3. Schema.org types riches ──────────────────────────────────
  const types = new Set()
  for (const block of scraped.jsonLd) {
    _collectTypes(block, types)
  }
  const valuableTypesPresent = [...types].filter((t) => VALUABLE_SCHEMA_TYPES.has(t))

  findings.push({
    key: 'schema_richness',
    severity:
      valuableTypesPresent.length >= 3
        ? 'pass'
        : valuableTypesPresent.length >= 1
          ? 'warn'
          : 'fail',
    title:
      valuableTypesPresent.length === 0
        ? 'Aucun type Schema.org riche'
        : `${valuableTypesPresent.length} type${valuableTypesPresent.length > 1 ? 's' : ''} Schema.org riche${valuableTypesPresent.length > 1 ? 's' : ''} : ${valuableTypesPresent.join(', ')}`,
    body:
      valuableTypesPresent.length === 0
        ? 'Les LLMs s’appuient sur les structured data pour extraire des faits citables (auteur, date, prix, étapes...). Sans ça tu existes en texte libre, beaucoup plus difficile à indexer.'
        : valuableTypesPresent.length < 3
          ? 'Bon début. Ajouter d’autres types (FAQPage, BreadcrumbList, Article) renforce ta citation-worthiness.'
          : 'Très bon — variété de types qui donnent du contexte structuré aux LLMs.',
    weight: 4,
    recommendation:
      valuableTypesPresent.length < 3
        ? `Ajouter des JSON-LD pour les types pertinents : ${[...VALUABLE_SCHEMA_TYPES].slice(0, 6).join(', ')}, etc.`
        : undefined,
  })

  // ─── 4. Title en format question ─────────────────────────────────
  // Heuristique : un title qui contient "?" OU qui commence par un mot
  // interrogatif est plus facilement matché par les LLMs.
  const titleIsQuestion =
    scraped.title.includes('?') || QUESTION_PREFIXES.test(scraped.title.trim())

  findings.push({
    key: 'title_question_format',
    severity: titleIsQuestion ? 'pass' : 'info',
    title: titleIsQuestion ? 'Title en format question' : 'Title déclaratif',
    body: titleIsQuestion
      ? 'Le titre est formulé comme une question — il matchera directement les requêtes utilisateurs aux LLMs.'
      : 'Optionnel : pour les pages-réponse (blog, FAQ), reformuler le titre en question peut booster la citation par les LLMs.',
    weight: 1,
    recommendation: titleIsQuestion
      ? undefined
      : 'Pour les pages dont l’intention est de répondre à une question (blog, FAQ), tester un title type "Comment / Pourquoi / Qu’est-ce que..." — A/B utile.',
  })

  // ─── 5. Meta description longue ──────────────────────────────────
  const descLen = scraped.metaDescription.length
  findings.push({
    key: 'meta_description_geo',
    severity: descLen >= 120 ? 'pass' : descLen >= 60 ? 'warn' : 'fail',
    title:
      descLen >= 120
        ? `Meta description riche (${descLen} caractères)`
        : descLen === 0
          ? 'Meta description absente (GEO)'
          : `Meta description courte (${descLen}c)`,
    body:
      descLen >= 120
        ? 'Suffisamment de contexte pour que les LLMs comprennent le sujet et le ton de la page.'
        : 'Les LLMs utilisent la meta description comme premier résumé. Plus elle donne de contexte, mieux le LLM peut décider de te citer.',
    weight: 2,
    recommendation:
      descLen < 120
        ? 'Rédiger une meta description de 120-160 caractères qui résume le sujet et le ton (B2B, sérieux, ludique, etc.).'
        : undefined,
  })

  // ─── 6. Hiérarchie H2 ───────────────────────────────────────────
  const h2count = scraped.h2.length
  findings.push({
    key: 'content_structure',
    severity: h2count >= 5 ? 'pass' : h2count >= 2 ? 'warn' : 'fail',
    title: `${h2count} balise${h2count > 1 ? 's' : ''} H2 détectée${h2count > 1 ? 's' : ''}`,
    body:
      h2count >= 5
        ? 'Contenu bien structuré — les LLMs peuvent extraire des sections cohérentes pour citation.'
        : h2count >= 2
          ? 'Structure correcte mais améliorable. Une hiérarchie claire H2/H3 aide les LLMs à isoler les passages pertinents.'
          : 'Contenu peu structuré — risque d’être ignoré comme bloc indivisible par les LLMs.',
    weight: 3,
    recommendation:
      h2count < 5
        ? 'Découper le contenu en sections H2 thématiques (3 à 8 par page longue). Les LLMs citent des passages, pas des pages entières.'
        : undefined,
  })

  // ─── 7. Sitemap avec lastmod ─────────────────────────────────────
  const sitemapHasLastMod =
    scraped.sitemapXml && /<lastmod>/i.test(scraped.sitemapXml)
  findings.push({
    key: 'sitemap_freshness',
    severity: sitemapHasLastMod ? 'pass' : scraped.sitemapXml ? 'warn' : 'info',
    title: sitemapHasLastMod
      ? 'Sitemap avec dates de mise à jour'
      : scraped.sitemapXml
        ? 'Sitemap sans <lastmod>'
        : 'Sitemap absent (GEO)',
    body: sitemapHasLastMod
      ? 'Les balises <lastmod> donnent un signal de fraîcheur aux crawlers IA — ton contenu récent sera priorisé.'
      : scraped.sitemapXml
        ? 'Le sitemap existe mais n’a pas de <lastmod>. Les LLMs ne savent pas si ton contenu est récent.'
        : 'Pas de sitemap — vu aussi en SEO. Voir le finding correspondant.',
    weight: 1,
    recommendation:
      scraped.sitemapXml && !sitemapHasLastMod
        ? 'Ajouter <lastmod>YYYY-MM-DD</lastmod> à chaque <url> du sitemap.xml.'
        : undefined,
  })

  // ─── Score pondéré (même formule que SEO) ────────────────────────
  const VALUE = { pass: 1, warn: 0.5, fail: 0, info: null }
  let num = 0
  let den = 0
  for (const f of findings) {
    const v = VALUE[f.severity]
    if (v === null || v === undefined) continue
    num += v * f.weight
    den += f.weight
  }
  const score = den === 0 ? null : Math.round((100 * num) / den)

  const summary = {
    pass: findings.filter((f) => f.severity === 'pass').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    fail: findings.filter((f) => f.severity === 'fail').length,
    info: findings.filter((f) => f.severity === 'info').length,
  }

  return { findings, score, summary, aiBots: robotsAnalysis }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse robots.txt et détermine pour chaque AI bot s'il est autorisé ou bloqué.
 * Stratégie volontairement simple : on cherche des sections explicites
 * `User-agent: <bot>` avec leurs `Disallow:`. À défaut, on retombe sur le
 * `User-agent: *`.
 *
 * @param {string|null} robotsTxt
 * @returns {{ allowed: string[], blocked: string[], notFound: string[] }}
 */
function analyzeRobotsForAiBots(robotsTxt) {
  if (!robotsTxt) {
    // Pas de robots.txt = tout est permis par défaut.
    return { allowed: [...AI_BOTS], blocked: [], notFound: [] }
  }

  // Parse en sections par "User-agent: ..."
  const sections = _parseRobotsSections(robotsTxt)
  const wildcard = sections.get('*')
  const wildcardBlocked = wildcard && wildcard.disallow.some((p) => p === '/' || p === '')

  const allowed = []
  const blocked = []
  for (const bot of AI_BOTS) {
    const lower = bot.toLowerCase()
    const section = sections.get(lower)
    if (section) {
      // Bot a une section explicite : sa décision prime sur le wildcard.
      const botBlocked = section.disallow.some((p) => p === '/' || p === '')
      if (botBlocked) blocked.push(bot)
      else allowed.push(bot)
    } else {
      // Pas de section explicite : on hérite du wildcard.
      if (wildcardBlocked) blocked.push(bot)
      else allowed.push(bot)
    }
  }
  return { allowed, blocked, notFound: [] }
}

function _parseRobotsSections(text) {
  const sections = new Map()
  let current = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim() // strip comments
    if (!line) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const directive = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()
    if (directive === 'user-agent') {
      const ua = value.toLowerCase()
      if (!sections.has(ua)) sections.set(ua, { disallow: [], allow: [] })
      current = sections.get(ua)
    } else if (directive === 'disallow' && current) {
      current.disallow.push(value)
    } else if (directive === 'allow' && current) {
      current.allow.push(value)
    }
  }
  return sections
}

/**
 * Récolte récursivement les @type d'un bloc JSON-LD, en suivant @graph et
 * les arrays imbriqués.
 */
function _collectTypes(block, out) {
  if (!block) return
  if (Array.isArray(block)) {
    for (const x of block) _collectTypes(x, out)
    return
  }
  if (typeof block !== 'object') return
  const t = block['@type']
  if (typeof t === 'string') out.add(t)
  else if (Array.isArray(t)) t.forEach((s) => typeof s === 'string' && out.add(s))
  if (block['@graph']) _collectTypes(block['@graph'], out)
}

module.exports = { analyzeGEO, AI_BOTS, VALUABLE_SCHEMA_TYPES, analyzeRobotsForAiBots }
