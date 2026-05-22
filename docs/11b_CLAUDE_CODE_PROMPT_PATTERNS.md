# 11b_CLAUDE_CODE_PROMPT_PATTERNS.md

## Vue d'ensemble

**Patterns de prompts optimisés** pour que Claude Code génère du code AVEC tests intégrés, pas séparément. Ces patterns évitent les oublis, les redirections cassées, et les erreurs d'intégration.

**Pour qui:** Quiconque utilise Claude Code pour générer des modules  
**Objectif:** Zéro bug par construction (tester EN MÊME TEMPS que coder)

---

## Pattern 1: "Module complet avec tests intégrés"

### ❌ MAUVAIS PROMPT
```
"Crée un service d'upload de fichiers Excel"
```

Résultat: Code sans tests, oublis, erreurs d'intégration.

### ✅ BON PROMPT

```
Génère un service complet d'upload de fichiers Excel pour SmartAnalyst.

SPEC: Voir doc 09b_FILE_UPLOAD_SERVICE.md

LIVRABLE:
1. Fichier src/services/fileUpload.js
   - Fonction validateFile(file, workspaceId)
   - Fonction parseFile(file)
   - Fonction processUploadedFile(workspaceId, file)
   
2. Fichier src/services/__tests__/fileUpload.test.js
   - Tests validez tous les cas normaux
   - Tests erreurs (quota exceeded, invalid format, etc.)
   - Tests edge cases (corrupted file, duplicate)
   
3. Fichier src/routes/__tests__/fileUpload.integration.test.js
   - Test POST endpoint complet
   - Test quota enforcement AVANT insert
   - Test que cache est cleared après
   - Test que insights job est déclenché

CHECKLIST À VÉRIFIER:
□ Quota checké AVANT d'accepter le fichier
□ Aucune donnée dans DB si quota exceeded
□ Canonical_metrics insert réussit ET cache cleared
□ Insights queue job déclenché après
□ Erreurs handleées avec messages français
□ RLS: workspace_id enforced everywhere
□ Variables d'env utilisées (jamais hardcoded)
□ Tests couvrent: happy path + quota exceeded + invalid format + duplicate

SOIS TRÈS SPÉCIFIQUE:
- Si quota exceeded → HTTP 413, pas d'insert
- Si format invalide → HTTP 400, message clair
- Si file > plan limit → HTTP 413, message plan upgrade
- Après succès: cache cleared ET insights job triggered

SIMULE L'EXÉCUTION:
Pour chaque test case, explique:
"Si input est X, function fait Y, résultat est Z"

Exemple:
Test: "File > quota"
Input: workspace=Pro (50MB), used=48MB, file=3MB
Exécution: validateQuota() → throw QuotaExceeded → HTTP 413
Expected: 413 status, no DB insert, user notified
```

**Résultat:** Code + tests + vérification = zéro bug.

---

## Pattern 2: "API endpoint avec erreurs + redirections"

### BON PROMPT

```
Génère l'endpoint POST /api/v1/auth/signup complet.

SPEC: Voir doc 07_API_AUTH_CONNEXION.md, section "Signup"

FLUX ATTENDU:
1. Valide email + password (validation errors → 400)
2. Crée user Supabase Auth (error → 400)
3. Crée organization record (error → 500 + rollback)
4. Crée workspace (error → 500 + rollback)
5. Ajoute user comme workspace member (ERROR CASE: peut-être oublié!)
6. Envoie email confirmation (Resend)
7. Retourne 201 + workspace info

TESTS REQUIS:
□ Happy path: signup complet, email envoyé
□ Email invalide: 400 + validation error
□ Password trop court: 400 + "min 12 caractères"
□ Signup fails: Organization créée mais Workspace fail → ROLLBACK
□ Workspace created BUT user NOT added as member → ERROR (test this!)
□ Email send fails → 500 (DB rolled back, user notified)

CHECKLIST CRITIQUE:
□ Si Auth user créé mais Org fail → DELETE user, 500 error
□ Si Org créé mais Workspace fail → DELETE org + user, 500 error
□ Si tout créé MAIS user NOT added as member → 500, delete all, critical alert
□ Email TOUJOURS sent (même si delay)

ERREURS À TESTER SPÉCIFIQUEMENT:
"Simulate: Auth user created (user-123), but db.organizations.insert throws.
Expected: Catch error, delete user from Auth, throw 500, don't create workspace"

REDIRIGÉ VERS:
Après signup, l'utilisateur doit aller à /onboarding (frontend handles).
Test: Response inclut workspaceId pour redirect.
```

---

## Pattern 3: "Quota enforcement STRICTE"

### BON PROMPT

```
Génère la fonction checkQuota() pour SmartAnalyst.

SPEC: Voir doc 10_BILLING_ET_STRIPE.md, section "Quota Enforcement"

QUOTAS À IMPLÉMENTER:
- Free: 0 connecteurs, 0 fichiers, 20 insights/mois
- Starter: 3 connecteurs, 5MB storage, 100 insights/mois
- Pro: ∞ connecteurs, 50MB storage, 500 insights/mois
- Agency: ∞ tout

APPELS À PROTÉGER:
□ POST /connectors → check workspace connecteur limit AVANT insert
□ POST /data-sources/upload → check storage AVANT parse file
□ POST /chat → check insights/month limit AVANT calling Claude
□ POST /reports/generate → check allowed on plan AVANT Puppeteer

TESTS SPÉCIFIQUES:
1. Test: Starter plan, 2 connecteurs, try add 3rd → FAIL
   Expected: Exception "Connector limit (3) reached"
   
2. Test: Pro plan, 48MB used, try upload 5MB → FAIL
   Expected: Exception "Storage quota (50MB) exceeded"
   
3. Test: Free plan, try upload file → FAIL
   Expected: Exception "File upload not available on Free plan"
   
4. Test: Agency plan, 999 connecteurs → PASS
   Expected: No error, connector added (unlimited)

JAMAIS BYPASS:
- Pas de "if (isPremium) skip check"
- Pas de "admin can bypass quota"
- Check MUST happen AVANT any side effects
- Check MUST throw BEFORE DB insert

SIMULATE:
"Plan=Starter, connectors=3, action=add_connector
→ getSubscription('starter') → quota.connectors = 3
→ countConnectors(workspace_id) → 3
→ 3 >= 3 → throw QuotaExceededException
→ Caller sees 'Connector limit reached', no insert happens"
```

---

## Pattern 4: "Connector implementation with error handling"

### BON PROMPT

```
Génère GA4Connector basé sur doc 10_CONNECTOR_GA4.md.

EXTENDS: BaseConnector (voir doc 15_BASE_CONNECTOR_CLASSE.md)

METHODS:
1. fetchData({ startDate, endDate })
   - Call GA4 API
   - Handle: 401 (token expired), 429 (rate limit), 5xx (server error)
   - Return raw data OR throw with type (ExpiredToken, RateLimit, etc.)

2. normalizeData(rawData)
   - Map GA4 metrics to canonical_metrics
   - Return: { workspace_id, metrics: [...] }
   - Handle: empty data, missing fields

3. testConnection()
   - Call GA4 API with small date range
   - Return: boolean (true if valid, false if not)

4. _doRefresh()
   - Call Google OAuth endpoint
   - Update connector.access_token (encrypted)
   - Update connector.token_expires_at

ERRORS TO TEST:
□ Token expired (401) → throw TokenExpiredException (triggers refresh)
□ Rate limited (429) → throw RateLimitException (queue retries)
□ Network timeout → throw TimeoutException (queue retries)
□ Invalid JSON response → throw ParseException + log
□ Missing property in response → skip row, log warning, continue
□ Empty data (rows=[]) → return metrics=[] (valid)

NORMALIZATION MAPPING:
Session metrics:
- ga4.sessions → canonical: sessions_all
- ga4.newUsers → canonical: new_users
- ga4.bounceRate → canonical: bounce_rate_all

Conversion metrics:
- ga4.conversions → canonical: conversions_total
- ga4.conversionRate → canonical: conversion_rate_total
- ga4.conversionValue → canonical: revenue_from_conversions

CONFIDENCE SCORING:
- Normal data → confidence_score: 100
- Data with warnings → confidence_score: 80
- Partial data → confidence_score: 60

TESTS REQUIRED:
□ Happy path: fetch + normalize → correct metrics
□ Empty response: [] → metrics=[] (no error)
□ Invalid token: 401 → testConnection() returns false
□ Network timeout: → log + throw, queue will retry
□ Invalid JSON: → log + throw, queue will retry
□ Missing field: skip row, log warning, continue
□ All date range formats: YYYY-MM-DD works

TEST NORMALIZATION:
"Raw: {sessions: 1250, newUsers: 530, bounceRate: 0.42}
→ normalized.metrics should include:
  - { metric_key: 'sessions_all', metric_value: 1250, source: 'ga4' }
  - { metric_key: 'new_users', metric_value: 530, source: 'ga4' }
  - { metric_key: 'bounce_rate_all', metric_value: 0.42, source: 'ga4' }
All with confidence_score: 100"
```

---

## Pattern 5: "File parsing with edge cases"

### BON PROMPT

```
Génère parseExcelFile(buffer) pour 09b_FILE_UPLOAD_SERVICE.md

INPUT: Excel file as Buffer

OUTPUT: 
{
  headers: ['date', 'metric_key', 'metric_value', 'source'],
  rows: [
    ['2025-05-15', 'sessions_all', '1250', 'custom'],
    ...
  ],
  errors: [
    { row: 5, error: 'Invalid date format' },
    ...
  ]
}

VALIDATION:
□ Headers must be: date, metric_key, metric_value, [source]
□ Missing headers → throw ValidationException
□ Date format YYYY-MM-DD → validate each row
□ metric_value must be numeric → skip row if not, log warning
□ Row count ≤ 100,000 (Starter) → throw if exceeds

TESTS:
□ Valid Excel: 100 rows → parse all, errors=[]
□ Missing header 'metric_key' → throw "Invalid headers"
□ Invalid date "2025-13-01" → errors=[{ row: 2, error: 'Invalid date' }]
□ Non-numeric value "abc" → errors=[{ row: 3, error: 'Non-numeric' }]
□ Corrupted file → throw "Cannot parse Excel"
□ Empty sheet → return rows=[], no error
□ 100,001 rows → throw "File too large"

SIMULATE PARSING:
"Excel buffer with 3 rows:
Row 1: date, metric_key, metric_value, source
Row 2: 2025-05-15, sessions_all, 1250, custom
Row 3: 2025-05-16, bounceRate_all, abc, custom

Parsing:
→ Row 1: headers OK
→ Row 2: date OK, metric_key OK, value=1250 (numeric OK), source OK
→ Row 3: date OK, metric_key OK, value='abc' (NOT numeric) → error logged
Result: rows=[row2], errors=[{row: 3, error: 'Non-numeric value...'}]"
```

---

## Pattern 6: "Integration test with database"

### BON PROMPT

```
Génère test d'intégration pour "Connector sync → canonical_metrics insert"

SETUP:
- Create test workspace
- Create test connector (GA4)
- Mock GA4 API responses

FLOW TO TEST:
1. Fetch data from GA4 API
2. Normalize to canonical_metrics
3. Insert into DB
4. Verify insert success
5. Clear cache (health_score)
6. Trigger insights job

TESTS:
□ Happy path: sync complète, données en DB
□ Duplicate data same date: last-one-wins (upsert logic)
□ Partial failure (some rows OK, some invalid): insert valid, log invalid
□ Cache cleared: verify redis.del() called with correct key
□ Queue job triggered: verify insightsQueue.add() called with workspace_id
□ RLS enforced: query with different workspace_id returns empty
□ Data validation: metric_value stored as numeric (not string)

SIMULATE EXECUTION:
"Sync GA4, get 100 rows.
→ Normalize: 100 metrics
→ Insert: INSERT INTO canonical_metrics (100 rows)
→ Redis: DEL health_score_ws-123
→ Queue: ADD job { workspaceId: 'ws-123' }
→ Verify: SELECT * FROM canonical_metrics WHERE workspace_id='ws-123' → 100 rows
→ Verify: SELECT * FROM canonical_metrics WHERE workspace_id='ws-456' → 0 rows (RLS)"
```

---

## Pattern 7: "Checklist verification before delivery"

### PROMPT

```
Avant de finaliser ce module, COMPLÈTE cette checklist:

MODULE: [Name]
FICHIERS: [List all generated files]

CODE QUALITY:
□ Aucune syntaxe JavaScript error
□ Toutes variables d'env utilisées (jamais hardcoded)
□ Erreurs handleées (try/catch everywhere)
□ Messages d'erreur en français
□ Logging structuré (context + error)
□ Comments sur logic complexe

TESTING:
□ Unit tests écrits (min 10 test cases)
□ Integration tests écrits (si DB/API)
□ Tests SIMULATED (trace d'exécution pour chaque case)
□ Edge cases testés (empty input, invalid, quota, timeout, etc.)
□ Coverage report: min 70%

FONCTIONNALITÉ:
□ Spec doc lu ET respectée
□ Toutes les erreurs documentées testées
□ Quotas vérifiés (si applicable)
□ RLS enforced (si database)
□ Redirections vérifiées (if API)
□ Side effects (cache, queue, email) testés

SÉCURITÉ:
□ Pas de SQL injection
□ Pas de XSS
□ Tokens chiffrés (Vault)
□ RLS policies appliquées
□ Rate limiting (if API)

INTÉGRATION:
□ Authentification vérifiée (JWT)
□ Workspace_id passé partout
□ Cache invalidation logic correct
□ Queue jobs triggered correctly
□ Notifications sent (email, etc.)

PRÊT À MERGER?
Répondez "OUI" si tous les checkboxes sont ✅
```

---

## Pattern 8: "Simulating error flow"

### BON PROMPT

```
Simule le flux complet quand "user tries to add 3rd connector on Starter plan":

STEP-BY-STEP:
1. User clicks "Add Connector" button
2. POST /api/v1/connectors
3. Backend hits checkQuota(workspace_id, 'add_connector')

SIMULATION:
→ getSubscription(workspace_id)
  → plan = 'starter' ← quota is 3 connectors
→ countConnectors(workspace_id)
  → count = 2 (already has 2)
→ Check: count (2) >= quota (3)? NO, so continue
  
WAIT, USER HAS 2, TRIES TO ADD 3RD:
→ countConnectors returns 2
→ Check: 2 >= 3? NO
→ So it ALLOWS? ← This is WRONG!

CORRECT LOGIC:
→ After adding, user would have: 2 + 1 = 3
→ Check: (2 + 1) > 3? NO
→ But ALSO check: 2 >= 3? NO
→ ACTUALLY: if (count + 1 > quota) throw
→ if (2 + 1 > 3) throw? NO (3 is not > 3)
→ So 3rd connector ALLOWED (limit is 3, not < 3)

TEST CASE:
Plan: Starter (limit = 3)
Current: 2 connectors
Try add: 1 more
Result: count becomes 3 → ALLOWED ✓

Try add 4th:
Current: 3 connectors
Try add: 1 more
→ if (3 + 1 > 3) → (4 > 3) → TRUE → throw ✓

Verify test covers ALL boundaries:
- At limit (3): add 1 more → fail
- Below limit (2): add 1 more → pass
- Way below (0): add 1 → pass
```

---

## Summary: Prompt Template

Copie ce template pour tout module:

```
TASK: Générer [Module Name]

SPEC: Voir doc [XX_DOCUMENT_NAME.md]

LIVRABLE:
1. src/[module].js — [description]
2. src/__tests__/[module].test.js — unit tests
3. src/routes/__tests__/[module].integration.test.js — integration tests

CHECKLIST:
□ Spec complètement lue ET implémentée
□ Tous les erreurs cases testés
□ Edge cases testés (empty, null, quota, timeout, etc.)
□ Quotas vérifiés si applicable
□ RLS enforced si database
□ Redirections/side effects testés
□ Tokens/env vars sécurisés
□ Messages d'erreur en français
□ Logging structuré

SIMULATE & EXPLAIN:
Pour chaque test case: "Input X → Function does Y → Result Z"

DELIVERY CHECKLIST:
□ Code compiles
□ Tests pass (mentally simulated)
□ Coverage > 70%
□ No hardcoded secrets
□ French error messages
□ RLS OK
□ Quota enforcement OK

Ready to merge? YES/NO + checklist items signed off
```

---

*Dernière mise à jour : Mai 2025*
