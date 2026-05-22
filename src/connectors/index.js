// Connector factory.
//
// Source: docs/15_BASE_CONNECTOR_CLASSE.md §"Connector Factory"
//
// Usage:
//   const connector = getConnector(workspaceId, connectorRecord)
//   await connector.sync({ startDate, endDate })
//
// Pour ajouter un connecteur:
//   1. Créer src/connectors/<source>.connector.js qui étend BaseConnector
//   2. Ajouter le case dans le switch ci-dessous
//   3. Ajouter le mapping dans canonical-metrics-mapping.js
//   4. Documenter la source dans docs/

const { UserFacingError } = require('../lib/error-handler')

const SUPPORTED_SOURCES = ['ga4', 'meta_ads', 'google_ads', 'stripe', 'search_console']

/**
 * @param {string} workspaceId
 * @param {Object} connectorRecord - Row de la table `connectors`
 * @returns {import('./base.connector')}
 */
function getConnector(workspaceId, connectorRecord) {
  if (!connectorRecord || !connectorRecord.source) {
    throw new UserFacingError('Connecteur invalide (source manquante).', {
      statusCode: 400,
      code: 'INVALID_CONNECTOR',
    })
  }

  switch (connectorRecord.source) {
    case 'ga4': {
      const GA4Connector = require('./ga4.connector')
      return new GA4Connector(workspaceId, connectorRecord)
    }
    // TODO: case 'meta_ads': return new (require('./meta-ads.connector'))(workspaceId, connectorRecord)
    // TODO: case 'google_ads': return new (require('./google-ads.connector'))(workspaceId, connectorRecord)
    // TODO: case 'stripe': return new (require('./stripe.connector'))(workspaceId, connectorRecord)
    // TODO: case 'search_console': return new (require('./search-console.connector'))(workspaceId, connectorRecord)
    default:
      throw new UserFacingError(
        `Connecteur "${connectorRecord.source}" pas encore disponible.`,
        { statusCode: 501, code: 'CONNECTOR_NOT_IMPLEMENTED' },
      )
  }
}

module.exports = { getConnector, SUPPORTED_SOURCES }
