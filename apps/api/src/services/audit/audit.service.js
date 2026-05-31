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

  // 2. Scrape + analyse
  try {
    const scraped = await scrapeForAudit(url)
    if (!scraped) {
      await _markFailed(supabase, created.id, 'SCRAPE_FAILED')
      throw new UserFacingError(
        'Impossible d’atteindre le site (timeout, DNS, ou erreur SSL).',
        { statusCode: 502, code: 'SCRAPE_FAILED' },
      )
    }

    const seo = analyzeSEO(scraped)

    // Pour l'instant le score global = score SEO. À l'ajout des autres
    // analyzers, on fera une moyenne pondérée seo/geo/perf/ai.
    const score = seo.score

    const results = {
      seo,
      // Réservé pour les futures parties de Phase D :
      // geo: analyzeGEO(scraped),
      // perf: await analyzePerformance(url),
      // ai: await analyzeAIReadiness(scraped),
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
        summary: seo.summary,
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
