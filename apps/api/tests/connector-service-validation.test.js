// Tests de la validation côté connector.service:
// - addApiKeyConnector rejette les clés au format invalide AVANT tout appel DB
// - Pas de mock supabase nécessaire car la validation throw avant.

process.env.LOG_LEVEL = 'fatal'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const connectorService = require('../src/services/connectors/connector.service')

test('addApiKeyConnector: rejects malformed Stripe key (publishable key)', async () => {
  await assert.rejects(
    () =>
      connectorService.addApiKeyConnector({
        workspaceId: 'ws-1',
        source: 'stripe',
        accountId: 'acct_1',
        apiKey: 'pk_test_should_be_rejected',
      }),
    (err) => {
      assert.equal(err.code, 'INVALID_API_KEY_FORMAT')
      assert.equal(err.statusCode, 400)
      return true
    },
  )
})

test('addApiKeyConnector: rejects empty Stripe key', async () => {
  await assert.rejects(
    () =>
      connectorService.addApiKeyConnector({
        workspaceId: 'ws-1',
        source: 'stripe',
        accountId: 'acct_1',
        apiKey: '',
      }),
    (err) => {
      // Validation "apiKey requis" tape avant le pattern (early return)
      assert.equal(err.code, 'MISSING_FIELDS')
      return true
    },
  )
})

test('addApiKeyConnector: rejects unsupported source', async () => {
  await assert.rejects(
    () =>
      connectorService.addApiKeyConnector({
        workspaceId: 'ws-1',
        source: 'made_up_source',
        accountId: 'acct_1',
        apiKey: 'sk_test_xxx',
      }),
    (err) => {
      assert.equal(err.code, 'UNSUPPORTED_SOURCE')
      return true
    },
  )
})
