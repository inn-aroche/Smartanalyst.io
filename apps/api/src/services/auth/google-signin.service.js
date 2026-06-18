// Google OAuth flow for user **sign-in / sign-up** (different from the
// connector OAuth flow, which goes through oauth-generic.service for
// analytics/ads scopes).
//
// Scopes: openid email profile  → we get an ID token (JWT signed by Google)
// that we forward to Supabase via signInWithIdToken. Supabase handles
// account creation/lookup; we then mint our internal JWT and, on first
// login, bootstrap the org/workspace/membership like the email signup flow.

const jwt = require('jsonwebtoken')

const { getServiceRoleClient, getAnonClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError } = require('../../lib/error-handler')
const { assertBetaAccess } = require('../../lib/beta-access')
const { signAccessToken, signRefreshToken } = require('./jwt.utils')

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const LOGIN_SCOPES = ['openid', 'email', 'profile']
const STATE_TYPE = 'google_signin_state'
const STATE_TTL = '10m'

function getEnv() {
  const clientId = process.env.GOOGLE_LOGIN_CLIENT_ID
  const clientSecret = process.env.GOOGLE_LOGIN_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new UserFacingError('La connexion Google n’est pas configurée. Contacte le support.', {
      statusCode: 503,
      code: 'GOOGLE_LOGIN_NOT_CONFIGURED',
    })
  }
  return { clientId, clientSecret, redirectUri }
}

function signState({ returnTo }) {
  return jwt.sign({ type: STATE_TYPE, returnTo: returnTo || null }, process.env.JWT_SECRET, {
    expiresIn: STATE_TTL,
  })
}

function verifyState(state) {
  if (!state) {
    throw new UserFacingError('State manquant.', {
      statusCode: 400,
      code: 'OAUTH_STATE_MISSING',
    })
  }
  let decoded
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET)
  } catch {
    throw new UserFacingError('Le lien Google a expiré, recommence la connexion.', {
      statusCode: 400,
      code: 'OAUTH_STATE_INVALID',
    })
  }
  if (decoded.type !== STATE_TYPE) {
    throw new UserFacingError('State invalide.', {
      statusCode: 400,
      code: 'OAUTH_STATE_INVALID',
    })
  }
  return decoded
}

function buildAuthorizeUrl({ returnTo }) {
  const { clientId, redirectUri } = getEnv()
  const state = signState({ returnTo })
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: LOGIN_SCOPES.join(' '),
    state,
    access_type: 'online',
    prompt: 'select_account',
  })
  return { authorizeUrl: `${AUTH_ENDPOINT}?${params.toString()}` }
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = getEnv()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    logger.warn({ event: 'google_signin_code_exchange_failed', status: res.status, body: text })
    throw new UserFacingError('Échec de l’échange du code Google.', {
      statusCode: 400,
      code: 'GOOGLE_CODE_EXCHANGE_FAILED',
    })
  }
  const data = await res.json()
  if (!data.id_token) {
    throw new UserFacingError('Réponse Google invalide (id_token manquant).', {
      statusCode: 502,
      code: 'GOOGLE_ID_TOKEN_MISSING',
    })
  }
  return { idToken: data.id_token, accessToken: data.access_token }
}

/**
 * Slugifies a name to use as the org/workspace label on first login.
 * Falls back to the email local-part if no name is available.
 */
function defaultOrgName({ email, name }) {
  if (name && name.trim().length > 0) return name.trim().slice(0, 100)
  if (email) return email.split('@')[0].slice(0, 100)
  return 'My workspace'
}

/**
 * Bootstrap an org/workspace/membership for a freshly-signed-in user.
 * Idempotent — skipped if the user already has any membership.
 */
async function ensureWorkspace({ userId, email, fullName }) {
  const service = getServiceRoleClient()

  const { data: existing, error: existingErr } = await service
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)

  if (existingErr) {
    logger.error({
      event: 'google_signin_membership_check_failed',
      userId,
      error: existingErr.message,
    })
    throw new UserFacingError('Impossible de récupérer ton espace de travail.', {
      statusCode: 500,
      code: 'WORKSPACE_LOOKUP_FAILED',
    })
  }

  if (existing && existing.length > 0) {
    return // already onboarded
  }

  const orgName = defaultOrgName({ email, name: fullName })

  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({ owner_id: userId, email, name: orgName, plan: 'trial' })
    .select()
    .single()

  if (orgErr) {
    logger.error({ event: 'google_signin_org_failed', userId, error: orgErr.message })
    throw new UserFacingError('Impossible de créer ton organisation.', {
      statusCode: 500,
      code: 'ORG_CREATE_FAILED',
    })
  }

  const { data: workspace, error: wsErr } = await service
    .from('workspaces')
    .insert({ organization_id: org.id, name: orgName })
    .select()
    .single()

  if (wsErr) {
    logger.error({ event: 'google_signin_workspace_failed', orgId: org.id, error: wsErr.message })
    throw new UserFacingError('Impossible de créer ton espace de travail.', {
      statusCode: 500,
      code: 'WORKSPACE_CREATE_FAILED',
    })
  }

  const { error: memErr } = await service.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: userId,
    role: 'admin',
    accepted_at: new Date().toISOString(),
  })

  if (memErr) {
    logger.error({
      event: 'google_signin_membership_failed',
      workspaceId: workspace.id,
      error: memErr.message,
    })
    throw new UserFacingError('Inscription incomplète. Contacte le support.', {
      statusCode: 500,
      code: 'MEMBERSHIP_CREATE_FAILED',
    })
  }

  logger.info({
    event: 'google_signin_bootstrap',
    userId,
    orgId: org.id,
    workspaceId: workspace.id,
  })
}

/**
 * Full callback handler: exchanges the Google code, signs the user in via
 * Supabase, bootstraps a workspace if needed, and returns our internal JWT
 * pair + the user's workspaces. Caller (the route) handles the HTTP redirect.
 */
async function handleCallback({ code, state, ipAddress, userAgent }) {
  const decodedState = verifyState(state)

  const { idToken } = await exchangeCode(code)

  // Supabase signInWithIdToken either creates the user or returns the existing
  // one. Requires the Google provider to be enabled in the Supabase dashboard.
  const anon = getAnonClient()
  const { data: signInData, error: signInError } = await anon.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })

  if (signInError || !signInData?.user) {
    logger.warn({
      event: 'google_signin_supabase_failed',
      error: signInError?.message,
    })
    throw new UserFacingError(
      'Connexion Google refusée par Supabase. Vérifie que le provider est activé.',
      { statusCode: 401, code: 'SUPABASE_OAUTH_FAILED' },
    )
  }

  const user = signInData.user
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null

  // Beta lockdown — refuse la connexion Google si l'email n'est pas
  // dans la whitelist. Important pour ce flow car Supabase a déjà créé
  // l'user au signInWithIdToken, mais on lui refuse d'aller plus loin
  // (pas de workspace bootstrap, pas de JWT interne). Le user reste en
  // Supabase Auth mais ne peut pas utiliser l'app.
  // Voir apps/api/src/lib/beta-access.js.
  assertBetaAccess(user.email)

  await ensureWorkspace({
    userId: user.id,
    email: user.email,
    fullName,
  })

  const service = getServiceRoleClient()
  const { data: memberships, error: memErr } = await service
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, organization_id)')
    .eq('user_id', user.id)

  if (memErr) {
    logger.error({
      event: 'google_signin_memberships_failed',
      userId: user.id,
      error: memErr.message,
    })
  }

  const workspaces = (memberships || []).map((m) => ({
    id: m.workspaces.id,
    name: m.workspaces.name,
    organizationId: m.workspaces.organization_id,
    role: m.role,
  }))

  const token = signAccessToken({ userId: user.id, email: user.email })
  const refreshToken = signRefreshToken({ userId: user.id })

  service
    .from('audit_logs')
    .insert({
      user_id: user.id,
      action: 'login_google',
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    })
    .then(({ error: auditErr }) => {
      if (auditErr) {
        logger.warn({ event: 'audit_log_failed', userId: user.id, error: auditErr.message })
      }
    })

  logger.info({ event: 'google_signin_success', userId: user.id })

  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, full_name: fullName || undefined },
    workspaces,
    returnTo: decodedState.returnTo || null,
  }
}

module.exports = {
  buildAuthorizeUrl,
  handleCallback,
}
