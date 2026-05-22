# 11_CLAUDE_CODE_TESTING_FRAMEWORK.md

## Vue d'ensemble

Guide complet pour **Claude Code** (ou tout LLM autonome) pour tester du code **pendant qu'il le génère**, pas après. Cela élimine 80% des bugs et erreurs d'intégration.

**Pour qui:** Claude Code, LLM agents, développeurs utilisant l'IA pour coder  
**Objectif:** Tests écrits EN PARALLÈLE avec le code, jamais comme afterthought

---

## 1. Stratégie de test par module

### Pattern: "Codify → Test → Integrate"

**Au lieu de:** Code → Ship → Test → Fix (mauvais)

**Faire:** Code + Tests → Simulate → Integrate → Verify (bon)

```
Pour chaque module livré:

1. CODIFY (Claude génère le code)
   ├─ Écrit la fonction/endpoint/service
   └─ Documente l'interface (inputs/outputs)

2. TEST (Claude génère les tests)
   ├─ Unit tests (fonction isolée)
   ├─ Integration tests (avec dépendances)
   ├─ Edge cases & error handling
   └─ Mock data si besoin

3. SIMULATE (Claude exécute les tests mentalement)
   ├─ "Trace l'exécution pour X input"
   ├─ "Qu'est-ce qui échouerait si Y?"
   ├─ "Vérifier les redirections"
   └─ "Vérifier les quotas enforcement"

4. DELIVER (Livrer code + tests + checklist validée)
   └─ Jamais de code sans tests correspondants
```

---

## 2. Jest Configuration (Unit Tests)

```javascript
// jest.config.js

module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/index.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
}
```

### Run Tests

```bash
npm test                    # Run all tests
npm test -- --watch       # Watch mode
npm test -- --coverage    # Coverage report
npm test -- src/auth      # Specific folder
```

---

## 3. Test Pattern Templates

### Pattern 1: Unit Test (Fonction isolée)

```javascript
// src/services/auth/__tests__/jwt.test.js

const jwt = require('jsonwebtoken')
const { generateJWT, verifyJWT } = require('../jwt')

describe('JWT Service', () => {
  const userId = 'user-123'
  const workspaceId = 'ws-456'
  const secret = 'test-secret-key'
  
  describe('generateJWT', () => {
    it('should generate valid token with correct payload', () => {
      const token = generateJWT(userId, workspaceId)
      
      // Verify structure
      const parts = token.split('.')
      expect(parts.length).toBe(3) // Header.Payload.Signature
      
      // Decode and verify
      const decoded = jwt.decode(token)
      expect(decoded.sub).toBe(userId)
      expect(decoded.workspace_id).toBe(workspaceId)
      expect(decoded.type).toBe('access')
    })
    
    it('should set expiration to 15 minutes', () => {
      const token = generateJWT(userId, workspaceId)
      const decoded = jwt.decode(token, { complete: true })
      const now = Math.floor(Date.now() / 1000)
      const expiresIn = decoded.payload.exp - now
      
      // Should be close to 15 minutes (900 seconds)
      expect(expiresIn).toBeGreaterThan(890)
      expect(expiresIn).toBeLessThan(910)
    })
    
    it('should throw error if userId missing', () => {
      expect(() => generateJWT(null, workspaceId)).toThrow()
    })
  })
  
  describe('verifyJWT', () => {
    it('should verify valid token', () => {
      const token = generateJWT(userId, workspaceId)
      const decoded = verifyJWT(token)
      
      expect(decoded.sub).toBe(userId)
      expect(decoded.workspace_id).toBe(workspaceId)
    })
    
    it('should throw on invalid signature', () => {
      const token = generateJWT(userId, workspaceId)
      const corrupted = token.slice(0, -5) + 'XXXXX'
      
      expect(() => verifyJWT(corrupted)).toThrow('Invalid token')
    })
    
    it('should throw on expired token', () => {
      // Mock time to be 20 minutes in future
      jest.useFakeTimers()
      jest.advanceTimersByTime(20 * 60 * 1000)
      
      const token = generateJWT(userId, workspaceId)
      
      jest.useRealTimers()
      expect(() => verifyJWT(token)).toThrow('Token expired')
    })
  })
})
```

### Pattern 2: Integration Test (API Endpoint)

```javascript
// src/routes/__tests__/auth.integration.test.js

const request = require('supertest')
const app = require('../../app')
const db = require('../../lib/supabase')

describe('POST /api/v1/auth/login', () => {
  const validUser = {
    email: 'test@example.com',
    password: 'SecurePassword123!'
  }
  
  beforeAll(async () => {
    // Setup: Create test user in DB
    await db.auth.signUp({
      email: validUser.email,
      password: validUser.password
    })
  })
  
  afterAll(async () => {
    // Cleanup
    await db.auth.deleteUser(validUser.email)
  })
  
  it('should return tokens on valid credentials', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send(validUser)
    
    expect(response.status).toBe(200)
    expect(response.body.accessToken).toBeDefined()
    expect(response.body.refreshToken).toBeDefined()
    expect(response.body.user.email).toBe(validUser.email)
  })
  
  it('should return 401 on invalid password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: validUser.email,
        password: 'WrongPassword'
      })
    
    expect(response.status).toBe(401)
    expect(response.body.error).toBe('Invalid credentials')
  })
  
  it('should rate limit after 5 failed attempts', async () => {
    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: validUser.email,
          password: 'Wrong'
        })
    }
    
    // 6th attempt should be rate limited
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send(validUser)
    
    expect(response.status).toBe(429)
    expect(response.body.error).toContain('Too many attempts')
  })
})
```

### Pattern 3: Connector Test

```javascript
// src/connectors/__tests__/ga4.connector.test.js

const GA4Connector = require('../ga4.connector')

describe('GA4Connector', () => {
  const mockConnector = {
    id: 'conn-123',
    source: 'ga4',
    account_id: '123456789',
    access_token: 'mock-token',
    refresh_token: 'mock-refresh',
    token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
  
  const connector = new GA4Connector('workspace-123', mockConnector)
  
  describe('normalizeData', () => {
    it('should map GA4 sessions to canonical metrics', async () => {
      const rawData = {
        rows: [
          {
            dimensions: ['2025-05-15', 'Organic Search'],
            metrics: [
              { value: '1250' },  // sessions
              { value: '5230' },  // newUsers
              { value: '147' },   // conversions
              { value: '0.1184' } // conversionRate
            ]
          }
        ]
      }
      
      const normalized = await connector.normalizeData(rawData)
      
      expect(normalized.workspace_id).toBe('workspace-123')
      expect(normalized.metrics.length).toBeGreaterThan(0)
      
      // Check specific mapping
      const sessions = normalized.metrics.find(m => m.metric_key === 'sessions_all')
      expect(sessions).toBeDefined()
      expect(sessions.metric_value).toBe(1250)
      expect(sessions.source).toBe('ga4')
      expect(sessions.confidence_score).toBe(100)
    })
    
    it('should handle empty data gracefully', async () => {
      const rawData = { rows: [] }
      const normalized = await connector.normalizeData(rawData)
      
      expect(normalized.metrics.length).toBe(0)
      expect(normalized.workspace_id).toBe('workspace-123')
    })
  })
  
  describe('testConnection', () => {
    it('should verify valid credentials', async () => {
      // Mock successful API call
      jest.spyOn(connector, 'fetchData').mockResolvedValue({ rows: [] })
      
      const isValid = await connector.testConnection()
      expect(isValid).toBe(true)
    })
    
    it('should return false on invalid token', async () => {
      // Mock API error
      jest.spyOn(connector, 'fetchData').mockRejectedValue(
        new Error('Invalid credentials')
      )
      
      const isValid = await connector.testConnection()
      expect(isValid).toBe(false)
    })
  })
})
```

### Pattern 4: Quota Enforcement Test

```javascript
// src/services/__tests__/billing.quota.test.js

const { checkQuota } = require('../billing')

describe('Quota Enforcement', () => {
  const workspaceId = 'ws-123'
  
  describe('checkQuota - add_connector', () => {
    it('should allow connector on Starter plan (limit 3)', async () => {
      // Mock: Starter plan, 2 existing connectors
      jest.spyOn(db, 'getSubscription').mockResolvedValue({
        plan: 'starter'
      })
      jest.spyOn(db, 'countConnectors').mockResolvedValue(2)
      
      // Should NOT throw
      await expect(checkQuota(workspaceId, 'add_connector')).resolves.not.toThrow()
    })
    
    it('should block connector on Starter plan when limit reached', async () => {
      // Mock: Starter plan, 3 connectors (at limit)
      jest.spyOn(db, 'getSubscription').mockResolvedValue({
        plan: 'starter'
      })
      jest.spyOn(db, 'countConnectors').mockResolvedValue(3)
      
      // Should throw
      await expect(checkQuota(workspaceId, 'add_connector')).rejects.toThrow(
        'Connector limit reached'
      )
    })
    
    it('should allow unlimited connectors on Agency plan', async () => {
      // Mock: Agency plan
      jest.spyOn(db, 'getSubscription').mockResolvedValue({
        plan: 'agency'
      })
      jest.spyOn(db, 'countConnectors').mockResolvedValue(100)
      
      // Should NOT throw (unlimited)
      await expect(checkQuota(workspaceId, 'add_connector')).resolves.not.toThrow()
    })
  })
  
  describe('checkQuota - upload_file', () => {
    it('should block file upload on Free plan', async () => {
      jest.spyOn(db, 'getSubscription').mockResolvedValue({
        plan: 'free'
      })
      
      await expect(checkQuota(workspaceId, 'upload_file', 1024)).rejects.toThrow(
        'File upload not available on Free plan'
      )
    })
    
    it('should block upload if storage quota exceeded', async () => {
      // Mock: Pro plan (50 MB limit), 48 MB used, trying to add 3 MB
      jest.spyOn(db, 'getSubscription').mockResolvedValue({
        plan: 'pro'
      })
      jest.spyOn(db, 'getStorageUsed').mockResolvedValue(48 * 1024) // 48 MB
      
      await expect(
        checkQuota(workspaceId, 'upload_file', 3 * 1024) // 3 MB
      ).rejects.toThrow('Storage quota exceeded')
    })
  })
})
```

---

## 4. Checklist Automation (Claude Code should verify)

### Pre-Code Generation

Avant de générer du code, Claude Code doit vérifier:

```
CHECKLIST PRE-GENERATION:
□ Module a un doc avec spécification claire (input/output)
□ Quotas enforcement identifiés (si applicable)
□ Erreurs possibles documentées
□ Dépendances listées
□ Redirections identifiées (si API)
□ RLS/sécurité considérée (si database)
```

### Post-Code Generation

Après avoir généré le code, Claude Code doit:

```
CHECKLIST POST-GENERATION:
□ Code compiles sans erreur de syntaxe
□ Tests unitaires écrits ET passent
□ Tests d'intégration écrits ET passent
□ Erreurs handleées (try/catch avec messages français)
□ Quotas vérifiés avant action (si applicable)
□ RLS policies respectées (si database)
□ Redirections testées (si API)
□ Variables d'env utilisées (jamais hardcodées)
□ Logging ajouté (context + error details)
□ Documentation fidèle au code
```

---

## 5. Testing Patterns for Common Issues

### Pattern: "Test for Bad Redirects"

```javascript
// Example: File upload redirect issue

describe('File upload → canonical_metrics flow', () => {
  it('should redirect processed files to insights generation', async () => {
    // Setup
    const fileId = 'file-123'
    const workspaceId = 'ws-456'
    
    // Mock file processing
    jest.spyOn(fileService, 'processFile').mockResolvedValue({
      metrics_added: 150,
      file_id: fileId
    })
    
    // Mock queue add
    const queueSpy = jest.spyOn(insightsQueue, 'add')
    
    // Execute
    await handleFileUploadComplete(fileId, workspaceId)
    
    // Verify redirect (queue job was triggered)
    expect(queueSpy).toHaveBeenCalledWith(
      'generate',
      { workspaceId },
      expect.objectContaining({
        priority: 10
      })
    )
    
    // Verify cache was cleared
    const cacheSpy = jest.spyOn(redis, 'del')
    expect(cacheSpy).toHaveBeenCalledWith(`health_score_${workspaceId}`)
  })
})
```

### Pattern: "Test for Forgotten Steps"

```javascript
describe('Onboarding flow completeness', () => {
  it('should NOT skip profile detection step', async () => {
    // If URL scraping times out, fall back to manual form
    jest.spyOn(scraper, 'scrapeUrl').mockRejectedValue(
      new Error('Timeout')
    )
    
    const result = await startOnboarding('https://example.com')
    
    // Must have fallback
    expect(result.fallback_form_required).toBe(true)
    expect(result.form_fields).toContain('sector')
    expect(result.form_fields).toContain('market')
  })
  
  it('should create workspace AND add user as member', async () => {
    const userId = 'user-123'
    const orgId = 'org-456'
    
    // Mock DB calls
    let workspaceId
    jest.spyOn(db.workspaces, 'insert').mockImplementation((data) => {
      workspaceId = 'ws-' + Math.random()
      return Promise.resolve({ id: workspaceId })
    })
    
    const memberSpy = jest.spyOn(db.workspace_members, 'insert')
    
    // Execute
    await createOrgAndWorkspace(userId, orgId, 'Test Org')
    
    // VERIFY: User was added as member (not forgotten!)
    expect(memberSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspaceId,
        user_id: userId,
        role: 'admin'
      })
    )
  })
})
```

### Pattern: "Test Quota Enforcement"

```javascript
describe('Quota enforcement - no bypasses', () => {
  it('should enforce storage quota on file upload', async () => {
    const workspaceId = 'ws-123'
    const fileSizeKb = 100
    
    // Mock: Pro plan (50 MB quota), 49.5 MB used
    jest.spyOn(db, 'getSubscription').mockResolvedValue({ plan: 'pro' })
    jest.spyOn(db, 'getStorageUsed').mockResolvedValue(49.5 * 1024)
    
    // Try to upload 100 KB file (would exceed 50 MB limit)
    const response = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/data-sources/upload`)
      .attach('file', Buffer.from('x'.repeat(fileSizeKb * 1024)))
    
    // Must be rejected
    expect(response.status).toBe(413)
    expect(response.body.error).toContain('quota exceeded')
    
    // Verify no data was inserted
    const inserted = await db.data_sources.count({ workspace_id: workspaceId })
    expect(inserted).toBe(0)
  })
})
```

---

## 6. Execution Plan for Claude Code

### When generating a module, Claude Code should:

```
1. READ the spec document (03_ARCHITECTURE, 09b, etc.)

2. GENERATE code + comments explaining each part

3. GENERATE test file IMMEDIATELY after code
   "I just wrote the function, now I write tests"

4. SIMULATE test execution:
   - "If input is X, function returns Y"
   - "If Z condition occurs, function throws ErrorType"
   - "After action A, side effect B should happen"

5. IDENTIFY potential issues:
   - "What if token is expired?"
   - "What if storage quota exceeded?"
   - "What if user not authorized?"
   - "What if API timeout?"

6. GENERATE tests for those issues

7. DELIVER:
   ✓ Code file
   ✓ Test file
   ✓ Checklist (filled) confirming all tests pass mentally
   ✓ Doc update if needed
```

---

## 7. Running Tests in CI/CD

```yaml
# .github/workflows/test.yml (or similar for Hostinger)

name: Run Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm install
      
      - run: npm test -- --coverage
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      
      - run: npm run lint
      
      - uses: codecov/codecov-action@v3
        if: always()
```

---

## 8. Example: Claude Code Delivery

**Claude Code writes this when delivering a module:**

```
🎯 MODULE DELIVERED: File Upload Service (09b_FILE_UPLOAD_SERVICE.md)

📝 FILES GENERATED:
✓ src/services/fileUpload.js (350 lines)
✓ src/services/__tests__/fileUpload.test.js (400 lines, 18 test cases)
✓ src/routes/__tests__/fileUpload.integration.test.js (250 lines, 12 test cases)

✅ TESTING VERIFICATION:
✓ Format validation (Excel/CSV) — 4 test cases
✓ Quota enforcement (per plan) — 6 test cases
✓ Storage limit checks — 3 test cases
✓ Canonical metrics mapping — 2 test cases
✓ Error handling (file too large, invalid format) — 3 test cases
✓ Deduplication logic — 2 test cases

⚠️ EDGE CASES TESTED:
✓ What if file > storage quota? → 413 error, no data inserted
✓ What if Excel is corrupted? → Validation error, helpful message
✓ What if user on Free plan tries upload? → 403 forbidden
✓ What if duplicate file (same checksum)? → Skipped, user notified
✓ What if canonical_metrics insert fails? → Rollback, error logged

🔗 INTEGRATIONS VERIFIED:
✓ DB: storage quota checked BEFORE insert
✓ Cache: health_score cleared after metrics added
✓ Queue: insights generation job triggered
✓ RLS: workspace_id enforced on all queries
✓ Logging: all actions logged with context

📋 CHECKLIST:
□ Code compiles: ✅
□ Unit tests pass: ✅ (18/18)
□ Integration tests pass: ✅ (12/12)
□ Coverage > 70%: ✅ (82%)
□ No hardcoded secrets: ✅
□ Error messages in French: ✅
□ RLS enforced: ✅
□ Quotas checked: ✅

Ready to merge! 🚀
```

---

## Checklist pour tout module livré

```
JAMAIS livrer du code sans:

□ Unit tests (50-100 lignes par 100 lignes de code)
□ Integration tests (si touche DB/API)
□ All tests simulated/verified (mentallement)
□ Checklist au complet (signed off)
□ Erreurs handleées (messages français)
□ Quotas vérifiés (avant action)
□ RLS/sécurité OK
□ Variables d'env (pas hardcoded)
□ Doc fidèle au code
□ Pas de redirections oubliées (B→C→D flow complet)
```

---

*Dernière mise à jour : Mai 2025*
