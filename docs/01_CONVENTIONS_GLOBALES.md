# 01_CONVENTIONS_GLOBALES.md

## Vue d'ensemble

Ce document établit les **règles immuables** pour tout développement sur SmartAnalyst. Pas d'exceptions. Tous les modules backend, frontend, et base de données suivent ces conventions. C'est ce qui garantit que le code reste lisible, maintenable, et que n'importe quel LLM peut continuer d'où un autre a arrêté.

**Pour qui :** Tous les développeurs (humains, LLM, bots).

**À lire avant :** 00_BRIEF_EXECUTIF.md.

---

## 1. Nommage (fichiers, dossiers, variables, classes)

### 1.1 Fichiers

```
Kebab-case (tout minuscule, tirets)

✅ CORRECT:
- ga4.connector.js
- monthly-reports.job.js
- health-score.service.js
- workspace-members.controller.js
- canonical-metrics.layer.js

❌ INCORRECT:
- GA4Connector.js (PascalCase)
- monthlyReports.js (camelCase)
- monthly_reports (snake_case)
```

### 1.2 Dossiers

```
Kebab-case (tout minuscule, tirets)

✅ CORRECT:
src/
├─ connectors/
├─ services/
│  ├─ auth/
│  ├─ ai/
│  ├─ billing/
│  └─ pdf-generation/
├─ routes/
├─ lib/
├─ queue-jobs/
└─ templates/

❌ INCORRECT:
- Services/ (PascalCase)
- connectors_v2 (snake_case)
```

### 1.3 Classes & Types

```
PascalCase (première lettre majuscule)

✅ CORRECT:
class GA4Connector extends BaseConnector { }
class HealthScoreService { }
class DataSyncJob { }
class CanonicalMetricsLayer { }
class WorkspaceMember { }

❌ INCORRECT:
class ga4Connector { }
class health_score_service { }
```

### 1.4 Variables & Fonctions

```
camelCase (première lettre minuscule)

✅ CORRECT:
const workspaceId = '...'
const connectorStatus = 'active'
function fetchDataFromGA4() { }
function normalizeMetrics() { }
const alertThreshold = 0.25

❌ INCORRECT:
const workspace_id = '...'
const WorkspaceId = '...'
function FetchDataFromGA4() { }
```

### 1.5 Constantes

```
UPPER_SNAKE_CASE (tout majuscule, underscores)

✅ CORRECT:
const ALERT_THRESHOLDS = { ... }
const PLAN_LIMITS = { ... }
const CANONICAL_METRICS_MAPPING = { ... }
const MAX_RETRY_ATTEMPTS = 3
const REDIS_CACHE_TTL = 3600

❌ INCORRECT:
const alert_thresholds = { } (snake_case)
const AlertThresholds = { } (PascalCase)
```

### 1.6 Tables de base de données

```
snake_case (tout minuscule, underscores)

✅ CORRECT:
organizations
workspaces
workspace_members
connectors
reports
report_data
canonical_metrics
business_profiles
subscriptions

❌ INCORRECT:
Organizations (PascalCase)
WorkspaceMembers
Connectors
```

### 1.7 Colonnes de base de données

```
snake_case

✅ CORRECT:
workspace_id
created_at
last_synced_at
connector_status
is_active
owner_email
connector_status_reason

❌ INCORRECT:
workspaceId (camelCase)
CreatedAt
LastSyncedAt
```

---

## 2. Langue

### 2.1 Code

```
Toujours en ANGLAIS

✅ CORRECT:
function fetchConnectorData(workspaceId, startDate, endDate) {
  // Fetch latest data from connector API
}

class CanonicalMetricsLayer {
  async ingest(rawData, sourceType) {
    // Transform raw data into canonical schema
  }
}

❌ INCORRECT:
function recupererDonneesConnecteur(workspaceId, dateDebut, dateFin) {
  // Recuperer les dernieres donnees de l'API connecteur
}
```

### 2.2 Commentaires & Documentation

```
En FRANÇAIS pour tout ce qui est métier/logique.
En ANGLAIS pour tout ce qui est système.

✅ CORRECT:

// Détecte les anomalies critiques (baisse 80%+ sessions)
if (sessionsDrop > 0.8) {
  alert.level = 'CRITICAL'
  // Sessions may indicate broken tracking (GA4 config issue)
}

// Calcul du score de santé basé sur 4 dimensions
class HealthScoreService {
  // Weight each dimension according to business impact
  async calculate(workspaceId) { ... }
}

❌ INCORRECT:

// Check if sessions are too low
if (sessionsDrop > 0.8) { }

// Calculate health score based on 4 dimensions
class HealthScoreService {
  async calculerScore(workspaceId) { }
}
```

### 2.3 Messages utilisateur

```
Toujours en FRANÇAIS, français naturel.

✅ CORRECT:
"Nous n'avons pas pu analyser automatiquement ton site. Choisis ton secteur ci-dessous."
"Ton ROAS Meta a baissé de 15% cette semaine. Cela peut être dû à une audience fatigue."
"Ton token Google Ads a expiré. Reconnecte-le pour continuer."

❌ INCORRECT:
"We couldn't analyze your site automatically."
"Your Meta ROAS decreased."
"Your Google Ads token expired."
```

### 2.4 Logs (pour développeurs)

```
En ANGLAIS, structuré

✅ CORRECT:
logger.info('Data sync started', { 
  workspaceId, 
  connectorId, 
  source: 'ga4' 
})

logger.error('API call failed', {
  endpoint: 'https://google-ads-api.com/v14/...',
  statusCode: 429,
  message: 'Rate limit exceeded',
  retryAfter: 60
})

❌ INCORRECT:
logger.info('Sync données commencé')
logger.error('Appel API échoué')
```

---

## 3. Gestion des erreurs

### 3.1 Try-Catch obligatoire

```javascript
// ✅ CORRECT: Tout appel API externe dans try-catch

async function fetchGA4Data(accessToken, propertyId) {
  try {
    const response = await googleAnalytics.api.request({
      property: propertyId,
      dateRanges: [{ startDate: '2025-01-01', endDate: '2025-01-31' }],
      metrics: [{ name: 'activeUsers' }]
    })
    
    return response
  } catch (error) {
    logger.error('GA4 API call failed', {
      workspaceId: this.workspaceId,
      propertyId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })
    
    // Graceful degradation: return cached data or empty object
    return { sessions: null, errorType: 'API_FAILURE' }
  }
}

// ❌ INCORRECT: Pas de try-catch, erreur silencieuse

async function fetchGA4Data(accessToken, propertyId) {
  const response = await googleAnalytics.api.request({ ... })
  return response
}
```

### 3.2 Messages d'erreur user-facing

```javascript
// ✅ CORRECT: Clair, actionnable, en français

if (error.code === 'INVALID_CREDENTIALS') {
  throw new UserFacingError(
    'Tes identifiants Google Ads ne sont plus valides. ' +
    'Reconnecte-les dans Paramètres → Sources de données.'
  )
}

if (error.code === 'RATE_LIMIT') {
  throw new UserFacingError(
    'Meta Ads API a atteint sa limite. ' +
    'Nous réessayerons automatiquement dans 1h.'
  )
}

if (error.code === 'DATA_INSUFFICIENT') {
  throw new UserFacingError(
    'Pas encore assez de données pour générer des insights. ' +
    'Reviens demain quand nous aurons 7 jours de données.'
  )
}

// ❌ INCORRECT: Technique, confus, en anglais

if (error.code === 'INVALID_CREDENTIALS') {
  throw new Error('AUTH_FAILED')
}

if (error.code === 'RATE_LIMIT') {
  throw new Error('429 TOO_MANY_REQUESTS')
}
```

### 3.3 Error logging structure

```javascript
// Toujours inclure le contexte complet

logger.error('Connector sync failed', {
  // Context
  workspaceId: workspace.id,
  connectorId: connector.id,
  userId: user.id,
  
  // Operation
  operation: 'fetchConnectorData',
  source: 'meta_ads',
  
  // Timing
  startTime: new Date(startTs),
  endTime: new Date(),
  durationMs: Date.now() - startTs,
  
  // Error details
  errorCode: error.code,
  errorMessage: error.message,
  errorStack: error.stack,
  statusCode: error.statusCode,
  
  // Recovery
  willRetry: true,
  retryAttempt: 2,
  nextRetryAt: new Date(Date.now() + 60000)
})
```

---

## 4. Variables d'environnement

### 4.1 Format & validation

```bash
# ✅ CORRECT: Claires, groupées par service

# ━━━ Server ━━━
PORT=3000
NODE_ENV=production
APP_URL=https://app.smartanalyst.io
JWT_SECRET=abc123def456...

# ━━━ Supabase ━━━
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# ━━━ Stripe ━━━
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ━━━ Redis (BullMQ + Cache) ━━━
REDIS_URL=redis://localhost:6379

# ━━━ Anthropic ━━━
ANTHROPIC_API_KEY=sk-ant-...
AI_FAST_MODEL=claude-haiku-4-5-20251001
AI_SMART_MODEL=claude-sonnet-4-6

# ━━━ Google (GA4, Google Ads, Search Console) ━━━
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=https://app.smartanalyst.io/auth/oauth/callback?source=google

# ━━━ Meta ━━━
META_APP_ID=123456789
META_APP_SECRET=abc123...
META_REDIRECT_URI=https://app.smartanalyst.io/auth/oauth/callback?source=meta

# ━━━ Resend ━━━
RESEND_API_KEY=re_...
EMAIL_FROM=rapport@smartanalyst.io

# ❌ INCORRECT:
# Valeurs hardcodées dans le code
# Keys mélangées sans groupement
# Noms vagues (API_KEY sans préciser lequel)
```

### 4.2 Validation au startup

```javascript
// src/lib/env-validator.js

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'JWT_SECRET',
  'ANTHROPIC_API_KEY',
  'REDIS_URL',
  'STRIPE_SECRET_KEY',
]

function validateEnv() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v])
  
  if (missing.length > 0) {
    throw new Error(`
      Missing required environment variables:
      ${missing.join(', ')}
      
      Please check your .env file and ensure all variables are set.
    `)
  }
  
  console.log('✅ All environment variables validated')
}

// app.js startup
app.listen(process.env.PORT, () => {
  validateEnv()
  console.log(`Server running on port ${process.env.PORT}`)
})
```

---

## 5. Timezone (CRITIQUE pour data correctness)

### 5.1 Storage en base

```
Toutes les timestamps en UTC dans Supabase.

created_at TIMESTAMPTZ DEFAULT NOW() -- UTC (0:00)
synced_at TIMESTAMPTZ DEFAULT NOW() -- UTC
report_generated_at TIMESTAMPTZ -- UTC

Jamais de dates sans timezone.
```

### 5.2 Workspace timezone

```sql
-- Chaque workspace a son fuseau horaire local

workspaces:
├─ id
├─ name
├─ timezone TEXT DEFAULT 'Europe/Paris'  -- IANA timezone
├─ created_at TIMESTAMPTZ -- UTC in DB
```

### 5.3 Conversion & affichage

```javascript
// Backend: toujours lire la timezone du workspace
const workspace = await db.workspaces.get(workspaceId)
const tz = workspace.timezone // ex: 'Europe/Paris'

// Convertir pour affichage frontend
const date = new Date('2025-05-15T14:30:00Z') // UTC
const formatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})
console.log(formatter.format(date)) // "15/05/2025 16:30" (Paris time)

// Frontend: les API retournent toujours avec timezone info
{
  workspaceId: '...',
  timezone: 'Europe/Paris',
  reportDate: '2025-05-15T14:30:00+02:00', // ISO 8601 with offset
  localTime: '2025-05-15 16:30' // Pre-formatted
}
```

### 5.4 Règles de reporting

```
"Journée" = minuit à minuit DANS LE TIMEZONE DU WORKSPACE

Exemple:
- Workspace timezone: Europe/Paris (UTC+2 en été)
- Report "journée du 15 mai" = 15 mai 00:00 PARIS à 15 mai 23:59:59 PARIS
- En UTC = 14 mai 22:00 UTC à 15 mai 21:59:59 UTC

Scheduler job (Monday 8am) → déclenché à 8am dans le timezone du workspace
```

### 5.5 Attribution & data consistency

```
Règle stricte: Chaque donnée sourcée d'une API reste dans son
fuseau horaire d'attribution jusqu'à normalisation.

Meta Ads: Fuseau du compte publicitaire (ex: America/New_York)
GA4: UTC (par défaut)
Stripe: UTC
Search Console: Fuseau du property

La couche Canonical Metrics réaligne tout en UTC,
mais conserve le "timezone_source" pour traçabilité.

canonical_metrics:
├─ workspace_id
├─ metric_key
├─ metric_value
├─ source_timezone ('America/New_York') -- pour audit
├─ recorded_at TIMESTAMPTZ (UTC)
```

---

## 6. Canonical Metrics (architecture de données universelle)

### 6.1 Règle d'or

```
L'IA parle TOUJOURS à canonical_metrics.
Jamais aux données brutes des connecteurs.
```

### 6.2 Exemples de mapping

```javascript
// Meta Ads raw data → Canonical
meta_ads.spend → canonical: spend_paid_social
meta_ads.impressions → canonical: impressions_paid_social
meta_ads.clicks → canonical: clicks_paid_social
meta_ads.cpc → canonical: cost_per_click_paid
meta_ads.cpm → canonical: cost_per_mille_paid
meta_ads.roas → canonical: return_on_investment_paid
meta_ads.cpa → canonical: cost_per_acquisition_paid

// GA4 raw data → Canonical
ga4.sessions → canonical: sessions_all
ga4.new_users → canonical: users_new
ga4.conversions → canonical: conversions_total
ga4.conversion_value → canonical: revenue_from_conversions
ga4.bounce_rate → canonical: bounce_rate_all
ga4.pages_per_session → canonical: engagement_depth

// Stripe raw data → Canonical
stripe.mrr → canonical: revenue_recurring_monthly
stripe.arr → canonical: revenue_annual_recurring
stripe.churn_rate → canonical: churn_rate_subscription
stripe.ltv → canonical: lifetime_value_customer
stripe.failed_payments → canonical: failed_payments_month

// Computed/Derived → Canonical
roi = revenue_from_conversions / spend_paid_social
  → canonical: return_on_investment_total
engagement_score = (sessions * depth) / bounce_rate
  → canonical: engagement_score
```

### 6.3 Structure table canonical_metrics

```sql
canonical_metrics:
├─ id UUID PRIMARY KEY
├─ workspace_id UUID NOT NULL (RLS key)
├─ date DATE NOT NULL
├─ metric_key TEXT NOT NULL -- 'spend_paid_social', 'sessions_all', etc.
├─ metric_value NUMERIC NOT NULL -- Float
├─ source TEXT NOT NULL -- 'ga4', 'meta_ads', 'stripe', 'computed'
├─ confidence_score INT DEFAULT 100 -- 0-100 (noisy data = lower)
├─ timezone_source TEXT -- 'Europe/Paris' (for audit)
├─ recorded_at TIMESTAMPTZ DEFAULT NOW() -- UTC
├─ UNIQUE(workspace_id, date, metric_key, source)
└─ INDEX on (workspace_id, date)
```

---

## 7. Structure dossiers

```
smartanalyst/
├── src/
│   ├── connectors/
│   │   ├── base.connector.js
│   │   ├── ga4.connector.js
│   │   ├── meta-ads.connector.js
│   │   ├── google-ads.connector.js
│   │   ├── stripe.connector.js
│   │   ├── search-console.connector.js
│   │   └── index.js (export all)
│   │
│   ├── services/
│   │   ├── auth/
│   │   │   ├── auth.service.js
│   │   │   ├── jwt.utils.js
│   │   │   └── oauth.handler.js
│   │   │
│   │   ├── ai/
│   │   │   ├── insights.service.js
│   │   │   ├── chat.service.js
│   │   │   └── anomaly-detection.service.js
│   │   │
│   │   ├── metrics/
│   │   │   ├── canonical-metrics.layer.js
│   │   │   └── health-score.service.js
│   │   │
│   │   ├── pdf/
│   │   │   ├── pdf-generator.service.js
│   │   │   └── report-templates.js
│   │   │
│   │   ├── email/
│   │   │   └── email.service.js
│   │   │
│   │   └── billing/
│   │       └── stripe.service.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── onboarding.routes.js
│   │   ├── connectors.routes.js
│   │   ├── chat.routes.js
│   │   ├── reports.routes.js
│   │   └── index.js
│   │
│   ├── queue-jobs/
│   │   ├── sync-data.job.js
│   │   ├── token-refresh.job.js
│   │   ├── insights-generation.job.js
│   │   ├── monthly-reports.job.js
│   │   ├── alert-check.job.js
│   │   ├── weekly-email.job.js
│   │   ├── retry-failed.job.js
│   │   └── index.js
│   │
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── redis.js
│   │   ├── stripe.js
│   │   ├── anthropic.js
│   │   ├── playwright.js
│   │   ├── logger.js
│   │   ├── env-validator.js
│   │   └── error-handler.js
│   │
│   ├── templates/
│   │   ├── report.html (Handlebars)
│   │   └── emails/
│   │       ├── onboarding.html
│   │       ├── weekly-insights.html
│   │       └── monthly-report.html
│   │
│   ├── middleware/
│   │   ├── jwt.middleware.js
│   │   ├── error-handler.middleware.js
│   │   └── workspace-scope.middleware.js
│   │
│   ├── app.js (Express setup)
│   └── server.js (entry point)
│
├── supabase/
│   └── migrations/
│       ├── 001_init_base_schema.sql
│       ├── 002_add_workspaces.sql
│       ├── 003_add_canonical_metrics.sql
│       ├── 004_add_rls_policies.sql
│       └── [...]
│
├── frontend/
│   ├── dashboard.html
│   ├── chat.html
│   ├── onboarding.html
│   ├── css/
│   │   ├── main.css
│   │   └── components.css
│   └── js/
│       ├── app.js
│       ├── dashboard.js
│       ├── chat.js
│       └── supabase-client.js
│
├── package.json
├── ecosystem.config.js (PM2)
├── .env.example
├── .gitignore
└── README.md
```

---

## 8. Glossaire métier

| Terme | Définition |
|---|---|
| **workspace_id** | UUID unique d'un "espace" (client agence ou startup). Multi-tenant key. |
| **organization_id** | UUID unique d'une agence ou entreprise. Agence peut avoir N workspaces. |
| **connector** | Source de données connectée (GA4, Meta, Google Ads, Stripe, etc.). |
| **canonical_metrics** | Schéma universel pour toutes les métriques (indépendant du connecteur). |
| **insight** | Analyse IA = fait chiffré + contexte + recommandation. |
| **health_score** | Score 0-100 synthétique de la performance marketing (maj 1×/semaine). |
| **white-label** | Rapport customisé avec logo/couleurs/footer de l'agence/client. |
| **auto_send** | Rapport généré et envoyé automatiquement le 1er du mois (configurable). |
| **anomaly_detection** | Détection de données cassées (tracking broken, etc.) vs vrais problèmes. |
| **graceful degradation** | Afficher données stale + badge transparent plutôt que rien. |
| **rate_limit** | Limite d'appels API (ex: Google = 10k/jour). Géré via queue system. |
| **service_role** | Clé Supabase qui bypass RLS (backend only, jamais frontend). |
| **canonical_metric** | Une mérique unique dans le schéma universel (ex: 'spend_paid_social'). |
| **timezone** | Fuseau horaire du workspace (ex: 'Europe/Paris'). Détermine la "journée" de reporting. |
| **BullMQ** | Système de file d'attente (Redis-backed) pour jobs asynchrones + retries. |
| **feature_flag** | Toggle pour activer/désactiver une feature sans deploy. |

---

## 9. Code Quality Rules

### 9.1 Longueur de fichier

```
Max 500 lignes par fichier.
Si > 500 lignes → refactoriser en modules plus petits.
```

### 9.2 Longueur de fonction

```
Max 50 lignes par fonction.
Si > 50 lignes → extraire la logique.
```

### 9.3 Imports

```javascript
// ✅ CORRECT: Groupés et triés

// External
const express = require('express')
const { createClient } = require('@supabase/supabase-js')

// Internal services
const { GA4Connector } = require('../connectors/ga4.connector')
const { HealthScoreService } = require('../services/metrics/health-score.service')

// Lib
const { logger } = require('../lib/logger')
const { createSupabaseClient } = require('../lib/supabase')

// ❌ INCORRECT: Mélangés et désorganisés

const { createClient } = require('@supabase/supabase-js')
const { logger } = require('../lib/logger')
const express = require('express')
const { GA4Connector } = require('../connectors/ga4.connector')
```

### 9.4 Async/Await obligatoire (pas de callbacks)

```javascript
// ✅ CORRECT

async function fetchAndProcessData(workspaceId) {
  try {
    const data = await connector.fetchData()
    const normalized = await service.normalizeData(data)
    return normalized
  } catch (error) {
    logger.error('Processing failed', { workspaceId, error })
    throw error
  }
}

// ❌ INCORRECT (callbacks)

function fetchAndProcessData(workspaceId, callback) {
  connector.fetchData((err, data) => {
    if (err) return callback(err)
    
    service.normalizeData(data, (err, normalized) => {
      if (err) return callback(err)
      callback(null, normalized)
    })
  })
}
```

---

## 10. Testing & Validation

### 10.1 Mental model testing

Avant de livrer du code, valider mentalement :

1. **Happy path :** Fonctionne-t-il si tout est OK ?
2. **Error path :** Fonctionne-t-il si l'API externe fail ?
3. **Edge case :** Fonctionne-t-il avec 0 données ? Avec 1M données ?
4. **Timezone :** Les dates restent-elles cohérentes si le workspace est en Tokyo ?
5. **Multi-tenant :** Impossible pour un utilisateur de voir les données d'un autre workspace ?
6. **Quota :** Les limites de plan sont-elles respectées (nombre de connecteurs, appels IA) ?

### 10.2 Logging checklist

Avant merge, vérifier que chaque point d'erreur possible est loggé :
```
- API call failure → log error + context
- Job failure → log error + retry count
- Data validation failure → log what was invalid
- Rate limit hit → log retry strategy
- Auth failure → log attempt (sans credentials)
```

---

## Prochaine étape

Lire **02_BONNES_PRATIQUES_TRANSVERSALES.md** (RGPD, sécurité, monitoring).

---

*Dernière mise à jour : Mai 2025*
*Validé par : Équipe Tech*
