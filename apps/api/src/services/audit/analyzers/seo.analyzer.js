// SEO analyzer — pure function over the scraped result.
//
// Produit une liste de `findings`, chacune avec :
//   { key, severity: 'pass'|'warn'|'fail'|'info', title, body, weight, recommendation? }
//
// Le score global est calculé en pondérant : pass=1, warn=0.5, fail=0, info=neutre.
// Score final = round(100 × Σ(weight × value) / Σ(weight))
//
// Pourquoi pas une lib SEO existante ? — Le scope est volontairement étroit
// (14 checks bien choisis vs 200+ d'un Lighthouse), focus sur les findings
// actionnables. Plus simple à maintenir, plus rapide à exécuter, et nos
// recommandations sont rédigées en français produit, pas en jargon technique.

const TITLE_MIN = 30
const TITLE_MAX = 60
const DESC_MIN = 70
const DESC_MAX = 160

/**
 * @param {AuditScraped} scraped
 * @returns {{ findings: Finding[], score: number, summary: object }}
 */
function analyzeSEO(scraped) {
  const findings = []

  // ─── HTTPS ────────────────────────────────────────────────────────
  findings.push({
    key: 'https',
    severity: scraped.isHttps ? 'pass' : 'fail',
    title: 'HTTPS',
    body: scraped.isHttps
      ? 'Le site est servi en HTTPS.'
      : 'Le site est servi en HTTP — pénalisant SEO et bloquant pour la majorité des navigateurs modernes.',
    weight: 3,
    recommendation: scraped.isHttps
      ? undefined
      : 'Installer un certificat TLS (Let’s Encrypt gratuit) et rediriger tout le trafic HTTP vers HTTPS.',
  })

  // ─── HTTP status ──────────────────────────────────────────────────
  if (scraped.httpStatus !== null && scraped.httpStatus !== undefined) {
    findings.push({
      key: 'http_status',
      severity: scraped.httpStatus === 200 ? 'pass' : 'warn',
      title: `Code HTTP : ${scraped.httpStatus}`,
      body:
        scraped.httpStatus === 200
          ? 'La page racine répond bien en 200 OK.'
          : `La page racine répond en ${scraped.httpStatus} (non-200). Les moteurs peuvent l’interpréter comme indisponible.`,
      weight: 2,
    })
  }

  // ─── <title> ──────────────────────────────────────────────────────
  const tlen = scraped.title.length
  findings.push({
    key: 'title',
    severity: tlen === 0 ? 'fail' : tlen < TITLE_MIN || tlen > TITLE_MAX ? 'warn' : 'pass',
    title: tlen === 0 ? 'Balise <title> absente' : `Balise <title> (${tlen} caractères)`,
    body:
      tlen === 0
        ? 'Aucune balise <title> trouvée. C’est le premier signal pris par Google et les moteurs IA.'
        : tlen < TITLE_MIN
          ? `Le titre est trop court (${tlen}c, idéal ${TITLE_MIN}–${TITLE_MAX}).`
          : tlen > TITLE_MAX
            ? `Le titre risque d’être tronqué dans les SERP (${tlen}c, idéal ${TITLE_MIN}–${TITLE_MAX}).`
            : `Longueur optimale (${TITLE_MIN}–${TITLE_MAX}c).`,
    weight: 5,
    recommendation:
      tlen === 0 || tlen < TITLE_MIN || tlen > TITLE_MAX
        ? `Rédiger un <title> de ${TITLE_MIN} à ${TITLE_MAX} caractères contenant le mot-clé principal et la marque.`
        : undefined,
  })

  // ─── meta description ────────────────────────────────────────────
  const dlen = scraped.metaDescription.length
  findings.push({
    key: 'meta_description',
    severity: dlen === 0 ? 'warn' : dlen < DESC_MIN || dlen > DESC_MAX ? 'warn' : 'pass',
    title:
      dlen === 0
        ? 'Meta description absente'
        : `Meta description (${dlen} caractères)`,
    body:
      dlen === 0
        ? 'Pas de meta description. Google la génère automatiquement, mais c’est rarement à ton avantage.'
        : dlen < DESC_MIN
          ? `Trop courte (${dlen}c, idéal ${DESC_MIN}–${DESC_MAX}).`
          : dlen > DESC_MAX
            ? `Risque de troncature en SERP (${dlen}c, idéal ${DESC_MIN}–${DESC_MAX}).`
            : `Longueur optimale (${DESC_MIN}–${DESC_MAX}c).`,
    weight: 3,
    recommendation:
      dlen === 0 || dlen < DESC_MIN || dlen > DESC_MAX
        ? `Ajouter une <meta name="description"> de ${DESC_MIN} à ${DESC_MAX} caractères, qui donne envie de cliquer.`
        : undefined,
  })

  // ─── canonical ────────────────────────────────────────────────────
  findings.push({
    key: 'canonical',
    severity: scraped.canonical ? 'pass' : 'warn',
    title: scraped.canonical ? 'URL canonique déclarée' : 'URL canonique absente',
    body: scraped.canonical
      ? `Cible : ${scraped.canonical}`
      : 'Pas de balise <link rel="canonical">. Risque de contenu dupliqué si plusieurs URLs servent la même page.',
    weight: 2,
    recommendation: scraped.canonical
      ? undefined
      : 'Ajouter <link rel="canonical" href="..."> dans le <head> de chaque page.',
  })

  // ─── lang attribute ──────────────────────────────────────────────
  findings.push({
    key: 'lang',
    severity: scraped.lang ? 'pass' : 'warn',
    title: scraped.lang ? `<html lang="${scraped.lang}">` : 'Attribut lang absent',
    body: scraped.lang
      ? 'La langue de la page est déclarée — utile pour le SEO multilingue et l’accessibilité.'
      : 'Pas d’attribut lang sur <html>. Les moteurs et lecteurs d’écran ne savent pas dans quelle langue rendre le contenu.',
    weight: 1,
    recommendation: scraped.lang
      ? undefined
      : 'Ajouter <html lang="fr"> (ou la langue principale) au document.',
  })

  // ─── viewport ────────────────────────────────────────────────────
  findings.push({
    key: 'viewport',
    severity: scraped.metaViewport ? 'pass' : 'warn',
    title: scraped.metaViewport ? 'Viewport mobile configuré' : 'Viewport mobile absent',
    body: scraped.metaViewport
      ? 'Le site est explicitement responsive.'
      : 'Pas de <meta name="viewport">. Le site risque d’afficher en zoom desktop sur mobile, ce qui pénalise le SEO mobile-first.',
    weight: 2,
    recommendation: scraped.metaViewport
      ? undefined
      : 'Ajouter <meta name="viewport" content="width=device-width, initial-scale=1"> au <head>.',
  })

  // ─── H1 ──────────────────────────────────────────────────────────
  const h1count = scraped.h1.length
  findings.push({
    key: 'h1',
    severity: h1count === 1 ? 'pass' : h1count === 0 ? 'fail' : 'warn',
    title:
      h1count === 0
        ? 'Aucun H1 trouvé'
        : h1count === 1
          ? 'Un seul H1 (idéal)'
          : `${h1count} balises H1 détectées`,
    body:
      h1count === 0
        ? 'Un H1 unique aide Google à comprendre le sujet principal de la page.'
        : h1count === 1
          ? `Titre H1 détecté : "${scraped.h1[0].slice(0, 100)}"`
          : 'Plusieurs H1 = signal flou pour les moteurs. Réserver le H1 au titre principal et utiliser H2/H3 pour la suite.',
    weight: 3,
    recommendation:
      h1count !== 1
        ? 'Ne garder qu’un seul H1 par page, contenant le mot-clé principal.'
        : undefined,
  })

  // ─── Open Graph (réseaux sociaux + LLMs) ─────────────────────────
  const ogRequired = ['og:title', 'og:description', 'og:image']
  const ogMissing = ogRequired.filter((k) => !scraped.og[k])
  findings.push({
    key: 'open_graph',
    severity: ogMissing.length === 0 ? 'pass' : ogMissing.length === 3 ? 'fail' : 'warn',
    title:
      ogMissing.length === 0
        ? 'Open Graph complet'
        : `Open Graph incomplet (${ogMissing.length}/${ogRequired.length} manquant${ogMissing.length > 1 ? 's' : ''})`,
    body:
      ogMissing.length === 0
        ? 'og:title, og:description et og:image sont présents. Les liens partagés sur LinkedIn, Slack, WhatsApp s’afficheront bien.'
        : `Manquant : ${ogMissing.join(', ')}.`,
    weight: 2,
    recommendation:
      ogMissing.length > 0
        ? 'Ajouter les balises Open Graph manquantes dans le <head>. Au minimum og:title, og:description, og:image, og:url.'
        : undefined,
  })

  // ─── Twitter Card ────────────────────────────────────────────────
  const hasTwitterCard = !!scraped.twitter['twitter:card']
  findings.push({
    key: 'twitter_card',
    severity: hasTwitterCard ? 'pass' : 'info',
    title: hasTwitterCard ? `Twitter Card : ${scraped.twitter['twitter:card']}` : 'Twitter Card absente',
    body: hasTwitterCard
      ? 'Les liens partagés sur X/Twitter affichent un preview riche.'
      : 'Pas de <meta name="twitter:card">. Optionnel — Twitter retombera sur les OG tags.',
    weight: 1,
    recommendation: hasTwitterCard
      ? undefined
      : 'Ajouter <meta name="twitter:card" content="summary_large_image"> si tu cibles X/Twitter.',
  })

  // ─── Structured data (JSON-LD) ───────────────────────────────────
  const schemaTypes = scraped.jsonLd
    .flatMap((d) => (Array.isArray(d) ? d : [d]))
    .map((d) => d?.['@type'])
    .filter(Boolean)
  findings.push({
    key: 'structured_data',
    severity: schemaTypes.length > 0 ? 'pass' : 'warn',
    title:
      schemaTypes.length > 0
        ? `Données structurées : ${schemaTypes.join(', ')}`
        : 'Aucune donnée structurée',
    body:
      schemaTypes.length > 0
        ? 'Du JSON-LD est présent — clé pour les featured snippets Google et les résumés LLM.'
        : 'Pas de Schema.org JSON-LD. Tu rates les rich results Google et tu te rends invisible aux résumés IA.',
    weight: 4,
    recommendation:
      schemaTypes.length === 0
        ? 'Ajouter du JSON-LD pertinent : Organization sur l’accueil, Product sur les fiches, FAQPage sur les FAQ. Voir schema.org.'
        : undefined,
  })

  // ─── Images alt ──────────────────────────────────────────────────
  const altMissing = scraped.images.missingAlt
  const altTotal = scraped.images.total
  if (altTotal > 0) {
    findings.push({
      key: 'images_alt',
      severity: altMissing === 0 ? 'pass' : altMissing > altTotal / 2 ? 'fail' : 'warn',
      title:
        altMissing === 0
          ? `${altTotal} images, toutes avec alt`
          : `${altMissing}/${altTotal} images sans attribut alt`,
      body:
        altMissing === 0
          ? 'Toutes les images ont un attribut alt — bon pour le SEO image et l’accessibilité.'
          : 'Les images sans alt sont invisibles pour Google Images et les lecteurs d’écran.',
      weight: 1,
      recommendation:
        altMissing > 0
          ? 'Ajouter un alt descriptif (pas "image" ou "photo") à chaque <img>. Vide (alt="") accepté pour les images purement décoratives.'
          : undefined,
    })
  }

  // ─── robots.txt ──────────────────────────────────────────────────
  findings.push({
    key: 'robots_txt',
    severity: scraped.robotsTxt ? 'pass' : 'warn',
    title: scraped.robotsTxt ? 'robots.txt accessible' : 'robots.txt absent',
    body: scraped.robotsTxt
      ? 'Le fichier robots.txt est servi.'
      : 'Pas de /robots.txt. Sans lui, les crawlers utilisent leur comportement par défaut — pas dramatique mais pas idéal.',
    weight: 1,
    recommendation: scraped.robotsTxt
      ? undefined
      : 'Créer un fichier /robots.txt avec au minimum la directive Sitemap.',
  })

  // ─── sitemap.xml ─────────────────────────────────────────────────
  // Check soit sitemap.xml direct, soit déclaré dans robots.txt
  const sitemapDeclaredInRobots =
    scraped.robotsTxt && /^\s*Sitemap:\s*\S+/im.test(scraped.robotsTxt)
  const hasSitemap = !!scraped.sitemapXml || sitemapDeclaredInRobots
  findings.push({
    key: 'sitemap',
    severity: hasSitemap ? 'pass' : 'warn',
    title: hasSitemap ? 'Sitemap XML détecté' : 'Sitemap XML absent',
    body: hasSitemap
      ? scraped.sitemapXml
        ? '/sitemap.xml répond — Google peut indexer toutes les pages déclarées.'
        : 'Sitemap déclaré via robots.txt.'
      : 'Pas de /sitemap.xml ni de directive Sitemap dans robots.txt. Google découvre uniquement par le crawl naturel — plus lent pour les nouveaux contenus.',
    weight: 2,
    recommendation: hasSitemap
      ? undefined
      : 'Générer un sitemap.xml et le déclarer dans robots.txt avec `Sitemap: https://...`.',
  })

  // ─── meta robots noindex ─────────────────────────────────────────
  const noindex = /\bnoindex\b/i.test(scraped.metaRobots)
  if (noindex) {
    findings.push({
      key: 'meta_robots_noindex',
      severity: 'fail',
      title: 'Page en noindex',
      body: 'La balise <meta name="robots" content="..."> contient noindex — la page ne sera pas indexée par Google.',
      weight: 5,
      recommendation:
        'Si la page doit être indexée, retirer le noindex. Sinon, c’est volontaire — ignorer ce finding.',
    })
  }

  // ─── Calcul du score pondéré ────────────────────────────────────
  const VALUE = { pass: 1, warn: 0.5, fail: 0, info: null }
  let num = 0
  let den = 0
  for (const f of findings) {
    const v = VALUE[f.severity]
    if (v === null || v === undefined) continue // info = neutre
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

  return { findings, score, summary }
}

module.exports = { analyzeSEO }
