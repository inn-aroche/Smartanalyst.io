// Google OAuth helpers.
// Utilisé par les connecteurs Google (GA4, Search Console) ET par le flux
// d'ajout de connecteur (callback OAuth).
//
// Source: docs/07_API_AUTH_CONNEXION.md §7

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

/**
 * Construit l'URL d'autorisation OAuth Google.
 * @param {Object} params
 * @param {string[]} params.scopes
 * @param {string} params.state    - opaque, pour identifier le flux (ex: workspace_id|connector_setup)
 * @param {string} [params.redirectUri]
 * @returns {string}
 */
function buildAuthorizeUrl({ scopes, state, redirectUri = process.env.GOOGLE_REDIRECT_URI }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline', // pour recevoir un refresh_token
    prompt: 'consent', // force le renvoi d'un refresh_token même si déjà autorisé
    scope: scopes.join(' '),
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

/**
 * Échange un authorization code contre des tokens.
 * @param {string} code
 * @param {string} [redirectUri]
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number, tokenType: string, scope: string }>}
 */
async function exchangeCodeForTokens(code, redirectUri = process.env.GOOGLE_REDIRECT_URI) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    const err = new Error(`Google OAuth code exchange failed (${response.status}): ${text}`)
    err.statusCode = response.status
    err.code = 'OAUTH_CODE_EXCHANGE_FAILED'
    throw err
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  }
}

/**
 * Rafraîchit un access token à partir d'un refresh token.
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string, expiresIn: number, tokenType: string }>}
 */
async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    const err = new Error(`Google token refresh failed (${response.status}): ${text}`)
    err.statusCode = response.status
    err.code =
      response.status === 400 || response.status === 401
        ? 'INVALID_CREDENTIALS'
        : 'TOKEN_REFRESH_FAILED'
    throw err
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  }
}

// Scopes connus
const SCOPES = {
  ga4: ['https://www.googleapis.com/auth/analytics.readonly'],
  searchConsole: ['https://www.googleapis.com/auth/webmasters.readonly'],
  googleAds: ['https://www.googleapis.com/auth/adwords'],
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  SCOPES,
}
