# 39_SECURITE_ARCHITECTURE_GLOBALE.md

## Vue d'ensemble

**Stratégie de sécurité multicouche** pour SmartAnalyst.

**Principe:** Défense en profondeur. Si une couche est compromise, les autres restent intactes.

**For who:** CTO, security engineers, DevOps

---

## 1. Modèle de menaces (Threat Model)

### Assets critiques à protéger

```
TIER 1: Données sensibles (HIGHEST RISK)
├─ API keys (GA4, Meta, Google Ads, Stripe)
│  └─ Accès à comptes marketing + données financières
├─ Stripe API keys + webhook secrets
│  └─ Accès à transactions, abonnements, paiements
└─ Customer data (emails, business names, metrics)
   └─ RGPD: données à caractère personnel

TIER 2: Système d'authentification (HIGH RISK)
├─ JWT tokens + refresh tokens
│  └─ Compromise = account takeover
├─ Password hashes
│  └─ Compromise = offline brute-force
└─ Session management
   └─ Compromise = session hijacking

TIER 3: Infrastructure (HIGH RISK)
├─ VPS + database access
│  └─ Compromise = full data breach
├─ API endpoints
│  └─ Compromise = DOS, data extraction
└─ Backup storage
   └─ Compromise = historical data access

TIER 4: Code + configurations (MEDIUM RISK)
├─ Source code (secrets in code)
├─ Environment variables (leaks)
└─ Deployment pipelines
```

### Attaquants potentiels

```
THREAT ACTOR 1: Script kiddies
├─ Attack vector: Automated scanning, common vulnerabilities
├─ Motivation: Random attacks, botnet recruitment
└─ Prevention: WAF, rate limiting, basic hardening

THREAT ACTOR 2: Competitive agencies
├─ Attack vector: API enumeration, data scraping, account takeover
├─ Motivation: Steal client lists, metrics, insights
└─ Prevention: RLS, rate limiting, audit logging

THREAT ACTOR 3: Malicious employees
├─ Attack vector: Unauthorized data access, secret exfiltration
├─ Motivation: Sell data, sabotage, extortion
└─ Prevention: MFA, audit logs, principle of least privilege

THREAT ACTOR 4: Nation-state APT (unlikely but possible)
├─ Attack vector: 0-day, supply chain, infrastructure compromise
├─ Motivation: IP theft, surveillance
└─ Prevention: Incident response, backups, resilience

THREAT ACTOR 5: Ransomware gangs
├─ Attack vector: RDP/SSH brute force, unpatched systems
├─ Motivation: Extortion
└─ Prevention: VPS hardening, network segmentation, backups
```

---

## 2. Défense en profondeur (Layered Security)

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: Network Perimeter (nginx, rate limiting, WAF)     │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: API Security (auth, input validation, CORS)       │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: Application Security (JWT, RBAC, RLS)             │
├─────────────────────────────────────────────────────────────┤
│ LAYER 4: Data Security (encryption, tokenization, Vault)   │
├─────────────────────────────────────────────────────────────┤
│ LAYER 5: Infrastructure Security (VPS hardening, backups)  │
├─────────────────────────────────────────────────────────────┤
│ LAYER 6: Monitoring & Response (logs, alerts, IR plan)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. LAYER 1: Network Perimeter

### 3.1 nginx reverse proxy

```nginx
# /etc/nginx/nginx.conf

upstream app {
  server 127.0.0.1:3000;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

server {
  listen 443 ssl http2;
  server_name api.smartanalyst.io;
  
  # SSL/TLS (Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/api.smartanalyst.io/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.smartanalyst.io/privkey.pem;
  
  # SSL hardening
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 10m;
  
  # HSTS (force HTTPS)
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  
  # Security headers
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
  
  # CORS (controlled)
  add_header Access-Control-Allow-Origin "https://app.smartanalyst.io" always;
  add_header Access-Control-Allow-Credentials "true" always;
  add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
  add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
  
  # Rate limiting
  location /api/v1/auth/login {
    limit_req zone=auth_limit burst=3 nodelay;
    proxy_pass http://app;
  }
  
  location /api/v1 {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://app;
    
    # Proxy security
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeout protection
    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
  }
  
  # Hide nginx version
  server_tokens off;
}

# HTTP redirect to HTTPS
server {
  listen 80;
  server_name api.smartanalyst.io;
  return 301 https://$server_name$request_uri;
}
```

### 3.2 WAF (Web Application Firewall)

```javascript
// Simple WAF rules (Cloudflare Rules ou nginx rules)

// Block common attacks
1. SQL injection patterns
   └─ Block: "' OR '1'='1", "union select", "drop table"

2. XSS patterns
   └─ Block: "<script>", "javascript:", "onerror="

3. Path traversal
   └─ Block: "../", "..\\", "%2e%2e"

4. Brute force
   └─ Block: > 5 failed logins per IP per minute

5. Suspicious headers
   └─ Block: User-Agent = bot, scanner, exploit tools
```

---

## 4. LAYER 2: API Security

### 4.1 Input Validation (OWASP #1)

```javascript
// src/middleware/inputValidation.js

const { body, param, query, validationResult } = require('express-validator')

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email) && email.length <= 254
}

function validatePassword(password) {
  // Min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/
  return re.test(password)
}

// Middleware
const validateSignup = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .custom(email => {
      if (!validateEmail(email)) throw new Error('Invalid email')
      return true
    }),
  
  body('password')
    .custom(password => {
      if (!validatePassword(password)) {
        throw new Error('Password must have: 12+ chars, uppercase, lowercase, number, special char')
      }
      return true
    }),
  
  body('workspace_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .escape() // ← CRITICAL: escape HTML
    .custom(name => {
      if (!/^[a-zA-Z0-9\s\-\.]/g.test(name)) {
        throw new Error('Workspace name contains invalid characters')
      }
      return true
    }),
  
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    next()
  }
]

// Usage
router.post('/auth/signup', validateSignup, signupController)
```

### 4.2 SQL Injection Prevention (parameterized queries)

```javascript
// ❌ NEVER DO THIS
const query = `SELECT * FROM users WHERE email = '${email}'`
db.query(query)

// ✅ ALWAYS DO THIS
const query = 'SELECT * FROM users WHERE email = $1'
db.query(query, [email])

// With Supabase
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('email', email) // ← Parameterized by default
```

### 4.3 CORS (Cross-Origin Resource Sharing)

```javascript
// src/middleware/cors.js

const cors = require('cors')

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://app.smartanalyst.io'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600, // Preflight cache
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions))

// For specific routes
app.options('/api/v1/sensitive-endpoint', cors(corsOptions))
```

---

## 5. LAYER 3: Application Security

### 5.1 Authentication (JWT)

```javascript
// src/services/auth/jwt.js

const jwt = require('jsonwebtoken')
const crypto = require('crypto')

class JWTService {
  generateAccessToken(userId, workspaceId, permissions = []) {
    // Short-lived (15 min)
    const payload = {
      sub: userId, // subject (user ID)
      workspace_id: workspaceId,
      permissions,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 15 * 60 // 15 min
    }
    
    return jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'smartanalyst-api',
      audience: 'smartanalyst-users'
    })
  }
  
  generateRefreshToken(userId, workspaceId) {
    // Long-lived (7 days) - stored in DB
    const payload = {
      sub: userId,
      workspace_id: workspaceId,
      type: 'refresh',
      jti: crypto.randomBytes(16).toString('hex') // ← Unique ID
    }
    
    const token = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
      algorithm: 'HS256',
      expiresIn: '7d'
    })
    
    return token
  }
  
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'smartanalyst-api',
        audience: 'smartanalyst-users'
      })
    } catch (err) {
      throw new Error(`Invalid token: ${err.message}`)
    }
  }
  
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET)
    } catch (err) {
      throw new Error('Refresh token expired or invalid')
    }
  }
}

module.exports = new JWTService()
```

### 5.2 Authorization (RLS + RBAC)

```sql
-- Supabase RLS (Row-Level Security)

-- CRITICAL: ALL tables must have RLS enabled
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: User can only see their own agencies
CREATE POLICY "users_see_own_agencies" ON agencies
  FOR SELECT
  USING (owner_id = auth.uid());

-- Policy: User can only see workspaces they're member of
CREATE POLICY "users_see_own_workspaces" ON workspaces
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id
      AND user_id = auth.uid()
      AND role IN ('admin', 'editor', 'viewer')
    )
  );

-- Policy: Data isolation by workspace
CREATE POLICY "data_isolated_by_workspace" ON canonical_metrics
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Backend uses service_role key (bypasses RLS) ← DANGEROUS
-- Must be used only for internal operations
-- NEVER expose service_role key to frontend
```

### 5.3 Multi-factor authentication (MFA)

```javascript
// src/services/auth/mfa.js

const speakeasy = require('speakeasy')
const QRCode = require('qrcode')

class MFAService {
  async generateSecret(userId, email) {
    const secret = speakeasy.generateSecret({
      name: `SmartAnalyst (${email})`,
      issuer: 'SmartAnalyst',
      length: 32
    })
    
    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url)
    
    return {
      secret: secret.base32,
      qrCode,
      backupCodes: this.generateBackupCodes()
    }
  }
  
  verifyToken(secret, token) {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // Allow 30 second drift
    })
    
    return verified
  }
  
  generateBackupCodes(count = 10) {
    return Array(count)
      .fill()
      .map(() => crypto.randomBytes(4).toString('hex').toUpperCase())
  }
}

module.exports = new MFAService()
```

---

## 6. LAYER 4: Data Security

### 6.1 Encryption at rest (Supabase Vault)

```javascript
// API keys stored ENCRYPTED in Supabase Vault

// Insert encrypted key
const { data, error } = await supabase
  .from('connectors')
  .insert({
    workspace_id: 'ws-123',
    source: 'ga4',
    account_id: '123456789',
    // ← Never store raw access_token here
    access_token: encryptedValue, // Encrypted by Vault
    encrypted: true
  })

// Retrieve and decrypt (backend only)
const { data: connectorData } = await supabase
  .from('connectors')
  .select('*')
  .eq('id', connectorId)

// Decrypt using Vault
const decryptedToken = await decryptVault(connectorData.access_token)
```

### 6.2 Encryption in transit (TLS 1.3)

```
✅ HTTPS only (nginx SSL)
✅ TLS 1.3 minimum
✅ Perfect forward secrecy (ephemeral keys)
✅ HSTS headers (force HTTPS)

❌ No HTTP
❌ No self-signed certs in production
❌ No outdated TLS versions
```

### 6.3 Sensitive data handling

```javascript
// ✅ SECURE patterns

// 1. Never log sensitive data
logger.info('User login', { userId, email }) // ← OK
logger.info('User login', { userId, password }) // ← NEVER

// 2. Clear sensitive data from memory ASAP
function processPayment(cardToken) {
  const result = processWithStripe(cardToken)
  cardToken = null // ← Clear from memory
  return result
}

// 3. Use tokenization for API keys
const { token } = await Stripe.tokenize(cardData)
// Send token, never raw card data

// 4. Mask in responses
{
  email: 'user@example.com',
  card_last4: '****4242', // ← Masked
  connector_status: 'active'
}
```

---

## 7. LAYER 5: Infrastructure Security

### 7.1 VPS hardening (Hostinger)

```bash
#!/bin/bash
# Initial VPS setup security

# 1. Update system
apt-get update && apt-get upgrade -y

# 2. SSH hardening
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# 3. Firewall (UFW)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp # SSH
ufw allow 80/tcp # HTTP
ufw allow 443/tcp # HTTPS
ufw enable

# 4. Fail2Ban (prevent brute force)
apt-get install fail2ban -y
systemctl enable fail2ban

# 5. Disable unused services
systemctl disable avahi-daemon
systemctl disable cups

# 6. Set up automatic security updates
apt-get install unattended-upgrades -y

# 7. Monitor open ports
netstat -tulpn | grep LISTEN

# 8. Set up logging
sysctl -w net.ipv4.conf.all.log_martians=1
```

### 7.2 Database security

```sql
-- Supabase PostgreSQL hardening

-- 1. Strong password policy
ALTER USER postgres WITH PASSWORD 'very_strong_password_here';

-- 2. Restrict user permissions (principle of least privilege)
CREATE ROLE api_user WITH LOGIN PASSWORD 'api_password';
GRANT CONNECT ON DATABASE smartanalyst TO api_user;
GRANT USAGE ON SCHEMA public TO api_user;
GRANT SELECT, INSERT, UPDATE ON public.agencies TO api_user;
GRANT SELECT ON public.canonical_metrics TO api_user;
-- Don't give DELETE/DROP unless absolutely necessary

-- 3. Encryption columns (sensitive data)
-- Use pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 4. Audit logging
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT,
  operation TEXT, -- INSERT, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Backup strategy
-- Daily automated backups (Supabase handles this)
-- Test restore quarterly
```

### 7.3 Backup and disaster recovery

```
Backup Strategy:

Daily:
├─ Automated daily snapshot (Supabase)
├─ Retention: 30 days
└─ Stored in separate region (AWS eu-west-1)

Weekly:
├─ Full database backup
├─ Export to S3 (encrypted)
└─ Retention: 90 days

Monthly:
├─ Offsite backup (separate cloud provider)
├─ Encryption key stored separately
└─ Test restore process

Disaster Recovery:
├─ RTO (Recovery Time Objective): < 4 hours
├─ RPO (Recovery Point Objective): < 1 hour
└─ Test DR drill quarterly
```

---

## 8. LAYER 6: Monitoring & Incident Response

### 8.1 Logging and monitoring

```javascript
// src/services/logging.js

const winston = require('winston')

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'smartanalyst-api' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'audit.log', level: 'audit' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
})

// Audit logging (CRITICAL for compliance)
function auditLog(action, userId, resourceType, resourceId, details) {
  logger.log({
    level: 'audit',
    timestamp: new Date(),
    action, // 'login', 'access', 'modify', 'delete'
    userId,
    resourceType,
    resourceId,
    details,
    ip: requestIP,
    userAgent: request.headers['user-agent']
  })
}

// Usage
auditLog('access', userId, 'connector', connectorId, { source: 'ga4' })
auditLog('modify', userId, 'report', reportId, { status: 'sent' })
auditLog('delete', userId, 'workspace', workspaceId, { reason: 'account_closure' })
```

### 8.2 Security alerts

```javascript
// src/services/securityAlerts.js

async function monitorSecurityEvents() {
  // Alert if:
  
  // 1. Multiple failed login attempts
  if (failedAttempts > 5) {
    sendAlert('SECURITY: Brute force attempt detected', { ip, email })
    blockIP(ip, 1) // Block for 1 hour
  }
  
  // 2. Unusual activity pattern
  const activity = await getRecentActivity(userId)
  if (activity.loginLocations.length > 3) { // 3+ locations in 1 hour
    sendAlert('SECURITY: Impossible travel detected', { userId, locations })
  }
  
  // 3. Bulk data access
  if (metricsAccessed > 100000 && requestSize > 100) {
    sendAlert('SECURITY: Bulk data extraction attempt', { userId, rowsAccessed })
  }
  
  // 4. Administrative action
  auditLog('admin_action', adminId, 'user_management', userId, { action: 'suspended' })
  
  // 5. Configuration change
  if (securityConfigChanged) {
    sendAlert('SECURITY: Security config modified', { changedBy, changes })
    requiresApproval() // Require second admin approval
  }
}
```

---

## 9. OWASP Top 10 Mitigation

```
OWASP #1: Broken Access Control
├─ Mitigation: RLS policies, RBAC, audit logs
└─ Test: Try to access other workspace data (should fail)

OWASP #2: Cryptographic Failures
├─ Mitigation: TLS 1.3, encryption at rest (Vault), secure key management
└─ Test: Check TLS version (should be 1.3)

OWASP #3: Injection (SQL, XSS, Command)
├─ Mitigation: Parameterized queries, input validation, escaping
└─ Test: Try SQL injection payloads (should be blocked)

OWASP #4: Insecure Design
├─ Mitigation: Threat modeling, security design review, secure defaults
└─ Test: Design review checklist

OWASP #5: Security Misconfiguration
├─ Mitigation: Hardening checklist, automated scanning, least privilege
└─ Test: Run security scanner (nmap, testssl.sh)

OWASP #6: Vulnerable & Outdated Components
├─ Mitigation: npm audit, dependabot, regular updates
└─ Test: npm audit (should show 0 vulnerabilities)

OWASP #7: Authentication Failures
├─ Mitigation: MFA, strong password policy, rate limiting
└─ Test: Try weak password (should be rejected)

OWASP #8: Data Integrity & Confidentiality Failures
├─ Mitigation: Encryption, access controls, audit logs
└─ Test: Check that data is encrypted in database

OWASP #9: Logging & Monitoring Failures
├─ Mitigation: Comprehensive logging, alerting, incident response
└─ Test: Trigger alert scenario (should notify security team)

OWASP #10: SSRF (Server-Side Request Forgery)
├─ Mitigation: Input validation, URL whitelist, network segmentation
└─ Test: Try SSRF payload (should be blocked)
```

---

## 10. RGPD Compliance (Critical for EU market)

### 10.1 Data Protection Principles

```
1. LAWFULNESS: Process data only with explicit consent
   └─ Consent form at signup
   └─ Log consent with timestamp

2. FAIRNESS: Be transparent about data usage
   └─ Privacy policy (clearly written)
   └─ Terms of Service

3. TRANSPARENCY: Tell users what data you collect
   └─ Data collection notice
   └─ Rights explanation (access, deletion, export)

4. PURPOSE LIMITATION: Use data only for stated purposes
   └─ Don't sell data
   └─ Don't use for marketing without consent

5. DATA MINIMIZATION: Collect only what's necessary
   └─ Don't ask for unused data
   └─ Regular audit of collected data

6. ACCURACY: Keep data up-to-date
   └─ Allow users to update their data
   └─ Remove outdated information

7. STORAGE LIMITATION: Don't keep data longer than needed
   └─ Delete data after 7 years
   └─ Comply with retention policies

8. INTEGRITY & CONFIDENTIALITY: Protect data
   └─ Encryption, access controls, monitoring
   └─ Incident response plan
```

### 10.2 User Rights (GDPR Articles)

```javascript
// Right to access (Art. 15)
// User can download their data
POST /api/v1/users/data-export
  → Returns: JSON of all user data + metrics

// Right to deletion (Art. 17)
// "Right to be forgotten"
POST /api/v1/users/delete-account
  → Deletes: user, workspaces, metrics, audit logs
  → Keeps: billing records (tax requirement)

// Right to portability (Art. 20)
// Export data in machine-readable format
POST /api/v1/users/data-portability
  → Returns: CSV/JSON of all user data

// Right to rectification (Art. 16)
// Update personal data
PUT /api/v1/users/profile
  → Update: email, name, preferences

// Right to restrict processing (Art. 18)
// "Don't use my data for X"
POST /api/v1/users/restrict-processing
  → Restrict: marketing, analytics, sharing

// Right to object (Art. 21)
// Opt-out of processing
POST /api/v1/users/opt-out
  → Opt-out: marketing emails, analytics

// Right to lodge complaint
// Provide DPA contact in privacy policy
```

### 10.3 Data Processing Agreement (DPA)

```
If SmartAnalyst processes customer data on behalf of users:
├─ DPA required (GDPR Art. 28)
├─ Must specify: data processing, security measures, sub-processors
└─ Available for download: /legal/dpa.pdf

Required clauses:
├─ Data processing scope
├─ Security obligations
├─ Sub-processor approval
├─ Data subject rights
├─ Incident notification
└─ Audit rights
```

---

## Summary: Security checklist

```
BEFORE PRODUCTION:

Authentication:
□ JWT with 15min expiration
□ Refresh tokens with 7day expiration
□ MFA enabled (TOTP)
□ Password complexity enforced (12+ chars)
□ Rate limiting on login (5 attempts/min)

Authorization:
□ RLS enabled on ALL tables
□ RBAC implemented (admin/editor/viewer)
□ Service role key never exposed to frontend
□ Least privilege principle applied

Data Protection:
□ TLS 1.3 enforced
□ Encryption at rest (Vault)
□ Sensitive data masked in responses
□ Audit logging implemented

Infrastructure:
□ SSH hardened (key-based only)
□ Firewall configured (UFW)
□ Fail2Ban enabled
□ Security updates automated

Monitoring:
□ Centralized logging (winston)
□ Security alerts configured
□ Incident response plan documented
□ Quarterly DR drill scheduled

Compliance:
□ Privacy policy published
□ Terms of Service published
□ Consent mechanism at signup
□ Data export working
□ Account deletion working
□ GDPR responses within 30 days

Testing:
□ Penetration test scheduled
□ OWASP Top 10 tested
□ Security scanner passed (nmap, testssl.sh)
□ npm audit showing 0 vulnerabilities
□ Code review for secrets (git-secrets)
```

---

*Dernière mise à jour : Mai 2025*
