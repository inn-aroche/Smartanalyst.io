# 16b_ANOMALY_DETECTION.md

## Data Quality Checks

Detect broken tracking, not real business problems.

## Rules

```javascript
const ANOMALIES = {
  ga4: [
    {
      name: 'Sessions dropped 80%+',
      check: (curr, prev) => (prev - curr) / prev > 0.8,
      severity: 'CRITICAL',
      reason: 'Likely GA4 tracking broken or tag removed'
    },
    {
      name: 'Conversions zero for 3+ days',
      check: (curr, days_history) => curr === 0 && days_history.filter(d => d === 0).length >= 3,
      severity: 'CRITICAL',
      reason: 'Conversion event not firing'
    }
  ],
  meta_ads: [
    {
      name: 'Spend > 0 but zero impressions',
      check: (spend, impressions) => spend > 0 && impressions === 0,
      severity: 'WARNING',
      reason: 'Ads may not be serving (budget/audience issue)'
    }
  ],
  stripe: [
    {
      name: 'No transactions for 7+ days',
      check: (transaction_count, days) => transaction_count === 0 && days >= 7,
      severity: 'WARNING',
      reason: 'Payment gateway may be down or inactive'
    }
  ]
}
```

## Implementation

```javascript
async function detectAnomalies(workspaceId) {
  const metrics = await getCanonicalMetrics(workspaceId)
  const alerts = []
  
  for (const [source, checks] of Object.entries(ANOMALIES)) {
    for (const check of checks) {
      const isAnomalous = check.check(metrics)
      if (isAnomalous) {
        alerts.push({
          source,
          name: check.name,
          severity: check.severity,
          reason: check.reason,
          timestamp: new Date()
        })
      }
    }
  }
  
  return alerts
}
```

---
