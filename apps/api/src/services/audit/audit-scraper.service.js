// Audit scraper — extension du website-scraper d'onboarding avec les signaux
// supplémentaires nécessaires à l'audit SEO/GEO :
//   - meta tags étendus (canonical, OG, Twitter, robots, viewport, charset, lang)
//   - structured data (JSON-LD)
//   - count d'images sans alt, count de H1
//   - robots.txt et sitemap.xml (fetch HTTP séparé sur l'origine)
//
// On ne réutilise pas scrapeWebsite() telle quelle parce qu'elle ne retourne
// pas le HTML brut (par design — overhead de transport et c'est gros). Pour
// l'audit on a besoin de pousser plus loin sur le même `page.content()`, donc
// on relance un scrape dédié. Coût accepté : ~3 s de Playwright en double si
// jamais un user fait audit() juste après onboarding — rare en pratique.

const { logger } = require('../../lib/logger')
const { isPublicHttpUrl } = require('../onboarding/website-scraper.service')

const NAV_TIMEOUT_MS = 12_000
const FETCH_TIMEOUT_MS = 5_000
const ROBOTS_MAX_BYTES = 100_000
const SITEMAP_MAX_BYTES = 200_000

/**
 * Scrape un site pour audit. Retourne tous les signaux dans un objet plat,
 * ou `null` si le scraping a complètement échoué (DNS / timeout / SSL).
 *
 * @param {string} url
 * @returns {Promise<AuditScraped|null>}
 */
async function scrapeForAudit(url) {
  if (!isPublicHttpUrl(url)) {
    const err = new Error('INVALID_URL')
    err.code = 'INVALID_URL'
    throw err
  }

  let playwright
  try {
    playwright = require('playwright')
  } catch (err) {
    logger.error({ event: 'audit_playwright_missing' }, err.message)
    return null
  }

  let browser = null
  try {
    browser = await playwright.chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (SmartAnalystBot/0.1; +https://smartanalyst.io/bot) Chrome/120.0.0.0',
      viewport: { width: 1280, height: 720 },
    })
    const page = await context.newPage()

    // Capture le status HTTP de la 1re réponse (le doc) pour distinguer 200
    // d'un soft-404 / 5xx servi avec une page d'erreur custom.
    let mainStatus = null
    page.on('response', (res) => {
      if (mainStatus === null && res.url() === url) mainStatus = res.status()
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })

    // Extraction parallèle de tous les signaux DOM. .catch(...) sur chaque
    // pour ne pas qu'une seule extraction qui foire (ex: pas de meta description)
    // fasse échouer tout l'audit.
    const [
      title,
      lang,
      metaDescription,
      metaRobots,
      metaViewport,
      canonical,
      ogTags,
      twitterTags,
      h1List,
      h2List,
      imgs,
      jsonLd,
      finalUrl,
    ] = await Promise.all([
      page.title().catch(() => ''),
      page.$eval('html', (el) => el.getAttribute('lang') || '').catch(() => ''),
      page.$eval('meta[name="description"]', (el) => el.getAttribute('content') || '').catch(() => ''),
      page.$eval('meta[name="robots"]', (el) => el.getAttribute('content') || '').catch(() => ''),
      page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content') || '').catch(() => ''),
      page.$eval('link[rel="canonical"]', (el) => el.getAttribute('href') || '').catch(() => ''),
      page
        .$$eval('meta[property^="og:"]', (els) =>
          els.map((e) => [e.getAttribute('property'), e.getAttribute('content') || '']),
        )
        .catch(() => []),
      page
        .$$eval('meta[name^="twitter:"]', (els) =>
          els.map((e) => [e.getAttribute('name'), e.getAttribute('content') || '']),
        )
        .catch(() => []),
      page
        .$$eval('h1', (els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean))
        .catch(() => []),
      page
        .$$eval('h2', (els) =>
          els.slice(0, 30).map((e) => (e.textContent || '').trim()).filter(Boolean),
        )
        .catch(() => []),
      page
        .$$eval('img', (els) => ({
          total: els.length,
          missingAlt: els.filter((e) => !e.getAttribute('alt')).length,
        }))
        .catch(() => ({ total: 0, missingAlt: 0 })),
      page
        .$$eval('script[type="application/ld+json"]', (els) =>
          els.map((e) => (e.textContent || '').slice(0, 5000)),
        )
        .catch(() => []),
      Promise.resolve(page.url()),
    ])

    const og = Object.fromEntries(ogTags)
    const twitter = Object.fromEntries(twitterTags)
    const parsedJsonLd = jsonLd
      .map((raw) => {
        try {
          return JSON.parse(raw)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    // Fetch robots.txt + sitemap.xml sur l'origine. Asynchrones, indépendants
    // du scraping principal — un site sans robots.txt n'empêche pas l'audit.
    const origin = new URL(finalUrl).origin
    const [robotsTxt, sitemapXml] = await Promise.all([
      _fetchText(`${origin}/robots.txt`, ROBOTS_MAX_BYTES),
      _fetchText(`${origin}/sitemap.xml`, SITEMAP_MAX_BYTES),
    ])

    return {
      url,
      finalUrl,
      httpStatus: mainStatus,
      isHttps: finalUrl.startsWith('https://'),
      title: title || '',
      lang: lang || '',
      metaDescription: metaDescription || '',
      metaRobots: metaRobots || '',
      metaViewport: metaViewport || '',
      canonical: canonical || '',
      og,
      twitter,
      h1: h1List,
      h2: h2List,
      images: imgs,
      jsonLd: parsedJsonLd,
      robotsTxt, // null si fetch échec ou 404
      sitemapXml,
    }
  } catch (err) {
    logger.warn(
      { event: 'audit_scrape_failed', url, error: err.message },
      'audit scrape failed',
    )
    return null
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

/**
 * GET texte avec timeout + cap de taille. Retourne null sur erreur, 404,
 * 5xx, ou body > maxBytes. Ne suit pas les redirections vers domaine externe
 * (Node fetch les suit par défaut, ce qui est OK pour notre cas — robots.txt
 * peut redirect vers une CDN).
 */
async function _fetchText(url, maxBytes) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'SmartAnalystBot/0.1 (+https://smartanalyst.io/bot)' },
    })
    if (!res.ok) return null
    const reader = res.body.getReader()
    const chunks = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        try { await reader.cancel() } catch { /* noop */ }
        return null
      }
      chunks.push(value)
    }
    const buf = new Uint8Array(size)
    let offset = 0
    for (const c of chunks) { buf.set(c, offset); offset += c.byteLength }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { scrapeForAudit }
