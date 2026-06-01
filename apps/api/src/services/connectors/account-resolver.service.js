// Account resolver — post-token, va chercher les comptes/properties du
// provider pour identifier celui à connecter.
//
// Le flow OAuth générique laisse au call site (et donc au state JWT) la
// responsabilité de fournir accountId / accountName. Mais pour la plupart
// des providers (GA4, Meta, Shopify…), tu ne connais pas ces IDs AVANT
// l'authorize — il faut d'abord avoir le token, puis lister les comptes.
//
// Ce service comble ce gap : il appelle l'API du provider avec le token
// fraîchement obtenu et retourne `{ accountId, accountName }` du premier
// compte/property disponible. Si l'utilisateur a plusieurs comptes, on
// prend le 1er par défaut (TODO: ajouter un sélecteur côté UI quand on
// aura un cas où ça compte vraiment).

const { logger } = require('../../lib/logger')

const FETCH_TIMEOUT_MS = 10_000

/**
 * Résout {accountId, accountName} pour un token OAuth fraîchement obtenu.
 *
 * @param {Object} params
 * @param {string} params.source       - ga4 | meta_ads | shopify | ...
 * @param {string} params.accessToken
 * @param {Object} [params.subst]      - State du flow (peut contenir le shop pour Shopify)
 * @returns {Promise<{ accountId: string, accountName: string }>}
 * @throws si aucun compte n'est trouvé chez le provider, ou si l'API échoue
 */
async function resolveAccount({ source, accessToken, subst = {} }) {
  const resolver = RESOLVERS[source]
  if (!resolver) {
    const err = new Error(`Pas de resolver d'account pour le provider "${source}".`)
    err.code = 'ACCOUNT_RESOLVER_MISSING'
    err.statusCode = 500
    throw err
  }
  const result = await resolver({ accessToken, subst })
  if (!result?.accountId) {
    const err = new Error(
      `Aucun compte/property disponible chez ${source}. Vérifie que ton compte a les permissions nécessaires.`,
    )
    err.code = 'NO_ACCOUNTS_AVAILABLE'
    err.statusCode = 400
    throw err
  }
  logger.info(
    { event: 'account_resolved', source, accountId: result.accountId, accountName: result.accountName },
    'Account resolved',
  )
  return result
}

// ─── Resolvers par provider ──────────────────────────────────────────────

const RESOLVERS = {
  ga4: resolveGA4,
  meta_ads: resolveMetaAds,
  shopify: resolveShopify,
}

/**
 * GA4 : on liste les Property Summaries via l'Admin API. Le "compte" GA4
 * dans notre modèle = une property GA4 (= un site/app tracké), pas un
 * Google Account container. Donc on retourne `properties/<id>` comme
 * accountId.
 */
async function resolveGA4({ accessToken }) {
  const url = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries'
  const data = await _fetchJson(url, { Authorization: `Bearer ${accessToken}` })

  const summaries = data?.accountSummaries || []
  for (const acct of summaries) {
    const props = acct.propertySummaries || []
    if (props.length > 0) {
      const first = props[0]
      // first.property = "properties/123456789" (full resource name)
      return {
        accountId: first.property,
        accountName: first.displayName || acct.displayName || first.property,
      }
    }
  }
  return null
}

/**
 * Meta Ads : liste les ad accounts auxquels l'utilisateur a accès.
 * accountId = "act_xxx" (format requis par l'API Marketing).
 */
async function resolveMetaAds({ accessToken }) {
  const url = `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&limit=10&access_token=${encodeURIComponent(accessToken)}`
  const data = await _fetchJson(url)
  const accounts = data?.data || []
  // Préfère un compte actif (account_status === 1) sinon prend le premier
  const active = accounts.find((a) => a.account_status === 1) || accounts[0]
  if (!active) return null
  return {
    accountId: active.id, // "act_123456789"
    accountName: active.name || active.id,
  }
}

/**
 * Shopify : le "compte" = la boutique. On utilise le subdomain donné par
 * l'utilisateur au moment de cliquer Connect (passé via subst.shop).
 */
async function resolveShopify({ accessToken, subst }) {
  const shop = subst?.shop
  if (!shop) return null
  // Optionnel : on pourrait aussi vérifier que le shop existe en appelant
  // /admin/api/2024-01/shop.json avec le token. Skip pour MVP — le token
  // est déjà la preuve que Shopify accepte ce shop.
  return {
    accountId: shop, // 'xxx' ou 'xxx.myshopify.com' — laissé tel quel
    accountName: shop,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function _fetchJson(url, headers = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      const err = new Error(`Provider API call failed (${res.status}): ${txt.slice(0, 300)}`)
      err.statusCode = res.status
      err.code = 'PROVIDER_API_ERROR'
      throw err
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { resolveAccount }
