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
//
// Audit log: chaque encrypt/decrypt émet un event `vault_encrypt` / `vault_decrypt`
// dans les logs structurés. Le plaintext n'est JAMAIS loggé — seules les metadata
// du contexte (workspaceId, secretType, source, connectorId) sont émises.
// Les call sites passent un objet `context` en 2e argument pour enrichir la trace.

const { logger } = require('./logger')

// Évalué dynamiquement à chaque appel — sinon, si VAULT_ENABLED n'est pas
// défini au boot du processus (cas vu en prod : env var ajoutée après le
// 1er démarrage), tous les appels suivants retombent silencieusement en
// passthrough et on stocke des UUIDs Vault en clair qui sont ensuite
// renvoyés tels quels aux providers OAuth → erreur "invalid_client".
function isEnabled() {
  return (
    process.env.VAULT_ENABLED === 'true' || process.env.VAULT_ENABLED === '1'
  )
}

let disabledWarned = false

function warnDisabledOnce() {
  if (disabledWarned) return
  disabledWarned = true
  logger.warn(
    { event: 'vault_disabled' },
    'Vault encryption disabled — secrets stored in plaintext. Set VAULT_ENABLED=true and configure Supabase Vault before production.',
  )
}

async function encrypt(plaintext, context = {}) {
  const enabled = isEnabled()
  if (!enabled) {
    warnDisabledOnce()
    logger.info(
      { event: 'vault_encrypt', mode: 'passthrough', ...context },
      'Vault encrypt (passthrough)',
    )
    return plaintext
  }
  // Lazy require pour éviter une dépendance circulaire au boot
  const { getServiceRoleClient } = require('./supabase')
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.rpc('vault_encrypt_secret', { secret: plaintext })
  if (error) {
    logger.error(
      { event: 'vault_encrypt_failed', error: error.message, ...context },
      'Vault encrypt failed',
    )
    throw error
  }
  logger.info(
    { event: 'vault_encrypt', mode: 'vault', ...context },
    'Vault encrypt',
  )
  return data
}

async function decrypt(ciphertext, context = {}) {
  const enabled = isEnabled()
  if (!enabled) {
    warnDisabledOnce()
    logger.info(
      { event: 'vault_decrypt', mode: 'passthrough', ...context },
      'Vault decrypt (passthrough)',
    )
    return ciphertext
  }
  const { getServiceRoleClient } = require('./supabase')
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.rpc('vault_decrypt_secret', { secret: ciphertext })
  if (error) {
    logger.error(
      { event: 'vault_decrypt_failed', error: error.message, ...context },
      'Vault decrypt failed',
    )
    throw error
  }
  // Sanity check : si on a reçu un UUID en input mais qu'on renvoie le même
  // UUID en output, c'est qu'on est en passthrough alors qu'on pensait être
  // chiffré. Logger une erreur explicite pour faciliter le debug futur.
  if (data === ciphertext && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ciphertext)) {
    logger.error(
      { event: 'vault_decrypt_returned_uuid_unchanged', ...context },
      'vault_decrypt_secret returned an unchanged UUID — likely no matching secret in vault. Check that the encrypted value points to an existing vault.secrets row.',
    )
  }
  logger.info(
    { event: 'vault_decrypt', mode: 'vault', ...context },
    'Vault decrypt',
  )
  return data
}

module.exports = { encrypt, decrypt, isEnabled }
