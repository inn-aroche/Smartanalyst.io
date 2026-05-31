// Performance audit via Google PageSpeed Insights API (gratuite, 25k req/jour
// avec une clé API).
//
// Note : sans `PAGESPEED_API_KEY` en env, on appelle quand même l'API mais on
// est rate-limité plus sévèrement (et risque de hit du quota anonyme). On
// retourne dans ce cas un résultat "skipped" avec une finding info qui
// l'explique côté UI — pas de fail bruyant.
//
// L'API est lente (15-30s typiquement) parce qu'elle lance un vrai Lighthouse
// côté Google. C'est pour ça qu'on l'appelle en parallèle du scraper Playwright
// dans audit.service.js — temps total = max(scraper, perf) ≈ 30s.

const { logger } = require('../../lib/logger')

const PAGESPEED_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const PAGESPEED_TIMEOUT_MS = 35_000 // un peu plus que le typical 30s côté Google

/**
 * @param {string} url — URL absolue http(s)
 * @param {{strategy?: 'mobile'|'desktop'}} options
 * @returns {Promise<{ skipped: true, reason: string, findings: Finding[], score: null }
 *                  | { skipped: false, score: number, metrics: object, findings: Finding[], summary: object }>}
 */
async function analyzePerformance(url, { strategy = 'mobile' } = {}) {
  const apiKey = process.env.PAGESPEED_API_KEY
  if (!apiKey) {
    logger.info({ event: 'pagespeed_skipped_no_key' })
    return {
      skipped: true,
      reason: 'API_KEY_MISSING',
      findings: [
        {
          key: 'pagespeed_not_configured',
          severity: 'info',
          title: 'Analyse performance non configurée',
          body:
            'Pour activer le check Performance (Core Web Vitals via Google PageSpeed Insights), définir PAGESPEED_API_KEY côté API.',
          weight: 0,
        },
      ],
      score: null,
      summary: { pass: 0, warn: 0, fail: 0, info: 1 },
    }
  }

  const qs = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
    key: apiKey,
  })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PAGESPEED_TIMEOUT_MS)
  try {
    const res = await fetch(`${PAGESPEED_ENDPOINT}?${qs.toString()}`, {
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      logger.warn(
        { event: 'pagespeed_http_error', status: res.status, body: txt.slice(0, 500) },
        'pagespeed insights api error',
      )
      return _buildErrorResult(`PageSpeed Insights a renvoyé un code ${res.status}.`)
    }
    const json = await res.json()
    return _extractFindings(json, strategy)
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn({ event: 'pagespeed_timeout', url })
      return _buildErrorResult('Timeout de l’analyse PageSpeed (>35s). Réessaie plus tard.')
    }
    logger.error({ event: 'pagespeed_unexpected', error: err.message })
    return _buildErrorResult('Erreur inattendue PageSpeed.')
  } finally {
    clearTimeout(timer)
  }
}

function _buildErrorResult(message) {
  return {
    skipped: true,
    reason: 'API_ERROR',
    findings: [
      {
        key: 'pagespeed_error',
        severity: 'info',
        title: 'Analyse performance indisponible',
        body: message,
        weight: 0,
      },
    ],
    score: null,
    summary: { pass: 0, warn: 0, fail: 0, info: 1 },
  }
}

/**
 * Extrait les Core Web Vitals d'un payload PageSpeed Insights v5 et produit
 * des findings + un score.
 */
function _extractFindings(payload, strategy) {
  const lh = payload?.lighthouseResult
  if (!lh) return _buildErrorResult('Payload PageSpeed inattendu.')

  const audits = lh.audits || {}
  const perfScore01 = lh.categories?.performance?.score
  const score = typeof perfScore01 === 'number' ? Math.round(perfScore01 * 100) : null

  // Core Web Vitals "field" (CrUX) si dispo, sinon "lab" (Lighthouse synthetic)
  // Pour MVP on prend les valeurs lab du Lighthouse Result — toujours présentes.
  const lcpMs = audits['largest-contentful-paint']?.numericValue ?? null
  const inpMs = audits['interaction-to-next-paint']?.numericValue ?? null
  const cls = audits['cumulative-layout-shift']?.numericValue ?? null
  const fcpMs = audits['first-contentful-paint']?.numericValue ?? null
  const tbtMs = audits['total-blocking-time']?.numericValue ?? null
  const ttiMs = audits['interactive']?.numericValue ?? null

  const findings = []

  // ─── Score global PageSpeed ─────────────────────────────────────
  findings.push({
    key: 'perf_score',
    severity: score >= 90 ? 'pass' : score >= 50 ? 'warn' : 'fail',
    title: `Score Lighthouse (${strategy}) : ${score}/100`,
    body:
      score >= 90
        ? 'Excellent score Lighthouse. Le site se charge vite, les visiteurs (et Google) sont contents.'
        : score >= 50
          ? 'Score moyen. Quelques optimisations rapides pourraient faire passer dans le vert (>90).'
          : 'Score faible. Pénalisant SEO mobile-first depuis 2021, et impact direct sur le taux de rebond.',
    weight: 3,
  })

  // ─── LCP (Largest Contentful Paint) ─────────────────────────────
  if (lcpMs !== null) {
    findings.push({
      key: 'lcp',
      severity: lcpMs <= 2500 ? 'pass' : lcpMs <= 4000 ? 'warn' : 'fail',
      title: `LCP : ${_formatMs(lcpMs)}`,
      body:
        lcpMs <= 2500
          ? 'Largest Contentful Paint sous 2.5s — Core Web Vital "bon".'
          : lcpMs <= 4000
            ? 'LCP entre 2.5s et 4s — Core Web Vital "à améliorer".'
            : 'LCP au-dessus de 4s — Core Web Vital "mauvais". Pénalisant SEO et UX.',
      weight: 3,
      recommendation:
        lcpMs > 2500
          ? 'Optimiser : preload du hero image, fonts, réduire le JavaScript bloquant, utiliser un CDN, server response < 600ms.'
          : undefined,
    })
  }

  // ─── INP (Interaction to Next Paint) ────────────────────────────
  if (inpMs !== null) {
    findings.push({
      key: 'inp',
      severity: inpMs <= 200 ? 'pass' : inpMs <= 500 ? 'warn' : 'fail',
      title: `INP : ${_formatMs(inpMs)}`,
      body:
        inpMs <= 200
          ? 'Interaction to Next Paint sous 200ms — réactivité fluide.'
          : 'INP au-dessus de 200ms — l’utilisateur ressent un lag au clic.',
      weight: 2,
      recommendation:
        inpMs > 200
          ? 'Réduire les longs JS tasks (>50ms), différer le tracking non-critique, splitter les handlers lourds.'
          : undefined,
    })
  }

  // ─── CLS (Cumulative Layout Shift) ──────────────────────────────
  if (cls !== null) {
    findings.push({
      key: 'cls',
      severity: cls <= 0.1 ? 'pass' : cls <= 0.25 ? 'warn' : 'fail',
      title: `CLS : ${cls.toFixed(3)}`,
      body:
        cls <= 0.1
          ? 'Cumulative Layout Shift sous 0.1 — pas de saut de mise en page perturbant.'
          : 'CLS élevé — le contenu bouge pendant le chargement (frustrant pour l’utilisateur).',
      weight: 2,
      recommendation:
        cls > 0.1
          ? 'Réserver l’espace des images (width/height ou aspect-ratio), éviter d’injecter du contenu au-dessus du fold, lazy-load avec placeholders.'
          : undefined,
    })
  }

  // ─── FCP, TBT, TTI : info-only ────────────────────────────────
  if (fcpMs !== null) {
    findings.push({
      key: 'fcp',
      severity: 'info',
      title: `FCP : ${_formatMs(fcpMs)}`,
      body: 'First Contentful Paint — premier pixel rendu.',
      weight: 0,
    })
  }
  if (tbtMs !== null) {
    findings.push({
      key: 'tbt',
      severity: 'info',
      title: `TBT : ${_formatMs(tbtMs)}`,
      body: 'Total Blocking Time — proxy de l’INP en mesure lab.',
      weight: 0,
    })
  }

  // ─── Score pondéré ─────────────────────────────────────────────
  const VALUE = { pass: 1, warn: 0.5, fail: 0, info: null }
  let num = 0
  let den = 0
  for (const f of findings) {
    const v = VALUE[f.severity]
    if (v === null || v === undefined) continue
    num += v * f.weight
    den += f.weight
  }
  const computedScore = den === 0 ? score : Math.round((100 * num) / den)

  const summary = {
    pass: findings.filter((f) => f.severity === 'pass').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    fail: findings.filter((f) => f.severity === 'fail').length,
    info: findings.filter((f) => f.severity === 'info').length,
  }

  return {
    skipped: false,
    score: computedScore,
    metrics: { lcp: lcpMs, inp: inpMs, cls, fcp: fcpMs, tbt: tbtMs, tti: ttiMs },
    findings,
    summary,
    strategy,
  }
}

function _formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`
}

module.exports = { analyzePerformance }
