// Service OAuth 2.0 générique, provider-agnostique.
//
// Lit la config du provider depuis la table integration_providers via
// providers.service, puis construit l'authorize URL / échange le code /
// rafraîchit le token de façon standardisée.
//
// Cas particuliers par provider (ex: Google qui veut access_type=offline +
// prompt=consent pour renvoyer un refresh_token, Shopify qui injecte le
// shop subdomain dans l'authorize_url) sont gérés via :
//   - integration_providers.extra_config.authorize_extra_params : objet
//     dont les clés/valeurs sont ajoutées à l'URL d'authorize
//   - integration_providers.extra_config.authorize_url_template : si
//     présent, remplace authorize_url et supporte des placeholders {shop}
//     remplis depuis le call site (cas Shopify)

const providersService = require('../connectors/providers.service')

const GENERIC_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI
  || `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/connectors/oauth/callback`

/**
 * Construit l'URL d'autorisation OAuth pour un provider donné.
 *
 * @param {Object} params
 * @param {string} params.source       - Clé provider (ex: 'shopify', 'ga4')
 * @param {string} params.state        - State opaque (JWT signé contenant workspaceId, etc.)
 * @param {Object} [params.subst]      - Variables de substitution dans l'URL (ex: {shop: 'maboutique'})
 * @param {string} [params.redirectUri]
 * @returns {Promise<string>}
 */
async function buildAuthorizeUrl({ source, state, subst = {}, redirectUri }) {
  const provider = await providersService.getWithDecryptedCredentials(source)

  if (provider.auth_kind !== 'oauth2') {
    const err = new Error(`Provider "${source}" n'utilise pas OAuth2 (auth_kind=${provider.auth_kind}).`)
    err.statusCode = 400
    err.code = 'OAUTH_NOT_APPLICABLE'
    throw err
  }

  // Permet à un provider d'avoir une authorize_url paramétrée par sub-domaine,
  // ex: 'https://{shop}.myshopify.com/admin/oauth/authorize'.
  const template = provider.extra_config?.authorize_url_template || provider.authorize_url
  const authorizeUrl = _substituer(template, subst)

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: redirectUri || GENERIC_REDIRECT_URI,
    response_type: 'code',
    scope: (provider.scopes || []).join(' '),
    state,
  })

  // Cas particuliers (ex: Google → access_type=offline + prompt=consent)
  const extras = provider.extra_config?.authorize_extra_params || {}
  for (const [k, v] of Object.entries(extras)) {
    params.set(k, String(v))
  }

  return `${authorizeUrl}?${params.toString()}`
}

/**
 * Échange un authorization code contre un couple {access_token, refresh_token}.
 *
 * @param {Object} params
 * @param {string} params.source
 * @param {string} params.code
 * @param {Object} [params.subst] - Pour les token_url qui contiennent un placeholder
 * @param {string} [params.redirectUri]
 */
async function exchangeCodeForTokens({ source, code, subst = {}, redirectUri }) {
  const provider = await providersService.getWithDecryptedCredentials(source)
  const tokenUrl = _substituer(provider.token_url, subst)

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: redirectUri || GENERIC_REDIRECT_URI,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    const err = new Error(`OAuth code exchange failed for ${source} (${response.status}): ${text.slice(0, 300)}`)
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
    raw: data, // pour les providers qui renvoient des champs custom (ex: Shopify scope)
  }
}

/**
 * Rafraîchit un access_token expiré.
 */
async function refreshAccessToken({ source, refreshToken, subst = {} }) {
  const provider = await providersService.getWithDecryptedCredentials(source)
  const tokenUrl = _substituer(provider.token_url, subst)

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    const err = new Error(`OAuth token refresh failed for ${source} (${response.status}): ${text.slice(0, 300)}`)
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
    // Certains providers (Google, HubSpot) ne renvoient pas refreshToken au refresh,
    // d'autres si (Meta long-lived). On laisse le call site choisir s'il met à jour.
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  }
}

// ━━━ helpers ━━━

/**
 * Remplace les placeholders {clé} dans une URL par les valeurs fournies.
 * Lève si une variable référencée dans l'URL n'a pas de valeur.
 */
function _substituer(template, subst) {
  if (!template) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    if (subst[k] === undefined || subst[k] === null) {
      const err = new Error(`Variable "${k}" manquante pour construire l'URL OAuth.`)
      err.statusCode = 400
      err.code = 'OAUTH_MISSING_SUBST'
      throw err
    }
    return encodeURIComponent(subst[k])
  })
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
}
