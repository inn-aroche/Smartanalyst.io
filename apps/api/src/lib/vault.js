// Vault: chiffrement pluggable des secrets stockés en base (tokens OAuth, API keys).
//
// Source: docs/02_BONNES_PRATIQUES_TRANSVERSALES.md §2.1, docs/06_SUPABASE_BONNES_PRATIQUES.md §3
//
// Comportement:
//   - VAULT_ENABLED=true  → utilise Supabase Vault (vault_encrypt_secret / vault_decrypt_secret)
//   - Sinon               → passthrough (DEV uniquement). Émet un warning UNE fois au boot.
//
// IMPORTANT: en production VAULT_ENABLED doit être true. La passerelle Vault
// requiert la configuration côté Supabase (extension vault + key_id). Voir doc 06.

const { logger } = require('./logger')

const enabled =
  process.env.VAULT_ENABLED === 'true' || process.env.VAULT_ENABLED === '1'

let disabledWarned = false

function warnDisabledOnce() {
  if (disabledWarned) return
  disabledWarned = true
  logger.warn(
    { event: 'vault_disabled' },
    'Vault encryption disabled — secrets stored in plaintext. Set VAULT_ENABLED=true and configure Supabase Vault before production.',
  )
}

async function encrypt(plaintext) {
  if (!enabled) {
    warnDisabledOnce()
    return plaintext
  }
  // Lazy require pour éviter une dépendance circulaire au boot
  const { getServiceRoleClient } = require('./supabase')
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.rpc('vault_encrypt_secret', { secret: plaintext })
  if (error) throw error
  return data
}

async function decrypt(ciphertext) {
  if (!enabled) {
    warnDisabledOnce()
    return ciphertext
  }
  const { getServiceRoleClient } = require('./supabase')
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.rpc('vault_decrypt_secret', { secret: ciphertext })
  if (error) throw error
  return data
}

module.exports = { encrypt, decrypt, isEnabled: () => enabled }
