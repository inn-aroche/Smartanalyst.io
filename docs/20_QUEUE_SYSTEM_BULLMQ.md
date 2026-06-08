# 20_QUEUE_SYSTEM_BULLMQ.md

## BullMQ Queue Architecture

Job queue system with retries, priorities, dead-letter queue.

## Setup

```javascript
const Queue = require('bullmq').Queue
const redis = new Redis(process.env.REDIS_URL)

// Create queues
const dataSyncQueue = new Queue('data-sync', { connection: redis })
const insightsQueue = new Queue('insights-generation', { connection: redis })
const reportsQueue = new Queue('monthly-reports', { connection: redis })
const alertQueue = new Queue('alert-check', { connection: redis })

module.exports = {
  dataSyncQueue,
  insightsQueue,
  reportsQueue,
  alertQueue
}
```

## Jobs

### 1. DataSync (daily 3am)

```javascript
dataSyncQueue.add(
  'sync-all',
  { workspaceId },
  {
    repeat: { cron: '0 3 * * *', tz: 'UTC' },
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  }
)
```

### 2. Insights Generation (triggered after sync)

```javascript
async function onDataSyncComplete(workspaceId) {
  await insightsQueue.add(
    'generate',
    { workspaceId },
    {
      priority: 10,
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 }
    }
  )
}
```

### 3. Monthly Reports (1st of month 6am)

```javascript
reportsQueue.add(
  'generate-monthly',
  { workspaceId },
  {
    repeat: { cron: '0 6 1 * *', tz: 'UTC' },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  }
)
```

### 4. Alert Check (every 4 hours)

```javascript
alertQueue.add(
  'check-thresholds',
  { workspaceId },
  {
    repeat: { every: 4 * 60 * 60 * 1000 },
    attempts: 2
  }
)
```

## Worker Implementation

```javascript
dataSyncQueue.process(async (job) => {
  const { workspaceId } = job.data
  
  try {
    // Fetch all connectors
    const connectors = await db.connectors.getByWorkspace(workspaceId)
    
    for (const connector of connectors) {
      // Sync each one
      await syncConnector(connector)
    }
    
    // Publish realtime event
    await supabase.from('workspace_updates').insert({
      workspace_id: workspaceId,
      event_type: 'data_synced'
    })
    
    // Clear cache
    await redis.del(\`health_score_\${workspaceId}\`)
    
    return { success: true }
  } catch (error) {
    logger.error('Sync failed', { workspaceId, error })
    throw error // BullMQ will retry
  }
})
```

## Error Handling

- Max 3 retries with exponential backoff (configurable via `DEFAULT_JOB_OPTIONS.attempts`)
- Failed jobs gardés 7 jours dans Redis (`removeOnFail: { age: 7 * 86400 }`)
- Distinction transient (retry à venir) vs final (épuisé) — voir `apps/api/src/queue-jobs/workers.js`
- Sur fail final : `recordFinalFailure()` → Sentry capture + sliding window counter

## Monitoring & DLQ (Lot 3 PR #B)

### Sentry capture sur job failed

Le `worker.on('failed', ...)` distingue 2 cas :

```javascript
const isFinal = attemptsMade >= maxAttempts
if (isFinal) {
  await recordFinalFailure({ queueName, jobName, jobId, error, jobData, attemptsMade })
}
```

- **Fail transient** (retry à venir) → log warn + pino. Pas de capture Sentry pour éviter le spam pendant les retries normaux.
- **Fail final** (retries épuisés) → log error + `captureException` Sentry avec tags `queue`, `jobName`, `service=worker`, extras `jobId`, `attemptsMade`, `jobData` tronqué à 2 KB.

### Sliding window burst detection

Chaque fail final est enregistré dans un sorted set Redis `dlq:failures:<queue>` avec timestamp.
Si > `BURST_THRESHOLD` (10 par défaut) fails dans la dernière heure sur la même queue :

```javascript
captureMessage(
  `DLQ burst on queue "${queueName}": ${recentCount} jobs failed in last hour`,
  'error',
  { tags: { alert: 'dlq_burst', queue: queueName } },
)
```

Côté Sentry, configurer une **Alert Rule** sur `tag:alert = dlq_burst` qui ping Slack / email. Évite la chute silencieuse de tout un connecteur (ex: Meta token expiré → 100 jobs failed en 1h).

### Endpoints admin (auth via `X-Admin-Token`)

Tous derrière `requireAdminToken` (cf `apps/api/src/middleware/admin-token.middleware.js`).
Token ≥ 32 chars, généré avec `openssl rand -hex 32`, stocké dans `ADMIN_TOKEN` env.

| Endpoint | Action |
|---|---|
| `GET /admin/queues` | Liste des queues |
| `GET /admin/queues/:name/stats` | Counts par état + `recentFailureCount` (sliding window) |
| `GET /admin/queues/:name/failed?limit=20` | Jobs en DLQ avec failedReason + stacktrace |
| `POST /admin/queues/:name/failed/:jobId/retry` | Re-enqueue (BullMQ `job.retry()`) |
| `POST /admin/queues/:name/failed/:jobId/remove` | Delete sans rejouer |

Exposé via Nginx — les requêtes `/admin/queues/*` arrivent naturellement sur l'API (port 3000) via le `location /` du bloc nginx existant. Pas de config nginx supplémentaire requise.

#### Exemple : inspecter les fails d'une queue

```bash
TOKEN="<contenu d'ADMIN_TOKEN>"
curl -sS -H "X-Admin-Token: $TOKEN" https://api.smartanalyst.io/admin/queues/data-sync/stats | jq
# → {"queue":"data-sync","counts":{...},"recentFailureCount":7,...}

curl -sS -H "X-Admin-Token: $TOKEN" https://api.smartanalyst.io/admin/queues/data-sync/failed?limit=5 | jq
# → liste des 5 derniers jobs failed avec stacktrace tronqué

# Rejouer un job spécifique
curl -sS -X POST -H "X-Admin-Token: $TOKEN" \
  https://api.smartanalyst.io/admin/queues/data-sync/failed/<jobId>/retry
```

### Tests

- `apps/api/tests/dlq.test.js` : helper (18 tests)
- `apps/api/tests/admin-queues.test.js` : routes admin (auth + endpoints)

---
