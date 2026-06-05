// Service de lecture du catalogue `integration_providers`.
//
// Source unique de vérité pour : nom, scopes, URLs OAuth, Client ID/Secret
// chiffrés. Le frontend ne tape jamais la table directement, il passe par
// /api/v1/connectors/catalog qui renvoie une version sanitized.
//
// Cache 60s en mémoire pour éviter de hammer la DB sur chaque hit du
// catalog (qui est lu à chaque chargement de la page Connectors).

const { getServiceRoleClient } = require('../../lib/supabase')
const { NotFoundError, UserFacingError } = require('../../lib/error-handler')
const vault = require('../../lib/vault')

const TABLE = 'integration_providers'
const CACHE_TTL_MS = 60_000

// Colonnes JAMAIS exposées au frontend (secrets chiffrés).
const SENSITIVE_COLS = ['client_id_encrypted', 'client_secret_encrypted']

let _cache = { at: 0, rows: null }

function _invalidateCache() {
  _cache = { at: 0, rows: null }
}

async function _fetchAll() {
  const now = Date.now()
  if (_cache.rows && now - _cache.at < CACHE_TTL_MS) {
    return _cache.rows
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  _cache = { at: now, rows: data || [] }
  return _cache.rows
}

function sanitize(row) {
  if (!row) return row
  const clone = { ...row }
  for (const c of SENSITIVE_COLS) delete clone[c]
  // Indique au frontend si l'app OAuth a été configurée chez le provider.
  // (Évite que l'utilisateur clique "Connect" sur un provider dont on n'a
  // pas encore renseigné les Client ID/Secret.)
  clone.credentials_configured = Boolean(
    row.client_id_encrypted && row.client_secret_encrypted,
  )
  return clone
}

/**
 * Liste du catalogue côté frontend : exclut les rows désactivés et les
 * colonnes sensibles. Garde 'soon' pour afficher la marketplace "à venir".
 */
async function listForCatalog() {
  const rows = await _fetchAll()
  return rows
    .filter((r) => r.status !== 'disabled')
    .map(sanitize)
}

/**
 * Récupère un provider par sa source key (ex: 'shopify', 'ga4').
 * Inclut les secrets chiffrés — usage backend uniquement.
 */
async function getBySource(source) {
  const rows = await _fetchAll()
  const row = rows.find((r) => r.source === source)
  if (!row) {
    throw new NotFoundError(`Provider "${source}" introuvable dans le catalogue.`)
  }
  return row
}

/**
 * Récupère un provider + déchiffre Client ID / Secret pour usage OAuth.
 * Lève si les credentials ne sont pas renseignés (l'app OAuth n'a pas
 * encore été créée chez le provider).
 */
async function getWithDecryptedCredentials(source) {
  const row = await getBySource(source)
  if (!row.client_id_encrypted || !row.client_secret_encrypted) {
    throw new UserFacingError(
      `App OAuth pas encore configurée pour "${source}". Renseigne Client ID/Secret dans le catalogue.`,
      { statusCode: 503, code: 'OAUTH_APP_NOT_CONFIGURED' },
    )
  }
  const ctx = { secretType: 'provider_oauth_credentials', source }
  const [clientId, clientSecret] = await Promise.all([
    vault.decrypt(row.client_id_encrypted, { ...ctx, field: 'client_id' }),
    vault.decrypt(row.client_secret_encrypted, { ...ctx, field: 'client_secret' }),
  ])
  return { ...row, clientId, clientSecret }
}

/**
 * Met à jour les Client ID/Secret d'un provider (admin only — la route
 * d'exposition reste à câbler avec un middleware d'auth admin).
 */
async function setCredentials(source, { clientId, clientSecret }) {
  const supabase = getServiceRoleClient()
  const ctx = { secretType: 'provider_oauth_credentials', source }
  const [client_id_encrypted, client_secret_encrypted] = await Promise.all([
    vault.encrypt(clientId, { ...ctx, field: 'client_id' }),
    vault.encrypt(clientSecret, { ...ctx, field: 'client_secret' }),
  ])
  const { error } = await supabase
    .from(TABLE)
    .update({
      client_id_encrypted,
      client_secret_encrypted,
      updated_at: new Date().toISOString(),
    })
    .eq('source', source)
  if (error) throw error
  _invalidateCache()
}

module.exports = {
  listForCatalog,
  getBySource,
  getWithDecryptedCredentials,
  setCredentials,
  sanitize,
  _invalidateCache,
}
