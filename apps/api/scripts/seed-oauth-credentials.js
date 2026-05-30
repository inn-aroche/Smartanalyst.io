#!/usr/bin/env node
// Hydrate les Client ID / Client Secret OAuth depuis les variables
// d'environnement vers la table integration_providers (chiffrés via Vault).
//
// À exécuter une fois par environnement (dev / prod) après avoir créé les
// apps OAuth chez les providers et collé leurs Client ID/Secret dans les
// secrets de déploiement.
//
// Usage:
//   cd apps/api && node scripts/seed-oauth-credentials.js
//
// Variables lues:
//   GOOGLE_CLIENT_ID   + GOOGLE_CLIENT_SECRET   → provider 'ga4'
//   META_APP_ID        + META_APP_SECRET        → provider 'meta_ads'
//   SHOPIFY_API_KEY    + SHOPIFY_API_SECRET     → provider 'shopify'
//
// Une fois exécuté, les providers concernés peuvent être basculés en
// status='available' (SQL ou admin UI à venir).

require('dotenv').config()
const providersService = require('../src/services/connectors/providers.service')

const MAPPING = [
  {
    source: 'ga4',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  {
    source: 'meta_ads',
    clientId: process.env.META_APP_ID,
    clientSecret: process.env.META_APP_SECRET,
  },
  {
    source: 'shopify',
    clientId: process.env.SHOPIFY_API_KEY,
    clientSecret: process.env.SHOPIFY_API_SECRET,
  },
]

async function main() {
  let ok = 0
  let skipped = 0
  let failed = 0

  for (const { source, clientId, clientSecret } of MAPPING) {
    if (!clientId || !clientSecret) {
      // eslint-disable-next-line no-console
      console.log(`⊘ ${source}: variables d'environnement manquantes (skip)`)
      skipped++
      continue
    }
    try {
      await providersService.setCredentials(source, { clientId, clientSecret })
      // eslint-disable-next-line no-console
      console.log(`✓ ${source}: credentials hydratés (chiffrés via Vault)`)
      ok++
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`✗ ${source}: ${err.message}`)
      failed++
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nRésultat: ${ok} succès, ${skipped} ignorés, ${failed} échecs.`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Erreur fatale:', err)
  process.exit(1)
})
