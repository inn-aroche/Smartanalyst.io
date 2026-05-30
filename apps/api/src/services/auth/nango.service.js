// Client Nango pour la gestion centralisée des connexions OAuth.
//
// Documentation : https://docs.nango.dev/reference/sdks/node
//
// Nango prend en charge à notre place :
//   - Le démarrage du flow OAuth (popup côté frontend via @nangohq/frontend)
//   - Le stockage chiffré et le refresh automatique des tokens
//   - Le proxy authentifié vers les APIs des providers (nango.proxy())
//   - L'exécution périodique des syncs déclarés dans nango.yaml
//
// On manipule donc uniquement des connection_id (identifiant logique d'une
// connexion utilisateur ↔ intégration) côté SmartAnalyst, et on délègue
// toute la mécanique OAuth à Nango.

const { Nango } = require('@nangohq/node')
const { logger } = require('../../lib/logger')

// En dev on tolère l'absence de la clé (les routes répondront 503), mais on
// log clairement pour éviter de chercher pourquoi rien ne marche.
if (!process.env.NANGO_SECRET_KEY) {
  logger.warn(
    { event: 'nango_secret_key_missing' },
    'NANGO_SECRET_KEY non défini — les routes /api/v1/nango répondront 503.',
  )
}

const nango = process.env.NANGO_SECRET_KEY
  ? new Nango({ secretKey: process.env.NANGO_SECRET_KEY })
  : null

function _assurerClient() {
  if (!nango) {
    const err = new Error('Intégration Nango non configurée côté serveur.')
    err.statusCode = 503
    err.code = 'NANGO_NOT_CONFIGURED'
    throw err
  }
  return nango
}

/**
 * Génère un connect session token à fournir au frontend.
 *
 * Le front appellera Nango.auth(providerConfigKey, sessionToken) côté SDK
 * @nangohq/frontend avec ce token pour ouvrir la popup OAuth. Nango se
 * charge de la totalité du flow et persiste la connexion.
 *
 * @param {Object} params
 * @param {string} params.userId             - ID utilisateur SmartAnalyst (mappé en end_user.id côté Nango)
 * @param {string} params.workspaceId        - ID workspace (mappé en organization.id)
 * @param {string} params.providerConfigKey  - Clé d'intégration nango (ex: 'shopify', 'google-analytics')
 * @returns {Promise<{token: string, expiresAt: string}>}
 */
async function creerSessionConnexion({ userId, workspaceId, providerConfigKey }) {
  const client = _assurerClient()
  const response = await client.createConnectSession({
    end_user: { id: userId },
    organization: { id: workspaceId },
    allowed_integrations: [providerConfigKey],
  })

  // La SDK renvoie { data: { token, expires_at } }
  const data = response?.data ?? response
  return {
    token: data.token,
    expiresAt: data.expires_at,
  }
}

/**
 * Liste les connexions Nango actives pour un workspace donné.
 *
 * @param {string} workspaceId
 * @returns {Promise<Array<{connection_id: string, provider_config_key: string, created: string}>>}
 */
async function listerConnexions(workspaceId) {
  if (!nango) return []
  const result = await nango.listConnections(undefined, workspaceId)
  return result?.connections ?? []
}

/**
 * Récupère les détails d'une connexion (utile pour vérifier qu'elle est
 * encore active avant un sync ou un appel proxy).
 */
async function recupererConnexion(providerConfigKey, connectionId) {
  const client = _assurerClient()
  return client.getConnection(providerConfigKey, connectionId)
}

/**
 * Supprime une connexion Nango (l'utilisateur a cliqué "Disconnect").
 */
async function supprimerConnexion(providerConfigKey, connectionId) {
  const client = _assurerClient()
  await client.deleteConnection(providerConfigKey, connectionId)
}

module.exports = {
  creerSessionConnexion,
  listerConnexions,
  recupererConnexion,
  supprimerConnexion,
  // Exporté pour les workers BullMQ et les Extracteurs qui ont besoin
  // d'appeler nango.proxy() ou nango.listRecords() directement.
  nango,
}
