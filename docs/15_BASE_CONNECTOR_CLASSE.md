# 15_BASE_CONNECTOR_CLASSE.md

## Abstract Base Class

```javascript
class BaseConnector {
  constructor(workspaceId, connectorRecord) {
    this.workspaceId = workspaceId
    this.connector = connectorRecord
    this.source = connectorRecord.source
  }

  async fetchData({ startDate, endDate }) {
    throw new Error('Must be implemented')
  }

  async normalizeData(rawData) {
    // Must return { workspace_id, metrics: [...] }
    throw new Error('Must be implemented')
  }

  async testConnection() {
    throw new Error('Must be implemented')
  }

  async refreshTokenIfNeeded() {
    if (!this.connector.token_expires_at) return
    const expiresAt = new Date(this.connector.token_expires_at)
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    if (expiresAt < in7Days) {
      await this._doRefresh()
    }
  }

  async _doRefresh() {
    throw new Error('Must be implemented for OAuth connectors')
  }
}
```

## Connector Factory

```javascript
// src/connectors/index.js

function getConnector(workspaceId, connectorRecord) {
  switch (connectorRecord.source) {
    case 'ga4':
      return new GA4Connector(workspaceId, connectorRecord)
    case 'meta_ads':
      return new MetaAdsConnector(workspaceId, connectorRecord)
    case 'google_ads':
      return new GoogleAdsConnector(workspaceId, connectorRecord)
    case 'stripe':
      return new StripeConnector(workspaceId, connectorRecord)
    case 'search_console':
      return new SearchConsoleConnector(workspaceId, connectorRecord)
    default:
      throw new Error(`Unknown connector: ${connectorRecord.source}`)
  }
}
```

## Test Implementation

```javascript
async function testConnector(connector) {
  try {
    const isValid = await connector.testConnection()
    if (!isValid) {
      return { status: 'expired', message: 'Token expired' }
    }
    return { status: 'active' }
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}
```

---
