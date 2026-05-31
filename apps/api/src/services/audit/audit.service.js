// Audit service — orchestrate scrape + analyzers + persistence.
//
// Aujourd'hui, l'audit est **synchrone** depuis le point de vue du client : la
// route POST lance le scrape (~3-5 s) et l'analyse SEO (pure, instantanée),
// puis insère le résultat en DB et le retourne. Quand on ajoutera Performance
// (PageSpeed Insights, 10-20 s) et AI score (Anthropic, 3-5 s), on basculera
// sur une queue BullMQ — la table `audits` est déjà prête pour ça (status,
// started_at, completed_at).

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError, NotFoundError } = require('../../lib/error-handler')
const { scrapeForAudit } = require('./audit-scraper.service')
const { analyzeSEO } = require('./analyzers/seo.analyzer')
const { analyzeGEO } = require('./analyzers/geo.analyzer')
const { analyzeAI } = require('./analyzers/ai.analyzer')
const { analyzePerformance } = require('./performance.service')

/**
 * Lance un audit pour une URL et retourne l'enregistrement complet.
 * Throws UserFacingError sur erreur métier (URL invalide, site inaccessible).
 */
async function runAudit({ workspaceId, userId, url }) {
  // Validation amont — éviter d'aller scraper si l'URL est invalide.
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new UserFacingError('URL invalide.', { statusCode: 400, code: 'INVALID_URL' })
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UserFacingError('L’URL doit être http(s).', {
      statusCode: 400,
      code: 'INVALID_URL_SCHEME',
    })
  }

  const supabase = getServiceRoleClient()

  // 1. Créer la row en status='running'
  const { data: created, error: insertErr } = await supabase
    .from('audits')
    .insert({
      workspace_id: workspaceId,
      triggered_by: userId,
      url,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertErr) {
    logger.error({ event: 'audit_insert_failed', error: insertErr.message })
    throw new UserFacingError('Impossible de créer l’audit.', {
      statusCode: 500,
      code: 'AUDIT_PERSIST_FAILED',
    })
  }

  // 2. Scrape + Performance en PARALLÈLE (mutualisation des temps)
  //    - scrape Playwright : 5-8s
  //    - Performance (PageSpeed Insights) : 15-30s
  //    L'analyzer AI vient après le scrape (a besoin du bodyText) — 3-5s en
  //    parallèle de la fin de Perf typiquement.
  try {
    const [scraped, perfResult] = await Promise.all([
      scrapeForAudit(url),
      analyzePerformance(url),
    ])

    if (!scraped) {
      await _markFailed(supabase, created.id, 'SCRAPE_FAILED')
      throw new UserFacingError(
        'Impossible d’atteindre le site (timeout, DNS, ou erreur SSL).',
        { statusCode: 502, code: 'SCRAPE_FAILED' },
      )
    }

    // Analyzers purs (instantanés)
    const seo = analyzeSEO(scraped)
    const geo = analyzeGEO(scraped)
    // AI analyzer (Anthropic, 3-5s) — lancé après scrape mais peut chevaucher
    // la fin de Perf si elle est encore en cours (Perf.all l'attendait déjà,
    // donc ici on attend juste l'AI ; net positive sur le wall clock).
    const aiResult = await analyzeAI(scraped)

    // Score agrégé pondéré :
    //   SEO 30 / GEO 25 / Perf 25 / AI 20 (si tous présents)
    // Si Perf et/ou AI skipped, on rebalance proportionnellement.
    const score = _aggregateScore({
      seo: seo.score,
      geo: geo.score,
      perf: perfResult.skipped ? null : perfResult.score,
      ai: aiResult.skipped ? null : aiResult.score,
    })

    const results = {
      seo,
      geo,
      perf: perfResult,
      ai: aiResult,
      raw: {
        finalUrl: scraped.finalUrl,
        httpStatus: scraped.httpStatus,
      },
    }

    // 3. Marquer completed
    const { data: completed, error: updateErr } = await supabase
      .from('audits')
      .update({
        status: 'completed',
        score,
        results,
        final_url: scraped.finalUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('id', created.id)
      .select('*')
      .single()

    if (updateErr) {
      logger.error({ event: 'audit_update_failed', auditId: created.id, error: updateErr.message })
      throw new UserFacingError('Erreur lors de la sauvegarde.', {
        statusCode: 500,
        code: 'AUDIT_PERSIST_FAILED',
      })
    }

    logger.info(
      {
        event: 'audit_completed',
        auditId: completed.id,
        workspaceId,
        url,
        score,
        seoScore: seo.score,
        geoScore: geo.score,
        perfScore: perfResult.skipped ? null : perfResult.score,
        aiScore: aiResult.skipped ? null : aiResult.score,
      },
      'audit completed',
    )

    return completed
  } catch (err) {
    if (!(err instanceof UserFacingError)) {
      await _markFailed(supabase, created.id, err.message || 'UNKNOWN_ERROR')
      logger.error({ event: 'audit_unexpected_error', auditId: created.id, error: err.message })
    }
    throw err
  }
}

async function getAudit({ workspaceId, auditId }) {
  const { data, error } = await getServiceRoleClient()
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) {
    logger.error({ event: 'audit_get_failed', auditId, error: error.message })
    throw new UserFacingError('Erreur lecture audit.', {
      statusCode: 500,
      code: 'AUDIT_FETCH_FAILED',
    })
  }
  if (!data) throw new NotFoundError('Audit introuvable.')
  return data
}

async function listAudits({ workspaceId, limit = 20 }) {
  const { data, error } = await getServiceRoleClient()
    .from('audits')
    .select('id, url, final_url, status, score, created_at, completed_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)))

  if (error) {
    logger.error({ event: 'audit_list_failed', error: error.message })
    throw new UserFacingError('Erreur listing audits.', {
      statusCode: 500,
      code: 'AUDIT_LIST_FAILED',
    })
  }
  return data || []
}

/**
 * Moyenne pondérée des 4 scores partiels.
 *
 * Pondération nominale : SEO 30 / GEO 25 / Perf 25 / AI 20
 * Si un score manque (skipped/error), on rebalance proportionnellement sur
 * les autres au lieu de mécaniquement plomber le total.
 *
 * @param {{seo: number|null, geo: number|null, perf: number|null, ai: number|null}} scores
 * @returns {number|null}
 */
function _aggregateScore({ seo, geo, perf, ai }) {
  const nominal = { seo: 0.3, geo: 0.25, perf: 0.25, ai: 0.2 }
  let num = 0
  let den = 0
  if (seo !== null && seo !== undefined) { num += seo * nominal.seo; den += nominal.seo }
  if (geo !== null && geo !== undefined) { num += geo * nominal.geo; den += nominal.geo }
  if (perf !== null && perf !== undefined) { num += perf * nominal.perf; den += nominal.perf }
  if (ai !== null && ai !== undefined) { num += ai * nominal.ai; den += nominal.ai }
  return den === 0 ? null : Math.round(num / den)
}

async function _markFailed(supabase, auditId, reason) {
  await supabase
    .from('audits')
    .update({
      status: 'failed',
      error: String(reason).slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', auditId)
    .then(() => {}, (err) => logger.error({ event: 'audit_mark_failed_failed', auditId, error: err.message }))
}

module.exports = { runAudit, getAudit, listAudits }
