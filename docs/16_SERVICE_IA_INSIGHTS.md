# 16_SERVICE_IA_INSIGHTS.md

## AI Service Overview

Generates insights using Claude Haiku (fast) or Claude Sonnet (quality).

## Prompt System

```javascript
async function generateInsights(workspaceId, dateRange) {
  // 1. Get business profile
  const profile = await db.business_profiles.get(workspaceId)
  
  // 2. Get canonical metrics
  const metrics = await db.canonical_metrics
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('date', dateRange.start)
    .lte('date', dateRange.end)
  
  // 3. Build prompt
  const systemPrompt = \`
Tu es l'analyste marketing de \${profile.name}.
Secteur: \${profile.sector}
Marché: \${profile.market}

Génère exactement 3-5 insights marketing actionnables.

RÈGLES ABSOLUES:
1. Chaque insight = 3 éléments: FAIT (chiffre) + CONTEXTE (cause) + RECOMMANDATION (action + timing)
2. Classe: ALERTE (🔴), OPPORTUNITÉ (🟡), ou TENDANCE (🔵)
3. Format JSON strict

Format:
{
  "insights": [
    {
      "level": "ALERTE" | "OPPORTUNITÉ" | "TENDANCE",
      "source": "ga4" | "meta_ads" | "stripe",
      "title": "Titre court",
      "fact": "Métrique + chiffre",
      "context": "Pourquoi c'est important",
      "recommendation": "Action concrète + timing",
      "metric": { "name": "...", "value": X, "variation": "+18%" },
      "why": [...] // Explication du raisonnement
    }
  ],
  "health_score": 0-100,
  "health_breakdown": {
    "paid_performance": 0-100,
    "organic_performance": 0-100,
    "conversion": 0-100,
    "revenue": 0-100
  }
}
  \`
  
  // 4. Call Anthropic
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: \`Données: \${JSON.stringify(metrics)}
Analyse ces données.\`
    }]
  })
  
  // 5. Parse JSON response
  const result = JSON.parse(response.content[0].text)
  
  // 6. Validate (each insight has 3 elements)
  result.insights = result.insights.filter(i => i.fact && i.context && i.recommendation)
  
  return result
}
```

## Thresholds & Anomalies

```javascript
const ALERT_THRESHOLDS = {
  meta_ads: {
    roas_critical: { metric: 'return_on_investment_paid', operator: '<', value: 2.0 },
    cpm_spike: { metric: 'cost_per_mille_paid', operator: '>', value: 0.25, range: '7d' },
    ctr_drop: { metric: 'click_through_rate_paid', operator: '<', value: -0.20, range: '7d' }
  },
  ga4: {
    traffic_drop: { metric: 'sessions_all', operator: '<', value: -0.20, range: '7d' },
    bounce_high: { metric: 'bounce_rate_all', operator: '>', value: 0.75 },
    conversion_drop: { metric: 'conversions_total', operator: '<', value: -0.15, range: '7d' }
  },
  stripe: {
    churn_high: { metric: 'churn_rate_subscription', operator: '>', value: 0.05 },
    mrr_drop: { metric: 'revenue_recurring_monthly', operator: '<', value: -0.10, range: '30d' }
  }
}
```

## Health Score Formula

```javascript
function calculateHealthScore(metrics) {
  // 4 dimensions, weighted
  const paidScore = calculatePaidPerformance(metrics) // 30%
  const organicScore = calculateOrganicPerformance(metrics) // 25%
  const conversionScore = calculateConversion(metrics) // 25%
  const revenueScore = calculateRevenue(metrics) // 20%
  
  return Math.round(
    paidScore * 0.30 +
    organicScore * 0.25 +
    conversionScore * 0.25 +
    revenueScore * 0.20
  )
}
```

---
