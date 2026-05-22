// Supabase clients.
// - serviceRoleClient: bypass RLS, backend uniquement, jamais exposé au frontend
// - anonClient: respecte RLS, utilisé pour valider un JWT user-side
// Source: docs/03_ARCHITECTURE_GLOBALE.md §3.2, docs/06_SUPABASE_BONNES_PRATIQUES.md

const { createClient } = require('@supabase/supabase-js')

let serviceRoleClient = null
let anonClient = null

function getServiceRoleClient() {
  if (!serviceRoleClient) {
    serviceRoleClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )
  }
  return serviceRoleClient
}

function getAnonClient() {
  if (!anonClient) {
    anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  return anonClient
}

/**
 * Returns a Supabase client scoped to a user JWT.
 * RLS policies will apply based on auth.uid() = user_id.
 */
function getUserScopedClient(jwt) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

module.exports = {
  getServiceRoleClient,
  getAnonClient,
  getUserScopedClient,
}
