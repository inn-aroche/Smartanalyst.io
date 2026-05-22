# 02_BONNES_PRATIQUES_TRANSVERSALES.md

## Vue d'ensemble

Ce document établit les **standards de qualité transversaux** applicables à tous les modules : RGPD, sécurité, performance, accessibilité, et observabilité. Ces bonnes pratiques ne sont pas optionnelles — elles sont requises pour tout code livré.

**Pour qui :** Tous les développeurs, DevOps, Product.

**À lire avant :** 00_BRIEF_EXECUTIF.md, 01_CONVENTIONS_GLOBALES.md.

---

## 1. RGPD & Conformité légale

### 1.1 Consentement utilisateur

```
Règle: "Consent by default, not by silence"

À l'inscription:
1. Affiche clairement: "Nous collectons ton email pour..."
2. Checkbox consentement (DÉCOCHÉE par défaut)
3. User doit cocher explicitement
4. Log l'action avec timestamp

Stockage:
consent_log:
├─ user_id
├─ consent_type ('email_marketing', 'analytics', 'data_processing')
├─ status ('accepted' | 'rejected')
├─ timestamp
├─ ip_address
└─ user_agent
```

### 1.2 Droit à l'oubli (Right to be forgotten)

```
Si utilisateur demande suppression:

1. Soft delete (logical delete, pas physique):
   users.deleted_at = NOW()
   users.email_hashed = HASH(email + random_salt)
   
2. Anonymise les données personnelles:
   → Remplacer email par "deleted_user_[id]"
   → Remplacer workspace_name par "Workspace_[id]"
   → Supprimer adresse IP, user_agent

3. Keep les données analytiques:
   → Garder report_data (anonymisé)
   → Garder metrics (sans identifiant user)
   
4. Log l'action:
   audit_log:
   ├─ action: 'user_deletion_requested'
   ├─ user_id
   ├─ timestamp
   └─ ip_address

5. Timeline: Complété dans 30 jours max
```

### 1.3 Audit trail (Traçabilité)

```
Chaque action sensible doit être loggée:

- Login/logout
- Connector connect/disconnect
- Report generation
- Data export
- API call (per API key)
- Workspace member invite/remove
- Billing change

audit_log:
├─ id UUID
├─ workspace_id
├─ user_id
├─ action TEXT ('login', 'connector_added', 'report_sent')
├─ resource_type TEXT ('connector', 'report', 'workspace_member')
├─ resource_id UUID
├─ changes JSONB -- {before: {...}, after: {...}}
├─ ip_address INET
├─ user_agent TEXT
├─ timestamp TIMESTAMPTZ DEFAULT NOW()
```

### 1.4 Data residency

```
Règle: Données EU users restent en EU.

Supabase:
- Région: eu-west-1 (Ireland)
- Backups: eu-west-1
- Aucune réplication US

Stripe:
- EU customers → données traitées EU
- Certifié SOC 2 & GDPR

Anthropic API:
- Logs des requêtes: 30j de rétention
- Pas de fine-tuning (données pas réutilisées)
```

### 1.5 Data Processing Agreement (DPA)

```
Pour clients B2B (agences):

DPA à signer avant Go-live:
- Clarify: "SmartAnalyst = Data Processor, Agence = Controller"
- Sub-processors: Supabase, Stripe, Anthropic, Resend
- Standard contractual clauses (SCCs)
- Right to audit
- Data breach notification (72h)

Template disponible dans /legal/dpa-template.pdf
```

---

## 2. Sécurité

### 2.1 API Keys & Secrets

```javascript
// ✅ CORRECT: Chiffré en Supabase Vault

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY)

// Stocker un token OAuth:
await supabase
  .from('connectors')
  .insert({
    workspace_id: workspaceId,
    source: 'ga4',
    access_token: supabase.rpc('vault_encrypt_secret', {
      secret: accessToken,
      key_id: 'ga4-tokens'
    }),
    refresh_token: supabase.rpc('vault_encrypt_secret', {
      secret: refreshToken,
      key_id: 'ga4-tokens'
    })
  })

// Récupérer un token:
const encrypted = await supabase
  .from('connectors')
  .select('access_token')
  .eq('id', connectorId)
  .single()

const decrypted = await supabase.rpc('vault_decrypt_secret', {
  secret: encrypted.access_token
})

// ❌ INCORRECT: Secrets en clair en base

INSERT INTO connectors (access_token) VALUES ('ya29.a0AfH6SMBx...')
```

### 2.2 JWT & Token handling

```javascript
// ✅ CORRECT: JWT avec expiration courte + refresh token

const jwt = require('jsonwebtoken')

function generateJWT(userId, workspaceId) {
  const token = jwt.sign(
    {
      sub: userId,        // subject (user id)
      workspace_id: workspaceId,
      type: 'access'
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }  // Short lifetime
  )
  
  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
  
  return { accessToken: token, refreshToken }
}

// Middleware: Vérifier token
function jwtMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// ❌ INCORRECT: Long expiration, no refresh

jwt.sign({ userId }, secret, { expiresIn: '365d' })
```

### 2.3 Rate limiting (API abuse prevention)

```javascript
const rateLimit = require('express-rate-limit')

// Limite générale
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests
  message: 'Trop de requêtes. Réessaye dans quelques minutes.'
})

app.use('/api/', limiter)

// Limite stricte pour auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentatives de login
  skipSuccessfulRequests: true, // Reset counter si success
  message: 'Trop de tentatives. Réessaye dans 15 minutes.'
})

app.post('/auth/login', authLimiter, loginHandler)

// Limite par user (une fois authentifié)
const userLimiter = rateLimit({
  keyGenerator: (req) => req.user.id, // Par user, pas par IP
  windowMs: 60 * 1000,
  max: 30 // 30 appels chat par minute
})

app.post('/chat', jwtMiddleware, userLimiter, chatHandler)
```

### 2.4 CORS & HTTPS

```javascript
// ✅ CORRECT: CORS restrictif

const cors = require('cors')

app.use(cors({
  origin: process.env.APP_URL, // Seulement app.smartanalyst.io
  credentials: true,            // Cookies allowed
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// ✅ HTTPS obligatoire en production

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`)
    }
    next()
  })
}

// ❌ INCORRECT: CORS ouvert à tout

app.use(cors({ origin: '*' }))
```

### 2.5 SQL Injection prevention

```javascript
// ✅ CORRECT: Prepared statements avec Supabase

const { data, error } = await supabase
  .from('reports')
  .select('*')
  .eq('workspace_id', workspaceId)  // Parameterized
  .eq('period_start', startDate)     // Safe
  .order('created_at', { ascending: false })

// ✅ CORRECT: Parameterized queries si SQL brut

const { rows } = await pool.query(
  'SELECT * FROM reports WHERE workspace_id = $1 AND period_start = $2',
  [workspaceId, startDate]  // Parameters, not string concatenation
)

// ❌ INCORRECT: String concatenation

const query = `SELECT * FROM reports WHERE workspace_id = '${workspaceId}'`
// Attaquant envoie: workspace_id = "' OR '1'='1"
// Requête devient: WHERE workspace_id = '' OR '1'='1'
```

### 2.6 Input validation & sanitization

```javascript
// ✅ CORRECT: Valider tout input utilisateur

const { body, validationResult } = require('express-validator')

app.post('/chat', [
  // Validation
  body('message')
    .trim()
    .notEmpty().withMessage('Message vide')
    .isLength({ max: 500 }).withMessage('Max 500 caractères')
    .escape(), // Sanitize HTML chars
  
  body('workspace_id')
    .isUUID().withMessage('Invalid workspace_id')
], (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  
  // Traitement sécurisé
})

// ❌ INCORRECT: Pas de validation

app.post('/chat', (req, res) => {
  const { message } = req.body
  // Utiliser directement sans vérifier
  aiService.chat(message) // Peut être XSS, SQL injection, etc.
})
```

---

## 3. Performance & Lighthouse

### 3.1 Core Web Vitals targets

```
LCP (Largest Contentful Paint):  < 2.5s
FID (First Input Delay):         < 100ms
CLS (Cumulative Layout Shift):   < 0.1

Frontend target: Lighthouse score > 90 (tous les pages)
Backend target: API latency p95 < 500ms
```

### 3.2 Caching strategy

```
Redis Layer 2 (in addition to DB query caching):

TTL short (data freshness priority):
- health_score_{workspace_id}: 5 min
- kpis_{workspace_id}: 1 hour
- insights_{workspace_id}: 24 hours
- normalized_data_{connector_id}: 6 hours

Cache invalidation:
- Explicit: When connector sync completes → DELETE keys
- NOT time-based TTL cleanup
```

### 3.3 Database query optimization

```sql
-- ✅ CORRECT: Index sur workspace_id + date range queries

CREATE INDEX idx_canonical_metrics_workspace_date
  ON canonical_metrics(workspace_id, date DESC)

CREATE INDEX idx_connectors_workspace_status
  ON connectors(workspace_id, status)

-- ✅ CORRECT: Limit + offset for pagination

SELECT * FROM reports
WHERE workspace_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET 0

-- ❌ INCORRECT: Full table scan

SELECT * FROM canonical_metrics
WHERE metric_value > 100
-- No workspace_id filter → scans entire table
```

### 3.4 Image optimization

```html
<!-- ✅ CORRECT: Responsive images + lazy loading -->

<img 
  src="logo-light.svg"
  alt="SmartAnalyst logo"
  width="200"
  height="50"
  loading="lazy"
  decoding="async"
/>

<!-- ✅ CORRECT: WebP avec fallback -->

<picture>
  <source srcset="chart.webp" type="image/webp">
  <source srcset="chart.png" type="image/png">
  <img src="chart.png" alt="Monthly chart">
</picture>

<!-- ❌ INCORRECT: No optimization -->

<img src="banner-5mb.jpg">
```

### 3.5 Frontend bundling

```javascript
// ✅ CORRECT: Vanilla JS, no bundler needed
// Small: ~10KB gzipped total

// ❌ INCORRECT: React/Vue
// React: ~150KB
// Vue: ~100KB
// Too much for our use case
```

---

## 4. Accessibilité (WCAG 2.1 AA)

### 4.1 Keyboard navigation

```html
<!-- ✅ CORRECT: Tous les éléments interactifs accessibles au clavier -->

<button tabindex="0">Generate Report</button>
<a href="#main">Skip to content</a>

<!-- Tab order logique -->
<form>
  <input type="email" name="email" tabindex="1">
  <input type="password" name="password" tabindex="2">
  <button type="submit" tabindex="3">Login</button>
</form>

<!-- Escape ferme les modales -->
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.open) {
    modal.close()
  }
})

<!-- ❌ INCORRECT: No keyboard support -->

<div onclick="submitForm()">Submit</div> <!-- pas focusable -->
```

### 4.2 Screen reader support (ARIA)

```html
<!-- ✅ CORRECT: ARIA labels pour screen readers -->

<nav aria-label="Main navigation">
  <ul role="menubar">
    <li><a href="/dashboard">Dashboard</a></li>
  </ul>
</nav>

<form aria-labelledby="form-title">
  <h2 id="form-title">Add Connector</h2>
  
  <label for="source">Data source</label>
  <select id="source" aria-required="true">
    <option>GA4</option>
  </select>
</form>

<div role="alert" aria-live="polite">
  ✅ Connector connected successfully
</div>

<!-- Heading hierarchy (h1 → h2 → h3, jamais sauter) -->

<h1>Dashboard</h1>
<h2>Score de santé</h2>
<h3>Paid performance</h3>

<!-- ❌ INCORRECT: Missing labels -->

<input type="email"> <!-- No label! Screen readers lost -->
<div onclick="delete()">❌</div> <!-- No aria-label -->
```

### 4.3 Color contrast (WCAG AA minimum)

```css
/* ✅ CORRECT: Contrast ratio 4.5:1 (AA) or 7:1 (AAA) */

/* Text color: #333 on white (#fff) → contrast 12.6:1 ✅ */
body {
  color: #333;
  background: #fff;
}

/* Alert red: #d32f2f on white → contrast 5.5:1 ✅ */
.alert-red {
  color: #d32f2f;
}

/* ❌ INCORRECT: Low contrast */

/* Gray text: #999 on white → contrast 2.3:1 ❌ */
.light-text {
  color: #999;
}

/* Blue link: #6366f1 on white → contrast 3.2:1 ❌ */
a {
  color: #6366f1;
}
```

Use tools: WebAIM Contrast Checker, Axe DevTools

### 4.4 Resizable text & zoom

```css
/* ✅ CORRECT: rem units (responsive), not px */

html {
  font-size: 16px; /* = 1rem */
}

body {
  font-size: 1rem; /* 16px */
  line-height: 1.5;
}

h1 {
  font-size: 2.5rem; /* 40px */
}

button {
  padding: 0.75rem 1rem; /* Grows if user zooms */
}

/* ❌ INCORRECT: Fixed px, doesn't scale */

body {
  font-size: 14px;
}

h1 {
  font-size: 32px;
}
```

---

## 5. Monitoring & Observability

### 5.1 Structured logging

```javascript
// ✅ CORRECT: JSON logs, contexte complet

logger.info('Connector sync started', {
  // Meta
  timestamp: new Date().toISOString(),
  level: 'info',
  service: 'data-sync',
  
  // Context
  workspaceId: '123e4567-e89b-12d3-a456-426614174000',
  connectorId: 'ga4-001',
  userId: 'user-456',
  
  // Operation
  operation: 'ga4_sync',
  sourceType: 'ga4',
  
  // Data
  dateRange: {
    start: '2025-05-01',
    end: '2025-05-15'
  }
})

// ❌ INCORRECT: Unstructured, no context

console.log('Sync started')
```

### 5.2 Error tracking & alerts

```javascript
// ✅ CORRECT: Log errors avec full context

logger.error('API call failed', {
  workspaceId,
  operation: 'fetchGA4Data',
  source: 'ga4',
  
  // Error details
  errorCode: error.code,
  errorMessage: error.message,
  statusCode: 429,
  
  // Timing
  durationMs: 5000,
  
  // Recovery
  willRetry: true,
  retryAttempt: 2,
  nextRetryAt: new Date(Date.now() + 60000)
})

// Send to alerting system if critical
if (error.code === 'CRITICAL') {
  await slack.notify({
    channel: '#alerts-smartanalyst',
    text: `🔴 CRITICAL: ${error.message}`,
    attachments: [{
      fields: [
        { title: 'Workspace', value: workspaceId },
        { title: 'Operation', value: 'fetchGA4Data' },
        { title: 'Error', value: error.message }
      ]
    }]
  })
}
```

### 5.3 Metrics & dashboards

```
Key metrics to track (Prometheus-style):

API latency:
- http_request_duration_seconds (by endpoint)
- p50, p95, p99 percentiles

Error rate:
- http_requests_total (by status code)
- connector_sync_errors_total (by source)

System:
- redis_queue_depth (number of jobs pending)
- db_connection_pool_usage
- memory_usage_percent

Cost:
- anthropic_api_calls_total (by model)
- anthropic_tokens_used_total
- stripe_api_calls_total

Business:
- workspaces_active_total
- connectors_connected_total
- reports_generated_total
```

### 5.4 Uptime & SLA monitoring

```
Service health checks:

1. Every 60s: HEAD /<health>
   Response: 200 + JSON { status: 'ok', timestamp }

2. Alert if:
   - Latency > 2s (p95)
   - Error rate > 5%
   - Uptime < 99.5% (month)

3. SLA target: 99.9% uptime (9h downtime/month max)
```

---

## 6. Product Marketing

### 6.1 Tone of voice

```
Règles:
- Français naturel, pas technique (jamais "webhook" sans explication)
- Parle au reader comme un pair, not condescending
- Action-oriented ("Fais X" pas "X pourrait être fait")
- Jargon marketing quand pertinent (ROAS, CAC), mais explique

❌ INCORRECT (trop technique):
"Nos connecteurs utilisent une architecture event-driven avec BullMQ."

✅ CORRECT (accessible):
"Tes données se synchronisent en direct sans que tu aies à faire quoi que ce soit."

❌ INCORRECT (trop "sales"):
"SmartAnalyst révolutionne le reporting grâce à notre AI breakthroughs!"

✅ CORRECT (sincère):
"SmartAnalyst te fournit les analyses en 90 secondes, pas 8 heures par client."
```

### 6.2 Key messaging

```
Trois piliers (toujours):

1. TIME SAVED: "8 heures par mois de reporting = sauvées"
2. INSIGHTS: "Des recommandations concrètes, pas juste des chiffres"
3. SIMPLICITY: "Zéro compétence data requise. Juste du français naturel"
```

### 6.3 Call-to-Action

```
Primary CTA: "Démarrer gratuitement (14 jours, pas de CB)"
Secondary: "Voir démo"
Tertiary: "Parler à un expert"

Placement:
- Hero section (hero CTA)
- End of every feature explanation
- Navigation bar (sticky)
- Footer
```

---

## 7. SEO (On-Page & Technical)

### 7.1 Meta tags & structured data

```html
<!-- ✅ CORRECT: Complete meta tags -->

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="L'analyste marketing IA en français. Connecte tes outils, pose tes questions, reçois tes insights en 90 secondes.">
  <meta name="keywords" content="analyse marketing, rapports automatisés, IA, agences">
  <meta property="og:title" content="SmartAnalyst - L'analyste marketing dont tu as besoin">
  <meta property="og:description" content="...">
  <meta property="og:image" content="https://smartanalyst.io/og-image.png">
  <meta property="og:url" content="https://smartanalyst.io">
  <meta name="twitter:card" content="summary_large_image">
  
  <!-- Structured data (JSON-LD) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "SmartAnalyst",
    "description": "AI-powered marketing analysis platform",
    "url": "https://smartanalyst.io",
    "applicationCategory": "BusinessApplication",
    "offers": {
      "@type": "Offer",
      "price": "99",
      "priceCurrency": "EUR"
    }
  }
  </script>
</head>
```

### 7.2 Heading hierarchy & content structure

```html
<!-- ✅ CORRECT: Semantic HTML, one H1 per page -->

<h1>SmartAnalyst: L'analyste marketing dont tu as besoin</h1>

<h2>Features principales</h2>
<h3>Analyse conversationnelle</h3>
<p>Description...</p>

<h3>Dashboard en temps réel</h3>
<p>Description...</p>

<h2>Pour qui?</h2>
<h3>Les agences</h3>
<p>Description...</p>

<!-- ❌ INCORRECT: Multiple H1s, non-semantic -->

<b>SmartAnalyst: L'analyste marketing</b>
<b>Features</b>
<b>Analyse conversationnelle</b>
```

### 7.3 Internal linking

```html
<!-- ✅ CORRECT: Strategic internal links -->

<a href="/product">Voir toutes les features</a>
<a href="/pricing">Comparateur plans</a>
<a href="/blog/guide-ga4-agences">Guide complet GA4 pour agences</a>

<!-- Anchor text = keyword-rich -->
<!-- NOT: <a href="/connectors">Click here</a> -->
```

---

## Checklist pré-lancement

- [ ] RGPD: Consent form, DPA template, privacy policy
- [ ] Security: No secrets in code, Vault setup, CORS configured
- [ ] Performance: Lighthouse > 90, API latency < 500ms p95
- [ ] Accessibility: WCAG 2.1 AA, tested with screen reader
- [ ] SEO: Meta tags, structured data, internal links
- [ ] Monitoring: Logs configured, error alerts set up, dashboards live
- [ ] Product: Tone of voice consistent, CTAs placed, messaging clear

---

## Prochaine étape

Lire **03_ARCHITECTURE_GLOBALE.md** (flux données, pattern Connector, RLS).

---

*Dernière mise à jour : Mai 2025*
