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
    throw new UserFacingError('URL invalide. Renseigne une URL publique en http(s).', {
      statusCode: 400,
      code: 'INVALID_URL',
    })
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
  vertical,
  business_model,
  primary_goal,
  current_stack,
  maturity_level,
}) {
  const supabase = getServiceRoleClient()

  const row = {
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
  }
  if (vertical !== undefined) row.vertical = vertical || null
  if (business_model !== undefined) row.business_model = business_model || null
  if (primary_goal !== undefined) row.primary_goal = primary_goal || null
  if (current_stack !== undefined)
    row.current_stack = Array.isArray(current_stack) ? current_stack : []
  if (maturity_level !== undefined) row.maturity_level = maturity_level || null

  const { data: profile, error: upsertError } = await supabase
    .from('business_profiles')
    .upsert(row, { onConflict: 'workspace_id' })
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

async function completeOnboarding(workspaceId) {
  const supabase = getServiceRoleClient()
  const { error } = await supabase
    .from('workspaces')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', workspaceId)
    .is('onboarding_completed_at', null)
  if (error) {
    logger.error({ event: 'onboarding_complete_failed', workspaceId, error: error.message })
    throw error
  }
  logger.info({ event: 'onboarding_completed', workspaceId }, 'Onboarding marked complete')
}

async function getOnboardingStatus(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('onboarding_completed_at')
    .eq('id', workspaceId)
    .single()
  if (error) throw error
  return { completed: !!data?.onboarding_completed_at, completedAt: data?.onboarding_completed_at }
}

module.exports = { analyzeUrl, saveProfile, completeOnboarding, getOnboardingStatus }
