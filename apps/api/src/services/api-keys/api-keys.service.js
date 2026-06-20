// Service de gestion des clés API (cahier §3 Lot 4 + §4.8).
//
// 3 opérations exposées :
//   - createKey({ workspaceId, userId, name }) → { key, prefix, id }
//     Retourne la clé EN CLAIR une seule fois (à l'instant T). L'user doit
//     la copier immédiatement ; ensuite on n'a plus que le hash SHA-256.
//   - listKeys(workspaceId) → [{ id, name, prefix, createdAt, lastUsedAt, revokedAt }]
//   - revokeKey(workspaceId, keyId)
//
// Format de clé : `sa_<env>_<32 chars random base62>`.
//   - prefix `sa_test_` ou `sa_live_` selon NODE_ENV (cohérent avec Stripe)
//   - 32 chars random base62 (≈190 bits d'entropie, sans risque de collision)

const crypto = require('node:crypto')
const { getServiceRoleClient } = require('../../lib/supabase')
const { NotFoundError } = require('../../lib/error-handler')
const { logger } = require('../../lib/logger')

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function _envPrefix() {
  return process.env.NODE_ENV === 'production' ? 'sa_live_' : 'sa_test_'
}

function _generateKey() {
  // 32 chars base62 ≈ log2(62^32) ≈ 190 bits. Bien plus que les 128 bits
  // recommandés pour un secret.
  const bytes = crypto.randomBytes(32)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += BASE62[bytes[i] % 62]
  }
  return _envPrefix() + out
}

function _hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * @returns {Promise<{ key: string, prefix: string, id: string, createdAt: string }>}
 *   `key` ne sera jamais re-renvoyé après cet appel.
 */
async function createKey({ workspaceId, userId, name }) {
  const trimmedName = String(name || '').trim()
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    const err = new Error('Le nom de la clé doit faire entre 1 et 80 caractères.')
    err.code = 'INVALID_NAME'
    err.statusCode = 400
    throw err
  }
  const key = _generateKey()
  const prefix = key.slice(0, 16) // sa_test_AbCdEfGh (16 chars pour reconnaître)
  const hash = _hashKey(key)
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      workspace_id: workspaceId,
      created_by: userId || null,
      name: trimmedName,
      prefix,
      key_hash: hash,
    })
    .select('id, created_at')
    .single()
  if (error) throw error
  logger.info(
    { event: 'api_key_created', workspaceId, apiKeyId: data.id, prefix },
    'API key created',
  )
  return { key, prefix, id: data.id, createdAt: data.created_at }
}

async function listKeys(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, prefix, created_at, last_used_at, revoked_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }))
}

async function revokeKey(workspaceId, keyId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', keyId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Clé API introuvable ou déjà révoquée.')
  logger.info({ event: 'api_key_revoked', workspaceId, apiKeyId: keyId }, 'API key revoked')
  return { id: data.id, revoked: true }
}

/**
 * Vérifie une clé API présentée en Bearer header et retourne le workspace_id
 * autorisé si valide. Mise à jour best-effort de `last_used_at`. Utilisé par
 * un middleware d'auth alternatif au JWT (à câbler plus tard si on expose
 * des endpoints API publics).
 */
async function verifyKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null
  if (!rawKey.startsWith('sa_')) return null
  const hash = _hashKey(rawKey)
  const supabase = getServiceRoleClient()
  const { data } = await supabase
    .from('api_keys')
    .select('id, workspace_id, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle()
  if (!data || data.revoked_at) return null
  // best-effort touch
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error }) => {
      if (error) logger.warn({ event: 'api_key_touch_failed', error: error.message })
    })
  return { apiKeyId: data.id, workspaceId: data.workspace_id }
}

module.exports = { createKey, listKeys, revokeKey, verifyKey }
