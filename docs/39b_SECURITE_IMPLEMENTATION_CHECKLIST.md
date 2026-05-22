# 39b_SECURITE_IMPLEMENTATION_CHECKLIST.md

## Vue d'ensemble

**Checklist complète et testable** pour valider la sécurité avant production.

**Pour qui:** Security team, DevOps, QA, CTOs

**Processus:** Cocher chaque item + documenter avec preuves + signer avant launch

---

## SECTION 1: Authentication & Session Management

### 1.1 Password Policy

```
□ Password minimum length: 12 characters
   Proof: Test creating account with 11-char password (should fail)
   
□ Password complexity required: uppercase, lowercase, number, special char
   Proof: Regex pattern in code shows: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/
   
□ Password not stored in plaintext
   Proof: SELECT password_hash FROM users WHERE email = 'test@test.com'
         → Should show hash (bcrypt or similar)
         → NOT show plaintext
   
□ Password hash uses strong algorithm
   Proof: Code uses bcrypt.hash() with salt rounds >= 12
   
□ Prevent password reuse (last 5 passwords)
   Proof: ALTER TABLE users ADD COLUMN password_history JSON
         When updating password, store hash in history
         
□ Passwords expire (optional but recommended)
   Proof: If implemented: ALTER TABLE users ADD COLUMN password_last_changed TIMESTAMPTZ
         Logic: password_last_changed < NOW() - INTERVAL '90 days' → force reset
```

### 1.2 JWT Security

```
□ Access token expiration: 15 minutes
   Proof: code shows exp = now + 15min
   Test: Generate token, wait 16 min, try to use → should fail (401)
   
□ Refresh token expiration: 7 days
   Proof: code shows refresh exp = now + 7 days
   Test: Generate refresh token, wait 8 days, try to refresh → should fail
   
□ Refresh tokens NOT stored in localStorage (XSS vulnerable)
   Proof: Stored in secure httpOnly cookie with SameSite=Strict
   Check: document.cookie should NOT show refresh_token (if in localStorage, fail)
   
□ Access tokens signed with strong key
   Proof: JWT_SECRET >= 32 characters, random, never committed to git
   Check: git log --all -S "JWT_SECRET" (should show NO commits with secret)
   
□ JTI (JWT ID) used for refresh tokens (prevent token reuse)
   Proof: payload includes jti: crypto.randomBytes(16).toString('hex')
          Refresh token JTI tracked in DB
          Using same refresh token twice → second use fails
   Test: Use refresh token, get new token
         Try to use OLD refresh token again → should fail (401 or 403)
```

### 1.3 MFA (Multi-Factor Authentication)

```
□ TOTP (Time-based One-Time Password) implemented
   Proof: speakeasy library used, secret stored in user record
   
□ MFA mandatory for admin accounts
   Proof: ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT false
         Admin role requires mfa_enabled = true
         
□ Backup codes generated and stored securely
   Proof: 10 single-use backup codes generated during MFA setup
         Codes shown ONCE during setup
         Stored as hashed values (NOT plaintext)
         
□ MFA code has 30-second validity window (2x 30sec for drift)
   Proof: speakeasy.totp.verify() called with window: 2
   Test: Enter MFA code, wait 35 seconds, try again → should fail
   
□ Backup codes cannot be brute-forced
   Proof: Failed MFA attempts trigger rate limiting
   Test: 5 failed MFA attempts → account locked for 15 min
```

### 1.4 Session Management

```
□ Sessions stored in secure database (NOT in-memory)
   Proof: SELECT * FROM sessions WHERE user_id = 'xxx'
         Shows: session_id, user_id, created_at, expires_at, ip_address
         
□ Session timeout: 1 hour of inactivity
   Proof: SELECT * FROM sessions WHERE created_at < NOW() - INTERVAL '1 hour'
         → These sessions are deleted
         
□ Concurrent sessions limited to 3 per user
   Proof: SELECT COUNT(*) FROM sessions WHERE user_id = 'xxx'
         → If > 3, oldest session is logged out
         
□ Session hijacking prevention: IP address tracking
   Proof: CREATE TABLE sessions (ip_address INET)
         On request: if current IP != session.ip_address → log warning/logout
         
□ Session data doesn't contain sensitive info
   Proof: SELECT * FROM sessions WHERE user_id = 'xxx'
         Should NOT show: password, API keys, credit card numbers
```

---

## SECTION 2: Authorization & Access Control

### 2.1 Row-Level Security (RLS)

```
□ RLS enabled on ALL sensitive tables
   Tables to check:
   □ agencies
   □ workspaces
   □ workspace_members
   □ connectors
   □ reports
   □ canonical_metrics
   □ audit_log
   
   Proof: SELECT schemaname, tablename, rowsecurity 
          FROM pg_tables WHERE schemaname = 'public'
          → All should have rowsecurity = true

□ RLS policies prevent data leakage
   Test: Login as User A, try to access User B's workspace → should fail
   
   SQL test:
   -- As User A
   SELECT * FROM workspaces WHERE workspace_id = 'workspace-B'
   → Should return 0 rows (403 or empty result)
   
□ service_role key never exposed to client
   Proof: grep -r "SUPABASE_SERVICE_KEY" src/
           → Should return 0 results in frontend code
           → Should ONLY appear in backend .env
           
□ RLS policies test for workspace membership
   Proof: Policy shows:
   WHERE workspace_id IN (
     SELECT workspace_id FROM workspace_members
     WHERE user_id = auth.uid()
   )
```

### 2.2 RBAC (Role-Based Access Control)

```
□ Roles defined: admin, editor, viewer
   Proof: ALTER TABLE workspace_members ADD COLUMN role VARCHAR
          Check enum: ENUM('admin', 'editor', 'viewer')
          
□ Admin can: read, create, update, delete all workspace data
   Test: As admin, perform CRUD operations → all succeed
   
□ Editor can: read, create, update (no delete)
   Test: As editor, try DELETE → should fail (403 Forbidden)
         Try UPDATE → should succeed (200 OK)
         
□ Viewer can: read only
   Test: As viewer, try UPDATE → should fail (403)
         Try SELECT → should succeed (200)
         
□ Role enforcement in API
   Proof: Every protected endpoint checks user role
   Example:
   if (userRole !== 'admin') {
     throw new ForbiddenException('Admin role required')
   }
```

### 2.3 Resource-level Authorization

```
□ Users can only access their own profile
   Test: User A tries to access User B's profile → 403 Forbidden
   
□ Users can only modify their own settings
   Test: User A tries to PUT /api/v1/users/user-B/settings → 403
   
□ API keys cannot be accessed in plaintext after creation
   Proof: POST /api/v1/api-keys/generate returns: { key: "xxx...7 chars" }
          (last 7 chars only, for verification)
          Full key stored encrypted in DB
          
□ Sensitive endpoints require additional verification
   Example: Deleting workspace
   □ Require password re-entry
   □ Require MFA code
   □ Send confirmation email with 24h expiration link
```

---

## SECTION 3: Data Protection & Encryption

### 3.1 Encryption in Transit

```
□ TLS 1.3 enforced
   Proof: testssl.sh api.smartanalyst.io
         Shows: TLS 1.3 ONLY (no TLS 1.2, 1.1, 1.0)
         
□ Certificate from trusted CA (Let's Encrypt)
   Proof: Certificate chain shows:
         - Leaf cert: api.smartanalyst.io
         - Intermediate: Let's Encrypt Authority X3
         - Root: ISRG Root X1
         
□ HSTS enabled (minimum 1 year)
   Proof: curl -I https://api.smartanalyst.io
         Headers show: Strict-Transport-Security: max-age=31536000
         
□ No HTTP access (all traffic upgraded to HTTPS)
   Test: curl -I http://api.smartanalyst.io
        → Should redirect to HTTPS (301 or 308)
        
□ Certificate pinning (optional, for mobile apps)
   Proof: If mobile app implemented:
         Cert hash pinned in app
         Certificate rotation tested without breaking app
```

### 3.2 Encryption at Rest

```
□ API keys encrypted in database
   Proof: Supabase Vault used
         SELECT access_token FROM connectors LIMIT 1
         → Shows encrypted value (not plaintext)
         
□ Sensitive columns encrypted
   Columns to encrypt:
   □ connectors.access_token
   □ connectors.refresh_token
   □ users.password_hash (already hashed, but verify hashing algorithm)
   □ Any third-party API credentials
   
□ Encryption keys rotated regularly
   Proof: Monthly key rotation scheduled
         Old encrypted data can still be decrypted with old key
         New data encrypted with new key
         
□ Database backup encrypted
   Proof: Supabase automated backups are encrypted
         Test: Download backup, it's not readable plaintext
```

### 3.3 Sensitive Data Handling

```
□ API responses don't leak sensitive data
   Test: GET /api/v1/users/me
        Response should NOT include:
        □ password (any form)
        □ API keys (raw)
        □ refresh_token
        □ session tokens
        
   Response CAN include:
   □ email (masked: us**@example.com)
   □ user_id
   □ preferences
   □ connectors.account_name (not token)
   
□ Error messages don't reveal system details
   ❌ "SQL error: table 'users' not found"
   ✅ "Invalid username or password"
   
   ❌ "File not found: /var/www/html/api.php"
   ✅ "Resource not found"
   
□ Logging doesn't capture sensitive data
   Test: grep -r "password\|token\|secret\|api_key" logs/
         → Should return 0 results
         
   Approved logging:
   ✅ logger.info('User login', { userId, email })
   ❌ logger.info('User login', { password })
   
□ Old API keys invalidated on password change
   Test: Change password, old API keys should stop working
         Existing API key: GET /api/v1/something → 401
```

---

## SECTION 4: Input Validation & Injection Prevention

### 4.1 SQL Injection Prevention

```
□ All database queries use parameterized statements
   ❌ BAD: `SELECT * FROM users WHERE email = '${email}'`
   ✅ GOOD: db.query('SELECT * FROM users WHERE email = $1', [email])
   
   Proof: Grep codebase for suspicious patterns:
         grep -r "WHERE.*=.*\`" src/ → should return 0
         grep -r "SELECT.*\+" src/ → should return 0
         
□ ORM used (Supabase client) prevents SQL injection by default
   Proof: All queries use:
         supabase.from('table').select().eq('column', value)
         → Parameterized by default
         
□ SQL injection test passed
   Test: Login with: admin' OR '1'='1
        → Should fail (not bypass authentication)
```

### 4.2 XSS (Cross-Site Scripting) Prevention

```
□ Input validation: HTML tags escaped
   Test: Create workspace named: <script>alert('XSS')</script>
         → Workspace name stored as escaped string
         → When displayed, shows literal text (not executed)
         
   Proof: Code uses .escape() on user input:
         body('workspace_name').escape()
         
□ Output encoding: Data displayed safely
   If using templates, data should be escaped by default
   Example React: {userInput} is automatically escaped
   Example Handlebars: {{{userInput}}} (triple braces) requires explicit unescaping
   
□ CSP (Content Security Policy) header set
   Proof: curl -I https://api.smartanalyst.io | grep -i "content-security-policy"
         Shows: Content-Security-Policy: default-src 'self'; script-src 'self'
         
□ No inline scripts allowed
   Proof: Page source has NO <script>code here</script>
         All scripts are external files with src=
         
□ XSS payload test
   Test cases:
   □ <script>alert('XSS')</script> → should be escaped
   □ <img src=x onerror=alert('XSS')> → should be escaped
   □ javascript:alert('XSS') → should be rejected
```

### 4.3 CSRF (Cross-Site Request Forgery) Prevention

```
□ CSRF tokens generated for state-changing requests (POST, PUT, DELETE)
   Proof: POST /api/v1/reports/generate includes:
         Body: { workspace_id: '...', csrf_token: 'xyz...' }
         OR
         Header: X-CSRF-Token: xyz...
         
□ SameSite cookie attribute set
   Proof: Set-Cookie header shows:
         Set-Cookie: sessionid=...; SameSite=Strict; HttpOnly
         
□ CSRF token verified on server
   Test: POST with missing/invalid CSRF token → should fail (403)
```

---

## SECTION 5: API Security

### 5.1 Rate Limiting

```
□ Login endpoint rate limited: 5 attempts per minute per IP
   Test: Try login 6 times in 1 minute → 6th fails with 429 Too Many Requests
   
□ General API rate limited: 10 requests per second per user
   Proof: nginx config shows:
         limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s
         
□ Rate limiting bypassed for whitelisted IPs (if applicable)
   Proof: If whitelist exists, check nginx config for:
         geo $limited { ... 0 for whitelist; ... 1 for others; }
```

### 5.2 CORS (Cross-Origin Resource Sharing)

```
□ CORS restricted to allowed origins
   Proof: cors middleware shows:
         origin: ['https://app.smartanalyst.io']
         
□ Credentials allowed only for same-origin
   Proof: credentials: true
         origin: 'https://app.smartanalyst.io'
         (NOT '*')
         
□ Test CORS: Request from different origin should fail
   Test: curl from https://evil.com → should get CORS error
```

### 5.3 API Versioning

```
□ API versioned: /api/v1/
   Proof: All endpoints have /api/v1/ prefix
   
□ Old API versions deprecated with timeline
   Proof: /api/v0/ shows deprecation warning with sunset date
         After sunset date: returns 410 Gone
```

---

## SECTION 6: Infrastructure Security

### 6.1 VPS Hardening

```
□ SSH key-based authentication only
   Proof: /etc/ssh/sshd_config shows:
         PasswordAuthentication no
         PubkeyAuthentication yes
         
□ SSH root login disabled
   Proof: /etc/ssh/sshd_config shows:
         PermitRootLogin no
         
□ Firewall (UFW) enabled
   Proof: ufw status
         Shows: Status: active
         Rules show: 22/tcp, 80/tcp, 443/tcp allowed
         Others: deny
         
□ Fail2Ban installed and enabled
   Proof: systemctl status fail2ban
         Shows: active (running)
         
□ No unnecessary services running
   Proof: netstat -tulpn
         Shows ONLY: SSH (22), HTTP (80), HTTPS (443), PM2 (internal)
         
□ Security updates automated
   Proof: /etc/apt/apt.conf.d/50unattended-upgrades exists
         unattended-upgrades service enabled
```

### 6.2 Database Security

```
□ Database password strong
   Proof: ALTER USER postgres WITH PASSWORD '...'
         Password >= 20 random characters, no dictionary words
         
□ Database connections over SSL/TLS
   Proof: Supabase enforces SSL by default
         Test: psql --version shows SSL is supported
         
□ Database user permissions follow least privilege
   Proof: API user role has ONLY needed permissions:
         GRANT SELECT ON canonical_metrics TO api_user
         (No DROP, TRUNCATE, or ALTER)
         
□ Admin database user separate from app user
   Proof: postgres (admin) != api_user (app)
         App uses api_user account (restricted)
```

### 6.3 Secrets Management

```
□ No secrets in version control
   Proof: git log -p | grep -i "password\|api_key\|secret"
         → Returns 0 results
         
   Proof: .gitignore includes:
         .env
         .env.local
         *.pem
         
□ Environment variables used for secrets
   Proof: .env.example shows template (no real values):
         STRIPE_SECRET_KEY=sk_...
         SUPABASE_SERVICE_KEY=eyJ...
         
□ Secrets never logged
   Proof: Process.env.SECRET_KEY never appears in logs
   
□ Secrets rotated regularly
   Proof: If secret exposed:
         Immediately: revoke old secret
         Generate: new secret
         Update: .env and any external services
         Timestamp documented
```

---

## SECTION 7: Monitoring & Incident Response

### 7.1 Logging

```
□ Centralized logging implemented (Winston)
   Proof: Logs go to:
         /var/log/smartanalyst/error.log
         /var/log/smartanalyst/audit.log
         /var/log/smartanalyst/combined.log
         
□ Audit logging captures:
   □ Who (userId)
   □ What (action)
   □ When (timestamp)
   □ Where (IP address)
   □ Result (success/fail)
   
   Example log entry:
   {
     timestamp: "2025-05-16T10:30:45Z",
     action: "connector_accessed",
     userId: "user-123",
     resourceType: "connector",
     resourceId: "conn-ga4",
     ip: "192.168.1.1",
     userAgent: "Mozilla/5.0...",
     result: "success"
   }
   
□ Logs retained for audit trail (min 1 year)
   Proof: Logs archived to S3 with retention policy
         Only security team can access archived logs
         
□ Log access restricted
   Proof: /var/log/smartanalyst/*.log
         Permissions: 640 (root:adm only)
```

### 7.2 Monitoring & Alerts

```
□ Security alerts configured:
   □ Failed login attempts (> 5/min) → alert
   □ Impossible travel (3+ IPs in 1 hour) → alert
   □ Admin action (role change, deletion) → alert
   □ Bulk data access (> 100k rows) → alert
   □ Configuration change (security settings) → alert
   
   Alert delivery:
   □ Email to security team
   □ Slack notification
   □ PagerDuty escalation if critical
   
□ Uptime monitoring
   Proof: Monitoring tool (UptimeRobot or similar) configured
         Monitors: GET /health → should return 200
         Alert if status != 200 for > 2 minutes
         
□ Performance monitoring
   Proof: Dashboard shows:
         Response times (p50, p95, p99)
         Error rates (4xx, 5xx)
         Database query times
         CPU/memory usage
```

### 7.3 Incident Response

```
□ Incident response plan documented
   Proof: /docs/incident-response.md exists
         Covers:
         □ Detection (how to know)
         □ Containment (stop the bleeding)
         □ Investigation (what happened)
         □ Remediation (fix it)
         □ Post-mortem (prevent recurrence)
         
□ Incident response team designated
   Proof: Team members listed with contact info
         On-call rotation established
         
□ Incident response drill performed quarterly
   Proof: Last drill was: [DATE]
         Scenarios: data breach, DDoS, ransomware
         Time to respond: [MINUTES]
         
□ Backup and restore tested
   Proof: Last restore test: [DATE]
         RTO: 2 hours
         RPO: 30 minutes
         Successfully restored to clean VM
```

---

## SECTION 8: GDPR & Privacy Compliance

### 8.1 Privacy Policy

```
□ Privacy policy published
   Proof: /legal/privacy-policy.pdf accessible
         Language: French + English
         
□ Privacy policy covers:
   □ Data collection (what data)
   □ Data usage (why and how)
   □ Data retention (how long)
   □ Data sharing (with whom)
   □ User rights (access, deletion, export)
   □ DPA contact (data protection authority)
   □ Third-party processors (Stripe, Supabase, Resend)
   
□ Cookie consent banner displayed
   Proof: Visiting app shows cookie consent
         Accept/Reject options
         Consent choice saved
```

### 8.2 User Rights Implementation

```
□ Data export (GDPR Art. 15)
   Endpoint: POST /api/v1/users/data-export
   Test: Export returns JSON of all user data
        Includes: profile, connectors, reports, metrics (sample)
        
□ Data deletion (GDPR Art. 17)
   Endpoint: POST /api/v1/users/delete-account
   Requires: Password confirmation + MFA code
   Test: Delete account
        Verify: user record deleted
        Verify: workspace deleted
        Verify: audit logs retained (for compliance)
        NOT deleted: billing records (tax law)
        
□ Data portability (GDPR Art. 20)
   Endpoint: POST /api/v1/users/data-portability
   Test: Export in CSV format (machine-readable)
         Includes: all user data
         No payment data (processor not covered)
         
□ Rectification (GDPR Art. 16)
   Endpoint: PUT /api/v1/users/profile
   Test: Update email, name, preferences
        Changes reflected immediately
        
□ Restrict processing (GDPR Art. 18)
   Endpoint: POST /api/v1/users/restrict-processing
   Test: Opt-out of specific processing
        Flag set in DB: processing_restricted = true
        
□ Object to processing (GDPR Art. 21)
   Endpoint: POST /api/v1/users/opt-out
   Test: Opt-out of marketing emails
        marketing_opt_in = false
        System respects this flag
```

### 8.3 GDPR Response SLA

```
□ Access request response: 30 days
   Proof: System tracks request date
         Response deadline: request_date + 30 days
         
□ Deletion request: 30 days
   Proof: Delete request tracked
         Deletion deadline: request_date + 30 days
         
□ Data breach notification: 72 hours
   Proof: Incident response plan includes:
         Detect breach → notify DPA within 72h
         Notify users if high risk
         Document: breach date, impact, remediation
```

---

## SECTION 9: Third-Party Security

### 9.1 Third-Party Processor Management

```
□ Stripe (payments)
   Proof: DPA signed with Stripe
         Stripe handles: PCI compliance
         SmartAnalyst handles: NOT storing raw card data (tokenized)
         
□ Supabase (database)
   Proof: DPA signed with Supabase
         Data location: EU (GDPR compliant)
         Encryption: enabled
         
□ Resend (email)
   Proof: DPA signed with Resend
         Email data: transient (not stored long-term)
         
□ Google (GA4 data collection)
   Proof: Google DPA accepted
         Data shared: only aggregated metrics
         User consent: obtained at signup
```

### 9.2 Third-Party Vulnerability Management

```
□ Dependencies scanned regularly
   Proof: npm audit run weekly
         Results: npm-audit-report.json
         Vulnerabilities: CRITICAL = 0, HIGH = 0
         
□ Automatic security updates enabled
   Proof: Dependabot configured
         Creates PR for updates
         Security updates merged within 24h
         
□ Outdated libraries identified
   Proof: npm outdated
         Old versions: updated or removed
         EOL packages: replaced with maintained versions
```

---

## Final Approval Checklist

```
BEFORE PRODUCTION LAUNCH:

□ Security team lead: _________________ Date: _______
  Signature confirms: All items checked, tested, documented
  
□ Infrastructure/DevOps: _________________ Date: _______
  Signature confirms: VPS hardened, monitoring active, backups tested
  
□ Product/CTO: _________________ Date: _______
  Signature confirms: Auth, authorization, encryption implemented
  
□ Legal/Compliance: _________________ Date: _______
  Signature confirms: GDPR compliant, privacy policy published, DPAs signed
  
□ Security audit passed: YES / NO
  External auditor: [if applicable]
  Date: _______
  Findings: [if any]
  Remediation deadline: _______
  
LAUNCH APPROVED: YES / NO
Approved by: _________________
Date: _______
Go-live date: _______
```

---

*Dernière mise à jour : Mai 2025*
