// Website scraper service.
//
// Source: docs/08_API_ONBOARDING.md, docs/02_BONNES_PRATIQUES_TRANSVERSALES.md
//
// Stratégie:
//   1. Launch headless Chromium via Playwright
//   2. goto(url) avec waitUntil='domcontentloaded' (network idle est trop strict
//      pour beaucoup de sites, on retombe en fallback si besoin)
//   3. Timeout 10s pour ne pas bloquer le user
//   4. Extract: title, meta description, h1/h2, body text (truncated), HTML
//   5. Détection d'outils par regex sur HTML
//
// Pré-requis runtime: `npx playwright install chromium` (~300 Mo, à faire
// une seule fois au déploiement). Le code charge playwright lazy pour ne pas
// faire crasher l'app au boot si la lib n'est pas dispo.

const { logger } = require('../../lib/logger')

const NAV_TIMEOUT_MS = 10_000
const BODY_TEXT_MAX_LEN = 5_000

// Patterns de détection (regex insensibles à la casse appliquées sur HTML)
const TOOL_PATTERNS = {
  shopify: /cdn\.shopify\.com|window\.Shopify\b|shopify[-_]section/i,
  woocommerce: /woocommerce|wp-content\/plugins\/woocommerce/i,
  wordpress: /wp-content|wp-includes|wp-json/i,
  ga4: /googletagmanager\.com\/gtag\/js|gtag\(\s*['"]config['"]\s*,\s*['"]G-/i,
  gtm: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i,
  meta_pixel: /connect\.facebook\.net\/[a-z_]+\/fbevents\.js|fbq\s*\(\s*['"]init['"]/i,
  linkedin_insight: /snap\.licdn\.com|_linkedin_data_partner_ids/i,
  tiktok_pixel: /analytics\.tiktok\.com\/i18n\/pixel/i,
  pinterest_tag: /ct\.pinterest\.com\/v3|pintrk\s*\(/i,
  hotjar: /static\.hotjar\.com|_hjSettings/i,
  intercom: /widget\.intercom\.io|intercomSettings/i,
  klaviyo: /a\.klaviyo\.com|klaviyo\.js/i,
  mailchimp: /list-manage\.com|mailchimp\.com/i,
  hubspot: /js\.hs-scripts\.com|hbspt\.forms/i,
  stripe: /js\.stripe\.com\/v3/i,
  segment: /cdn\.segment\.(com|io)\/analytics\.js/i,
  cloudflare: /cloudflare/i,
}

/**
 * Scrape un site web et extrait les signaux clés.
 * @param {string} url
 * @returns {Promise<{
 *   title: string,
 *   metaDescription: string,
 *   headings: string[],
 *   bodyText: string,
 *   detectedTools: Record<string, true>,
 *   finalUrl: string,
 * } | null>} - null si le scraping a échoué (timeout, DNS, etc.)
 */
async function scrapeWebsite(url) {
  let playwright
  try {
    playwright = require('playwright')
  } catch (err) {
    logger.error({ event: 'playwright_not_installed', error: err.message }, 'playwright not installed')
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

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })

    const [title, metaDescription, headings, html] = await Promise.all([
      page.title().catch(() => ''),
      page
        .$eval('meta[name="description"]', (el) => el.getAttribute('content') || '')
        .catch(() => ''),
      page
        .$$eval('h1, h2', (els) =>
          els.slice(0, 30).map((e) => (e.textContent || '').trim()).filter(Boolean),
        )
        .catch(() => []),
      page.content().catch(() => ''),
    ])

    const bodyText = (await page.evaluate(() => document.body?.innerText || '').catch(() => ''))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, BODY_TEXT_MAX_LEN)

    const detectedTools = detectTools(html)
    const finalUrl = page.url()

    return { title, metaDescription, headings, bodyText, detectedTools, finalUrl }
  } catch (err) {
    logger.warn({ event: 'scrape_failed', url, error: err.message }, 'Website scrape failed')
    return null
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}

/**
 * Détecte les outils marketing/tech à partir du HTML brut.
 * Pure function — testable sans Playwright.
 * @param {string} html
 * @returns {Record<string, true>}
 */
function detectTools(html) {
  const detected = {}
  if (!html) return detected
  for (const [name, pattern] of Object.entries(TOOL_PATTERNS)) {
    if (pattern.test(html)) detected[name] = true
  }
  return detected
}

/**
 * Validation simple d'URL: doit être http(s), pas de localhost/private IP.
 * @param {string} url
 * @returns {boolean}
 */
function isPublicHttpUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false
  }
  // Plages IP privées (cas simples — ne couvre pas tout, mais bloque l'évident)
  if (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  ) {
    return false
  }
  return true
}

module.exports = { scrapeWebsite, detectTools, isPublicHttpUrl, TOOL_PATTERNS }
