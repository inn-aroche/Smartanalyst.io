// Onboarding orchestration: analyze a URL (scrape + AI detect), save profile.
//
// Source: docs/08_API_ONBOARDING.md, docs/00_BRIEF §"Flux onboarding idéal"
//
// Règle cardinale: premier insight visible < 3 min après signup.
// Budget de cette étape: ~15s (scraping 10s + AI 3-5s).

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError } = require('../../lib/error-handler')
const { scrapeWebsite, isPublicHttpUrl } = require('./website-scraper.service')
const { detectProfile } = require('./business-profile-detector.service')

/**
 * Analyse une URL et retourne un profil business proposé.
 * Ne sauvegarde RIEN — c'est au user de confirmer via /profile.
 */
async function analyzeUrl(url) {
  if (!isPublicHttpUrl(url)) {
    throw new UserFacingError(
      'URL invalide. Renseigne une URL publique en http(s).',
      { statusCode: 400, code: 'INVALID_URL' },
    )
  }

  const scraped = await scrapeWebsite(url)
  if (!scraped) {
    logger.info({ event: 'onboarding_scrape_failed', url }, 'Falling back to manual onboarding')
    return {
      profile: null,
      fallback: true,
      reason: 'scraping_failed',
    }
  }

  let aiProfile
  try {
    aiProfile = await detectProfile({ url, scraped })
  } catch (err) {
    logger.warn(
      { event: 'onboarding_ai_failed', url, error: err.message },
      'AI profile detection failed, falling back',
    )
    return {
      profile: null,
      fallback: true,
      reason: 'ai_detection_failed',
      rawDataSummary: {
        title: scraped.title,
        headingsCount: (scraped.headings || []).length,
        detectedTools: scraped.detectedTools,
      },
    }
  }

  return {
    profile: {
      url,
      sector: aiProfile.sector,
      market: aiProfile.market,
      brand_keywords: aiProfile.brand_keywords,
      description: aiProfile.description,
      detected_tools: scraped.detectedTools,
      confidence_score: aiProfile.confidence_score,
    },
    fallback: false,
    rawDataSummary: {
      title: scraped.title,
      headingsCount: (scraped.headings || []).length,
      finalUrl: scraped.finalUrl,
    },
  }
}

/**
 * Sauvegarde le profil confirmé (par le user) dans business_profiles
 * + met à jour workspaces.sector / .market pour que tous les insights
 * contextualisent.
 */
async function saveProfile({
  workspaceId,
  url,
  sector,
  market,
  brand_keywords,
  description,
  detected_tools,
  confidence_score,
  raw_html_data,
}) {
  const supabase = getServiceRoleClient()

  const { data: profile, error: upsertError } = await supabase
    .from('business_profiles')
    .upsert(
      {
        workspace_id: workspaceId,
        url,
        sector,
        market,
        brand_keywords: brand_keywords || [],
        description: description || null,
        detected_tools: detected_tools || {},
        confidence_score: typeof confidence_score === 'number' ? confidence_score : 50,
        raw_html_data: raw_html_data || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    )
    .select()
    .single()

  if (upsertError) {
    logger.error({
      event: 'business_profile_save_failed',
      workspaceId,
      error: upsertError.message,
    })
    throw upsertError
  }

  // Met à jour les champs contextuels sur workspaces (informationnels, pour
  // que l'IA et les rapports aient le contexte sans rejoindre business_profiles).
  const { error: wsError } = await supabase
    .from('workspaces')
    .update({
      sector: sector || null,
      market: market || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workspaceId)

  if (wsError) {
    logger.warn({
      event: 'workspace_sector_update_failed',
      workspaceId,
      error: wsError.message,
    })
  }

  logger.info(
    { event: 'business_profile_saved', workspaceId, sector, market },
    'Business profile saved',
  )

  return profile
}

module.exports = { analyzeUrl, saveProfile }
