# 03_ARCHITECTURE_GLOBALE.md

## Vue d'ensemble

Ce document décrit l'**architecture système complète** de SmartAnalyst : flux de données, layering, pattern Connector, multi-tenancy via RLS, et la couche Canonical Metrics. C'est la "carte routière" d'où chaque module s'inscrit.

**Pour qui :** Architectes, Backend leads, DevOps.

**À lire avant :** 00_BRIEF, 01_CONVENTIONS, 02_BONNES_PRATIQUES.

---

## 1. Vue d'ensemble (ASCII diagram)

```
┌────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SOURCES                             │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐       │
│  │  GA4   │  │ Meta   │  │Google  │  │Stripe  │  │Search  │       │
│  │        │  │ Ads    │  │ Ads    │  │        │  │Console │       │
│  └────┬───┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘       │
└───────┼──────────┼───────────┼───────────┼───────────┼─────────────┘
        │          │           │           │           │
        │   (OAuth + API KEY)   │           │           │
        ▼          ▼           ▼           ▼           ▼
┌────────────────────────────────────────────────────────────────────┐
│                      CONNECTOR LAYER                                │
│     BaseConnector (abstract)                                        │
│     ├─ GA4Connector: fetchData() → normalizeData()                 │
│     ├─ MetaAdsConnector: fetchData() → normalizeData()            │
│     ├─ GoogleAdsConnector: fetchData() → normalizeData()          │
│     ├─ StripeConnector: fetchData() → normalizeData()             │
│     └─ SearchConsoleConnector: fetchData() → normalizeData()      │
└────────┬───────────────────────────────────────────────────────────┘
         │
         │ (normalized data per connector)
         ▼
┌────────────────────────────────────────────────────────────────────┐
│              CANONICAL METRICS LAYER (Universal schema)             │
│     Transform: connector-specific → canonical_metrics table         │
│     ├─ ga4.sessions → canonical: sessions_all                      │
│     ├─ meta_ads.roas → canonical: return_on_investment_paid        │
│     ├─ stripe.mrr → canonical: revenue_recurring_monthly           │
│     └─ [100+ mappings]                                             │
│                                                                     │
│     Benefits:                                                       │
│     - IA always talks to one schema                                 │
│     - No source-specific hacks                                      │
│     - Easy to add new connectors                                    │
└────────┬───────────────────────────────────────────────────────────┘
         │
         │ (canonical metrics for workspace)
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                    SERVICES LAYER (Business logic)                  │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │AI Service  │  │Health    │  │PDF       │  │Email     │         │
│  │(Insights,  │  │Score     │  │Generator │  │Service   │         │
│  │ Chat,      │  │Service   │  │          │  │          │         │
│  │ Anomaly)   │  │          │  │          │  │          │         │
│  └────────────┘  └──────────┘  └──────────┘  └──────────┘         │
│                                                                     │
│  Input: canonical_metrics (never raw data)                          │
│  Output: Insights, scores, PDFs, alerts                            │
└────────┬────────────────────────────────────────────────────────────┘
         │
         │ (insights, reports, alerts)
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                   QUEUE SYSTEM (BullMQ + Redis)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │DataSync  │  │Insights  │  │Monthly   │  │Alert     │           │
│  │Job       │  │Gen Job   │  │Reports   │  │Check Job │           │
│  │(daily 3h)│  │(triggered)│ │(day 1)   │  │(4h freq) │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└────────┬─────────────────────────────────────────────────────────────┘
         │
         │ (events: data_synced, insights_generated, etc.)
         ▼
┌────────────────────────────────────────────────────────────────────┐
│           SUPABASE REALTIME + CACHE INVALIDATION                    │
│  ┌─────────────────────────────────┐                               │
│  │Publish event: data_synced       │                               │
│  │→ Clear Redis cache (workspace)  │                               │
│  │→ Frontend realtime subscription │                               │
│  │→ Dashboard auto-refreshes       │                               │
│  └─────────────────────────────────┘                               │
└────────┬────────────────────────────────────────────────────────────┘
         │
         │ (dashboard state, chat, reports)
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                      FRONTEND (HTML/JS vanilla)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │Dashboard │  │Chat      │  │Reports   │  │Settings  │           │
│  │(KPIs,    │  │(Ask in   │  │(Download,│  │(Manage   │           │
│  │Score,    │  │ French)  │  │send)     │  │conn.)    │           │
│  │Insights) │  │          │  │          │  │          │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└────────────────────────────────────────────────────────────────────┘

Database (Supabase PostgreSQL):
├─ organizations (agences)
├─ workspaces (clients gérés par agence)
├─ workspace_members (permissions granulaires)
├─ connectors (tokens chiffrés Vault)
├─ canonical_metrics (données universelles)
├─ report_data (raw data per report)
├─ reports (metadata)
├─ business_profiles (onboarding analysis)
├─ subscriptions (Stripe)
├─ audit_log (RGPD compliance)
└─ feature_flags (gradual rollout)

Cache Layer (Redis):
├─ BullMQ: Job queues + retries
├─ Cache: health_score, kpis, insights (TTL + explicit invalidation)
└─ Sessions: JWT storage (optional)
```

---

## 2. Pattern Connector (Extendable base class)

### 2.1 Interface obligatoire

```javascript
// src/connectors/base.connector.js

class BaseConnector {
  constructor(workspaceId, connectorRecord) {
    this.workspaceId = workspaceId
    this.connector = connectorRecord // { id, source, access_token, ... }
    this.source = connectorRecord.source
  }

  /**
   * Fetch raw data from the external API
   * @param {Object} dateRange - { startDate: '2025-01-01', endDate: '2025-01-31' }
   * @returns {Promise<Object>} Raw API response
   */
  async fetchData({ startDate, endDate }) {
    throw new Error('fetchData() must be implemented by subclass')
  }

  /**
   * Transform raw API data into canonical_metrics schema
   * @param {Object} rawData - Raw API response
   * @returns {Promise<Object>} { workspace_id, date, metrics: [...] }
   */
  async normalizeData(rawData) {
    throw new Error('normalizeData() must be implemented by subclass')
  }

  /**
   * Verify that credentials are still valid (token not expired)
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass')
  }

  /**
   * Refresh OAuth token if expiring soon (shared logic)
   * Calls _doRefresh() which subclass implements
   */
  async refreshTokenIfNeeded() {
    if (!this.connector.token_expires_at) return

    const expiresAt = new Date(this.connector.token_expires_at)
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    if (expiresAt < in7Days) {
      logger.info('Token expiring soon, refreshing', {
        connectorId: this.connector.id,
        expiresAt
      })
      await this._doRefresh()
    }
  }

  /**
   * Subclass implements actual refresh logic
   */
  async _doRefresh() {
    throw new Error('_doRefresh() must be implemented for OAuth connectors')
  }

  /**
   * Error handling & logging (shared)
   */
  async logError(context, error) {
    logger.error('Connector error', {
      workspaceId: this.workspaceId,
      connectorId: this.connector.id,
      source: this.source,
      ...context,
      error: error.message,
      stack: error.stack
    })
  }
}

module.exports = BaseConnector
```

### 2.2 Example implementation (GA4)

```javascript
// src/connectors/ga4.connector.js

const BaseConnector = require('./base.connector')

class GA4Connector extends BaseConnector {
  async fetchData({ startDate, endDate }) {
    try {
      // account_id = GA4 property ID (ex: '123456789')
      const response = await this.googleAnalyticsApi.request({
        property: `properties/${this.connector.account_id}`,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'newUsers' },
          { name: 'conversions' },
          { name: 'conversionValue' }
        ],
        dimensions: [
          { name: 'date' },
          { name: 'sessionDefaultChannelGroup' }
        ]
      })

      return response
    } catch (error) {
      await this.logError({
        operation: 'fetchGA4Data',
        property: this.connector.account_id
      }, error)
      throw error
    }
  }

  async normalizeData(rawData) {
    // Transform GA4 response → canonical metrics
    const canonicalMetrics = []

    for (const row of rawData.rows || []) {
      const date = row.dimensions[0]
      const channel = row.dimensions[1]

      canonicalMetrics.push(
        {
          workspace_id: this.workspaceId,
          date,
          metric_key: 'sessions_all',
          metric_value: parseFloat(row.metrics[1].value),
          source: 'ga4',
          confidence_score: 100
        },
        {
          workspace_id: this.workspaceId,
          date,
          metric_key: 'conversions_total',
          metric_value: parseFloat(row.metrics[3].value),
          source: 'ga4',
          confidence_score: 100
        }
        // ... more metrics
      )
    }

    return { workspace_id: this.workspaceId, metrics: canonicalMetrics }
  }

  async testConnection() {
    try {
      await this.googleAnalyticsApi.request({
        property: `properties/${this.connector.account_id}`,
        dateRanges: [{ startDate: '2025-01-01', endDate: '2025-01-02' }],
        metrics: [{ name: 'sessions' }]
      })
      return true
    } catch (error) {
      return false
    }
  }

  async _doRefresh() {
    const newTokens = await googleAuthService.refreshAccessToken(
      this.connector.refresh_token
    )

    await db.connectors.update(this.connector.id, {
      access_token: vault.encrypt(newTokens.access_token),
      refresh_token: vault.encrypt(newTokens.refresh_token),
      token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000)
    })
  }
}

module.exports = GA4Connector
```

---

## 3. Multi-Tenancy via RLS (Row-Level Security)

### 3.1 RLS Policies (Supabase)

```sql
-- Pattern: Every table has RLS policy on workspace_id

-- CONNECTORS table example
CREATE POLICY "workspace_select_connector" ON connectors
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE organization_id IN (
        SELECT organization_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Interpretation:
-- "User can SELECT connectors only if they are a member
--  of a workspace that owns those connectors"

CREATE POLICY "workspace_insert_connector" ON connectors
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces
      WHERE organization_id IN (
        SELECT organization_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Similar for UPDATE, DELETE policies
```

### 3.2 Enforcing multi-tenancy in code

```javascript
// Backend: Always use service_role to bypass RLS for internal logic
// But always filter by workspace_id in code

async function getConnectorData(userId, workspaceId) {
  // 1. Verify user has access to this workspace
  const member = await db.workspace_members
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    throw new Error('Access denied: workspace not found for user')
  }

  // 2. Fetch connector (RLS will be enforced by Supabase)
  const connector = await db.connectors
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  return connector
}

// Frontend: Supabase JS client uses anon_key (RLS enforced)
const { data } = await supabase
  .from('connectors')
  .select('*')
  .eq('workspace_id', workspaceId) // User's workspace (auth.uid() enforces access)

// Even if user manually requests another workspace,
// RLS policies prevent data leakage
```

### 3.3 Why RLS matters (security example)

```javascript
// Attacker scenario:
const hacker_user_id = 'evil-user-123'
const target_workspace_id = 'victim-workspace-456'

// Attempt 1: Direct SQL (if using old architecture)
SELECT * FROM connectors
WHERE workspace_id = 'victim-workspace-456'
// Without RLS: Returns victim's data ❌

// Attempt 2: With RLS enabled (our setup)
SELECT * FROM connectors
WHERE workspace_id = 'victim-workspace-456'
// With RLS: Returns nothing (user not in workspace) ✅

// Result: Data isolation guaranteed at database level
// Not a bug in application code that could leak data
```

---

## 4. Canonical Metrics Layer (Data normalization)

### 4.1 Why Canonical Metrics?

**Problem without it:**
```javascript
// Nightmare scenario (different schemas per source)

if (source === 'ga4') {
  const roi = revenue / cost
} else if (source === 'meta_ads') {
  const roi = conversions * avgValue / spend
} else if (source === 'stripe') {
  const roi = undefined // ??
}

// IA has to handle all these cases
// Health score formula is different per source
// Benchmark is different per source
// Leads to bugs and inconsistent logic
```

**Solution with Canonical Metrics:**
```javascript
// All sources → universal schema

canonical_metrics table:
├─ workspace_id, date, metric_key, metric_value, source

// All sources speak the same language

const spend = await getCanonicalMetric('spend_paid_social', workspace, date)
const revenue = await getCanonicalMetric('revenue_total', workspace, date)
const roi = revenue / spend // Same formula for everything

// IA always queries canonical_metrics
// Health score formula is universal
// Benchmark compares apples to apples
```

### 4.2 Canonical Metrics mapping table

```sql
-- Reference table for all metric transformations

canonical_metric_mappings:
├─ id
├─ source ('ga4', 'meta_ads', 'stripe', etc.)
├─ source_metric_key ('sessions', 'roas', 'mrr')
├─ canonical_metric_key ('sessions_all', 'return_on_investment_paid', 'revenue_recurring_monthly')
├─ transformation_logic TEXT (formula or notes)
├─ confidence_adjustment INT (0-100, if data is noisy)
└─ created_at

Example rows:
- source: 'ga4', source_metric: 'sessions', canonical: 'sessions_all', confidence: 100
- source: 'meta_ads', source_metric: 'roas', canonical: 'return_on_investment_paid', confidence: 95
- source: 'stripe', source_metric: 'mrr', canonical: 'revenue_recurring_monthly', confidence: 100
```

### 4.3 Data ingestion flow

```
1. Connector.fetchData() → raw API data
2. Connector.normalizeData() → canonical_metrics format
3. Insert into canonical_metrics table
4. Publish event: 'data_synced'
5. Clear Redis cache: health_score_{workspace_id}, kpis_{workspace_id}
6. Services (AI, Health Score, Reports) query canonical_metrics
7. Frontend gets results via API
```

---

## 5. Event-driven updates (Realtime + cache invalidation)

### 5.1 Event flow

```
Job: DataSyncJob completes
  ├─ Insert data into canonical_metrics
  ├─ Publish event to Supabase Realtime
  │  {
  │    event_type: 'data_synced',
  │    workspace_id: '123',
  │    connector_id: 'ga4-001',
  │    synced_at: '2025-05-15T14:30:00Z'
  │  }
  ├─ Clear Redis cache keys:
  │  - health_score_123
  │  - kpis_123_*
  │  - insights_123
  └─ Trigger next job: InsightsGenerationJob

Frontend: Subscribed to realtime events
  ├─ Receives: data_synced event
  ├─ Refetch dashboard (not waiting for TTL)
  ├─ Update UI instantly
  └─ No stale data
```

### 5.2 Implementation

```javascript
// Backend (queue job)
async function dataSyncJobComplete(workspaceId, connectorId) {
  // 1. Data already inserted
  
  // 2. Publish realtime event
  await supabase.from('workspace_updates').insert({
    workspace_id: workspaceId,
    event_type: 'data_synced',
    connector_id: connectorId,
    synced_at: new Date().toISOString()
  })

  // 3. Clear cache (explicit, not TTL)
  await redis.del(`health_score_${workspaceId}`)
  await redis.del(`kpis_${workspaceId}_*`)

  // 4. Trigger insights generation
  await insightsQueue.add('generate', { workspaceId })
}

// Frontend
supabase
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'workspace_updates' },
    (payload) => {
      if (payload.new.workspace_id === currentWorkspaceId) {
        // Refetch dashboard immediately
        refreshDashboard()
      }
    }
  )
  .subscribe()
```

---

## 6. Service layer (input = canonical_metrics)

```
AI Service:
  Input: canonical_metrics for workspace + date range
  Output: Insights (fact + context + recommendation)

Health Score Service:
  Input: canonical_metrics for workspace + 12 months history
  Output: Score 0-100 + breakdown by dimension

PDF Generator:
  Input: canonical_metrics + insights + benchmark data
  Output: PDF report

Anomaly Detection:
  Input: canonical_metrics + historical comparison
  Output: Alerts (if anomalies detected)

⚠️ RULE: Services NEVER query raw source data.
   Always query canonical_metrics.
   This ensures consistency across all logic.
```

---

## 7. Database integrity

### 7.1 Foreign keys & constraints

```sql
-- Ensure referential integrity

ALTER TABLE connectors
  ADD CONSTRAINT fk_connectors_workspace
  FOREIGN KEY (workspace_id)
  REFERENCES workspaces(id)
  ON DELETE CASCADE; -- If workspace deleted, delete connectors

ALTER TABLE canonical_metrics
  ADD CONSTRAINT fk_metrics_workspace
  FOREIGN KEY (workspace_id)
  REFERENCES workspaces(id)
  ON DELETE CASCADE;

-- Unique constraints (no duplicate data)

ALTER TABLE canonical_metrics
  ADD UNIQUE(workspace_id, date, metric_key, source);
  -- Prevents same metric from being inserted twice
```

### 7.2 Transaction safety

```javascript
// ✅ CORRECT: Atomic operations

async function syncConnectorData(workspace_id, connector_id) {
  return await db.transaction(async (trx) => {
    // 1. Insert canonical_metrics (all or nothing)
    await trx('canonical_metrics').insert(metricsArray)

    // 2. Update connector status
    await trx('connectors')
      .where('id', connector_id)
      .update({
        status: 'active',
        last_synced_at: new Date()
      })

    // Both succeed or both fail (no partial data)
  })
}
```

---

## Prochaine étape

Lire **04_SCHEMA_DONNEES_COMPLET.md** (DDL complète, RLS policies, migrations).

---

*Dernière mise à jour : Mai 2025*
