// Auth business logic.
// Source: docs/07_API_AUTH_CONNEXION.md
//
// Règle: les routes appellent ce service, qui appelle Supabase + signe les JWT
// internes. Toutes les erreurs sont des UserFacingError (messages FR) ou des
// erreurs serveur (5xx) qui remontent au global error handler.

const { getServiceRoleClient, getAnonClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError, AuthError } = require('../../lib/error-handler')
const { assertBetaAccess } = require('../../lib/beta-access')
const { signAccessToken, signRefreshToken, verifyToken } = require('./jwt.utils')

/**
 * Crée le user (Supabase Auth), l'organization, le 1er workspace, et le membership.
 * Idempotence non garantie: appeler une seule fois par email.
 */
async function signup({ email, password, organizationName }) {
  // Beta lockdown : refuse l'inscription si l'email n'est pas dans la
  // whitelist BETA_ALLOWED_EMAILS. Évite qu'un user random crée un compte
  // pendant la période pré-launch (pas de billing en place). Voir
  // apps/api/src/lib/beta-access.js.
  assertBetaAccess(email)

  const anon = getAnonClient()
  const service = getServiceRoleClient()

  // 1. Crée le user dans Supabase Auth (envoie email de confirmation si configuré côté Supabase)
  const { data: signUpData, error: authError } = await anon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.APP_URL || ''}/auth/callback`,
    },
  })

  if (authError) {
    // Email déjà utilisé, password trop faible, etc.
    if (authError.message?.toLowerCase().includes('already')) {
      throw new UserFacingError(
        'Un compte existe déjà avec cet email. Connecte-toi ou utilise un autre email.',
        { statusCode: 409, code: 'EMAIL_TAKEN' },
      )
    }
    throw new UserFacingError(authError.message || 'Inscription impossible.', {
      statusCode: 400,
      code: 'SIGNUP_FAILED',
    })
  }

  const user = signUpData.user
  if (!user) {
    throw new UserFacingError('Inscription impossible. Réessaie.', {
      statusCode: 500,
      code: 'SIGNUP_NO_USER',
    })
  }

  // 2. Crée l'organization (service role pour bypasser RLS pendant le bootstrap user)
  const { data: org, error: orgError } = await service
    .from('organizations')
    .insert({
      owner_id: user.id,
      email,
      name: organizationName,
      plan: 'trial',
    })
    .select()
    .single()

  if (orgError) {
    logger.error({ event: 'signup_org_failed', userId: user.id, error: orgError.message })
    throw new UserFacingError('Impossible de créer ton organisation. Réessaie.', {
      statusCode: 500,
      code: 'ORG_CREATE_FAILED',
    })
  }

  // 3. Crée le 1er workspace par défaut
  const { data: workspace, error: wsError } = await service
    .from('workspaces')
    .insert({
      organization_id: org.id,
      name: organizationName,
    })
    .select()
    .single()

  if (wsError) {
    logger.error({ event: 'signup_workspace_failed', orgId: org.id, error: wsError.message })
    throw new UserFacingError('Impossible de créer ton premier espace de travail. Réessaie.', {
      statusCode: 500,
      code: 'WORKSPACE_CREATE_FAILED',
    })
  }

  // 4. Ajoute le user comme admin du workspace
  const { error: memberError } = await service.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: 'admin',
    accepted_at: new Date().toISOString(),
  })

  if (memberError) {
    logger.error({
      event: 'signup_membership_failed',
      workspaceId: workspace.id,
      error: memberError.message,
    })
    throw new UserFacingError('Inscription incomplète. Contacte le support.', {
      statusCode: 500,
      code: 'MEMBERSHIP_CREATE_FAILED',
    })
  }

  logger.info(
    { event: 'signup_success', userId: user.id, orgId: org.id, workspaceId: workspace.id },
    'New user signed up',
  )

  return {
    user: { id: user.id, email: user.email },
    organizationId: org.id,
    workspaceId: workspace.id,
  }
}

/**
 * Vérifie email/password via Supabase Auth, retourne nos tokens JWT internes
 * et la liste des workspaces accessibles.
 */
async function login({ email, password, ipAddress, userAgent }) {
  // Beta lockdown — voir signup() ci-dessus pour le rationale.
  assertBetaAccess(email)

  const anon = getAnonClient()
  const service = getServiceRoleClient()

  const { data, error } = await anon.auth.signInWithPassword({ email, password })

  if (error || !data?.user) {
    logger.warn({ event: 'login_failed', email, reason: error?.message })
    throw new AuthError('Identifiants invalides.')
  }

  const user = data.user

  const token = signAccessToken({ userId: user.id, email: user.email })
  const refreshToken = signRefreshToken({ userId: user.id })

  // Workspaces accessibles (via les memberships)
  const { data: memberships, error: memErr } = await service
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, organization_id)')
    .eq('user_id', user.id)

  if (memErr) {
    logger.error({ event: 'login_memberships_failed', userId: user.id, error: memErr.message })
  }

  const workspaces = (memberships || []).map((m) => ({
    id: m.workspaces.id,
    name: m.workspaces.name,
    organizationId: m.workspaces.organization_id,
    role: m.role,
  }))

  // Audit log (non-bloquant: best-effort)
  service
    .from('audit_logs')
    .insert({
      user_id: user.id,
      action: 'login',
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    })
    .then(({ error: auditErr }) => {
      if (auditErr) {
        logger.warn({ event: 'audit_log_failed', userId: user.id, error: auditErr.message })
      }
    })

  logger.info({ event: 'login_success', userId: user.id }, 'User logged in')

  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email },
    workspaces,
  }
}

/**
 * Échange un refresh token valide contre un nouveau access token.
 * Pas de rotation du refresh token dans cette V1 (optionnel selon doc 07 §11).
 */
async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new AuthError('Refresh token manquant.')
  }
  const decoded = verifyToken(refreshToken, 'refresh')
  const token = signAccessToken({ userId: decoded.sub })
  return { token }
}

/**
 * Log l'action de logout. Côté serveur, on ne révoque pas le token
 * (stateless JWT). C'est au frontend de supprimer le token de son storage.
 */
async function logout({ userId, ipAddress, userAgent }) {
  const service = getServiceRoleClient()
  await service
    .from('audit_logs')
    .insert({
      user_id: userId,
      action: 'logout',
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    })
}

/**
 * Récupère le user courant + ses workspaces. Utilisé par le frontend
 * pour restaurer une session après reload.
 */
async function getSession(userId) {
  const service = getServiceRoleClient()

  const { data: memberships, error } = await service
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, organization_id)')
    .eq('user_id', userId)

  if (error) {
    logger.error({ event: 'session_memberships_failed', userId, error: error.message })
    throw new UserFacingError('Impossible de récupérer la session.', {
      statusCode: 500,
      code: 'SESSION_FETCH_FAILED',
    })
  }

  return {
    workspaces: (memberships || []).map((m) => ({
      id: m.workspaces.id,
      name: m.workspaces.name,
      organizationId: m.workspaces.organization_id,
      role: m.role,
    })),
  }
}

/**
 * Demande de reset password. Anti-enumeration : on renvoie TOUJOURS success,
 * que l'email existe ou pas. Supabase Auth envoie le mail si l'user existe.
 *
 * Le lien dans l'email pointe vers APP_URL/reset-password/confirm. Supabase
 * ajoute le `access_token` dans le fragment d'URL côté browser.
 *
 * On NE bloque PAS sur beta lockdown ici (on ne veut pas leak quels emails
 * sont whitelistés) — le user pourra demander un reset même s'il n'est pas
 * dans la beta, mais quand il essaiera de se connecter avec son nouveau
 * password, le login le rejettera proprement.
 */
async function requestPasswordReset({ email }) {
  const anon = getAnonClient()
  const appUrl = (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
  const { error } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/reset-password/confirm`,
  })
  // On log les erreurs côté serveur mais on ne les remonte JAMAIS au client
  // (anti enumeration). Le caller lui dira "si l'email existe, on a envoyé".
  if (error) {
    logger.warn(
      { event: 'password_reset_request_failed', email, error: error.message },
      'Supabase password reset failed',
    )
  } else {
    logger.info({ event: 'password_reset_requested', email }, 'Password reset email sent')
  }
}

/**
 * Confirme le reset : avec l'access_token reçu via le lien, on update le
 * password via l'API REST Supabase Auth. On évite supabase-js pour ne pas
 * mélanger des sessions client/server.
 */
async function confirmPasswordReset({ accessToken, newPassword }) {
  if (!accessToken || !newPassword) {
    throw new UserFacingError('Token et nouveau mot de passe requis.', {
      statusCode: 400,
      code: 'MISSING_FIELDS',
    })
  }
  // Supabase exige au moins 6 caractères ; on force notre minimum à 12.
  if (newPassword.length < 12) {
    throw new UserFacingError('Le mot de passe doit faire au moins 12 caractères.', {
      statusCode: 400,
      code: 'WEAK_PASSWORD',
    })
  }
  const supabaseUrl = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new UserFacingError('Service indisponible.', {
      statusCode: 503,
      code: 'AUTH_NOT_CONFIGURED',
    })
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.warn(
      { event: 'password_reset_confirm_failed', status: res.status, body: body.slice(0, 300) },
      'Supabase password update rejected',
    )
    // 401 = token invalide / expiré.
    if (res.status === 401 || res.status === 403) {
      throw new UserFacingError(
        'Le lien de reset est invalide ou expiré. Redemande un email.',
        { statusCode: 400, code: 'INVALID_OR_EXPIRED_TOKEN' },
      )
    }
    throw new UserFacingError(
      'Impossible de mettre à jour le mot de passe. Réessaie.',
      { statusCode: 500, code: 'PASSWORD_UPDATE_FAILED' },
    )
  }
  const json = await res.json().catch(() => ({}))
  logger.info(
    { event: 'password_reset_confirmed', userId: json?.id },
    'Password reset confirmed',
  )
}

module.exports = { signup, login, refresh, logout, getSession, requestPasswordReset, confirmPasswordReset }
