# 10_BILLING_ET_STRIPE.md

## Vue d'ensemble

Configuration complète Stripe + quotas par plan + monitoring coûts. SmartAnalyst a 4 plans avec limitations claires et scalables.

**Pour qui:** Backend (billing service), Product (quotas), Finance (coûts).

---

## 1. Plans & Tarification

### Free (Toujours gratuit)

```
Prix: 0€
Durée: Illimitée (pas de trial)
Renouvellement: N/A

Limites:
├─ Workspaces: 1
├─ Connecteurs: 1 (max)
├─ Insights IA: 3 par semaine (max)
├─ Rapports auto: Non
├─ White-label: Non (branding SmartAnalyst visible)
├─ Stockage fichiers: 0 MB
├─ Utilisateurs: 1
├─ SLA: Best-effort (pas garanti)
└─ Rétention données: 90 jours

Cas d'usage: Freelance solo, TPE test, demo
```

### Starter (99€/mois)

```
Prix: 99€/mois
Trial: 14 jours (pas de CB requis)
Renouvellement: Mensuel auto

Limites:
├─ Workspaces: 5
├─ Connecteurs par workspace: 3 (mais 1 seulement peut être API; autres = upload fichiers)
├─ Insights IA: 100 par mois (générés auto)
├─ Rapports auto: Oui (1 client max par workspace)
├─ White-label: Logo seul
├─ Stockage fichiers: 5 MB
├─ Utilisateurs par workspace: 2
├─ API calls IA: Haiku = 50k tokens/mois, Sonnet = 10k tokens/mois
├─ Concurrent users: 2
└─ Rétention données: 90 jours

Cas d'usage: Freelances (2-8 clients), petites agences
```

### Pro (199€/mois)

```
Prix: 199€/mois
Trial: 14 jours (pas de CB requis)
Renouvellement: Mensuel auto

Limites:
├─ Workspaces: 20
├─ Connecteurs par workspace: Tous les P1 + 2 P2 gratuits
├─ Insights IA: 500 par mois
├─ Rapports auto: Oui (5 clients par workspace)
├─ White-label: Logo + couleurs + footer custom
├─ Stockage fichiers: 50 MB
├─ Utilisateurs par workspace: 5
├─ API calls IA: Haiku = 500k tokens/mois, Sonnet = 100k tokens/mois
├─ Concurrent users: 5
├─ Chat conversations: 500/mois
├─ Benchmark: Accès données publiques
└─ Rétention données: 365 jours

Cas d'usage: Agences (20-50 clients), startups B2B
```

### Agency (399€/mois)

```
Prix: 399€/mois
Trial: 14 jours (pas de CB requis)
Renouvellement: Mensuel auto

Limites:
├─ Workspaces: Illimité
├─ Connecteurs par workspace: Tous (50+)
├─ Insights IA: Illimité
├─ Rapports auto: Oui (illimité)
├─ White-label: Complet (domaine custom, branding complet, template PDF custom)
├─ Stockage fichiers: 500 MB
├─ Utilisateurs par workspace: Illimité
├─ API calls IA: Illimité
├─ Concurrent users: 10
├─ Chat conversations: Illimité
├─ Benchmark: Accès données publiques + roadmap données propriétaires
├─ Sub-billing: Oui (agence peut facturer clients en son nom)
└─ Rétention données: Illimité

Cas d'usage: Grandes agences (100+ clients), networks
```

---

## 2. Quotas Détaillés

### Par Feature

| Feature | Free | Starter | Pro | Agency |
|---------|------|---------|-----|--------|
| Workspaces | 1 | 5 | 20 | ∞ |
| Connecteurs API actifs | 1 | 3 | ∞ | ∞ |
| Insights/mois | 20 | 100 | 500 | ∞ |
| Rapports auto/mois | 0 | 5 | 20 | ∞ |
| Stockage fichiers (MB) | 0 | 5 | 50 | 500 |
| Utilisateurs workspace | 1 | 2 | 5 | ∞ |
| Chat messages/jour | 5 | 30 | 100 | ∞ |
| Data retention (jours) | 90 | 90 | 365 | ∞ |
| White-label | Non | Partial | Full | Full |

### API Rate Limits (par plan)

```javascript
const RATE_LIMITS = {
  'free': {
    requests_per_minute: 10,
    requests_per_hour: 300,
    concurrent_requests: 2,
    monthly_api_calls: 10000
  },
  'starter': {
    requests_per_minute: 30,
    requests_per_hour: 1000,
    concurrent_requests: 5,
    monthly_api_calls: 100000
  },
  'pro': {
    requests_per_minute: 100,
    requests_per_hour: 5000,
    concurrent_requests: 10,
    monthly_api_calls: 500000
  },
  'agency': {
    requests_per_minute: 500,
    requests_per_hour: 30000,
    concurrent_requests: 50,
    monthly_api_calls: 'unlimited'
  }
}
```

### Storage Quotas (fichiers)

```javascript
const STORAGE_QUOTAS = {
  'free': {
    total_kb: 0,
    per_file_kb: 0,
    max_files: 0
  },
  'starter': {
    total_kb: 5 * 1024,        // 5 MB
    per_file_kb: 2 * 1024,     // 2 MB
    max_files: 3
  },
  'pro': {
    total_kb: 50 * 1024,       // 50 MB
    per_file_kb: 10 * 1024,    // 10 MB
    max_files: 10
  },
  'agency': {
    total_kb: 500 * 1024,      // 500 MB
    per_file_kb: 100 * 1024,   // 100 MB
    max_files: 50
  }
}
```

### IA Quota (tokens/mois)

```javascript
const IA_QUOTAS = {
  'free': {
    haiku_tokens: 0,
    sonnet_tokens: 0
  },
  'starter': {
    haiku_tokens: 50000,   // ~100 insights auto
    sonnet_tokens: 10000   // ~10 chats
  },
  'pro': {
    haiku_tokens: 500000,  // ~1000 insights
    sonnet_tokens: 100000  // ~100 chats
  },
  'agency': {
    haiku_tokens: null,    // Illimité
    sonnet_tokens: null
  }
}
```

---

## 3. Stripe Configuration

### Price IDs (Production)

```
Free:      N/A (no Stripe product)
Starter:   price_1Aq...XXXXX
Pro:       price_1Aq...YYYYY
Agency:    price_1Aq...ZZZZZ
```

### Stripe Metadata

```javascript
// Per subscription
{
  "plan": "pro",
  "workspace_limit": "20",
  "storage_quota_kb": "51200",
  "auto_reports_max": "20",
  "white_label": "full",
  "custom_domain": true
}
```

---

## 4. Quota Enforcement (Backend)

```javascript
// Check quota before action
async function checkQuota(workspace_id, action, quantity = 1) {
  const subscription = await getSubscription(workspace_id)
  const plan = subscription.plan
  const quota = QUOTAS[plan]
  
  switch (action) {
    case 'add_workspace':
      const workspaceCount = await countWorkspaces(organization_id)
      if (workspaceCount >= quota.workspaces) {
        throw new Error(`Workspace limit (${quota.workspaces}) reached for plan ${plan}`)
      }
      break
      
    case 'add_connector':
      const connectorCount = await countConnectors(workspace_id)
      if (connectorCount >= quota.connectors_per_workspace) {
        throw new Error(`Connector limit reached`)
      }
      break
      
    case 'upload_file':
      const storageUsed = await getStorageUsed(workspace_id)
      if (storageUsed + quantity > quota.storage_kb * 1024) {
        throw new Error(`Storage quota exceeded (${quota.storage_kb} MB)`)
      }
      break
      
    case 'generate_insight':
      const insightsThisMonth = await countInsights(workspace_id, 'this_month')
      if (insightsThisMonth >= quota.insights_per_month) {
        throw new Error(`Insights quota (${quota.insights_per_month}) exceeded`)
      }
      break
      
    case 'api_call':
      const callsThisHour = await countAPICalls(workspace_id, 'this_hour')
      if (callsThisHour >= quota.requests_per_hour) {
        throw new Error(`Rate limit (${quota.requests_per_hour}/hour) exceeded`)
      }
      break
  }
}

// Usage: Before any action
await checkQuota(workspace_id, 'add_connector')
// ... proceed if no error
```

---

## 5. Billing Events (Webhooks Stripe)

```javascript
// Handle Stripe webhooks

async function handleStripeWebhook(event) {
  switch (event.type) {
    case 'customer.subscription.created':
      // New subscription
      const subscription = event.data.object
      await db.subscriptions.insert({
        organization_id: getOrgFromCustomer(subscription.customer),
        stripe_subscription_id: subscription.id,
        plan: getPlanFromPriceId(subscription.items[0].price.id),
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end
      })
      // Send welcome email
      await sendEmail('subscription_created', organization_id)
      break
      
    case 'customer.subscription.updated':
      // Upgrade/downgrade
      const oldPlan = await getSubscriptionPlan(subscription.id)
      const newPlan = getPlanFromPriceId(subscription.items[0].price.id)
      
      if (oldPlan !== newPlan) {
        await logAudit(organization_id, 'plan_changed', { oldPlan, newPlan })
        await sendEmail('plan_changed', organization_id, { oldPlan, newPlan })
      }
      
      // Update subscription record
      await db.subscriptions.update(subscription.id, {
        plan: newPlan,
        current_period_end: subscription.current_period_end
      })
      break
      
    case 'customer.subscription.deleted':
      // Cancellation
      await db.subscriptions.update(subscription.id, {
        status: 'canceled',
        canceled_at: new Date()
      })
      // Downgrade to Free plan
      await setWorkspacePlan(organization_id, 'free')
      // Notify user
      await sendEmail('subscription_canceled', organization_id)
      break
      
    case 'invoice.payment_failed':
      // Payment retry
      await sendEmail('payment_failed', organization_id, {
        invoice_url: event.data.object.hosted_invoice_url
      })
      break
  }
}
```

---

## 6. Monitoring & Alerts

```javascript
// Track costs & usage

async function logUsage(workspace_id, metric, quantity) {
  await db.usage_logs.insert({
    workspace_id,
    metric, // 'api_call', 'insight_generated', 'file_uploaded', 'chat_message'
    quantity,
    timestamp: new Date()
  })
}

// Daily cost estimation
async function estimateMonthlyCost(organization_id) {
  const subscription = await getSubscription(organization_id)
  const baseCost = PRICING[subscription.plan]
  
  // Overage costs (if any)
  const overages = await calculateOverages(organization_id)
  
  return baseCost + overages
}

// Alert if usage > 80% of quota
async function checkUsageWarnings(workspace_id) {
  const quota = await getQuota(workspace_id)
  const usage = await getUsage(workspace_id)
  
  if (usage.storage_kb / quota.storage_kb > 0.8) {
    await sendEmail('storage_warning', workspace_id)
  }
  
  if (usage.insights_this_month / quota.insights_per_month > 0.8) {
    await sendEmail('insights_quota_warning', workspace_id)
  }
}
```

---

## 7. Downgrade & Read-Only Mode

```
If subscription expires or is canceled:

Day 0-7: Grace period
├─ Plan set to 'free'
├─ Workspaces > 1 become read-only
├─ Email: "Subscription expired"

Day 8-30: Read-only access
├─ Can view all data
├─ Cannot create/modify/delete
├─ Can download existing reports
├─ Data not deleted

Day 31+: Data deletion
├─ Workspaces > 1 deleted (data lost)
├─ Connectors disconnected
├─ Emails: "Your workspace will be deleted in 7 days"

Reactivation:
├─ User re-subscribes → data restored
├─ All history available
```

---

## 8. Checklist Stripe Setup

- [ ] 4 Price IDs created in Stripe (Free, Starter, Pro, Agency)
- [ ] Webhook endpoint configured (https://app/webhooks/stripe)
- [ ] Webhook signing secret in .env
- [ ] Test mode used for development
- [ ] Live keys in production .env
- [ ] Quota enforcement in all critical endpoints
- [ ] Usage logging implemented
- [ ] Overage emails set up
- [ ] Downgrade logic tested
- [ ] Trial period (14 days) configured

---

*Dernière mise à jour : Mai 2025*
