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

- Max 3 retries with exponential backoff
- Failed jobs → Dead-letter queue
- Admin dashboard shows failed jobs
- Alert if too many failures

## Monitoring

```javascript
dataSyncQueue.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job.id, error: err.message })
  
  // Alert if critical
  if (err.message.includes('API')) {
    slack.notify('🔴 API sync failure')
  }
})

dataSyncQueue.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id })
})
```

---
