# 07_API_AUTH_CONNEXION.md

## Vue d'ensemble
Tous les endpoints d'authentification et JWT handling. Signup, login, password reset, OAuth callbacks, refresh tokens.

**Pour qui:** Backend API developers.

---

## 1. Signup (Email + Password, no CC)

### Endpoint
```
POST /api/v1/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password",
  "organization_name": "My Agency"
}
```

### Implementation

```javascript
// src/routes/auth.routes.js

router.post('/signup', [
  body('email').isEmail(),
  body('password').isLength({ min: 12 }),
  body('organization_name').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }

  const { email, password, organization_name } = req.body

  try {
    // 1. Create auth user (Supabase Auth)
    const { user, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.APP_URL}/auth/callback`
      }
    })

    if (authError) throw authError

    // 2. Create organization record
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        owner_id: user.id,
        email,
        name: organization_name,
        plan: 'trial'
      })
      .select()
      .single()

    if (orgError) throw orgError

    // 3. Create first workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({
        organization_id: org.id,
        name: organization_name
      })
      .select()
      .single()

    // 4. Add user as workspace member
    await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'admin',
        accepted_at: new Date()
      })

    // 5. Send confirmation email (Resend)
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Confirme ton compte SmartAnalyst',
      html: `Clique ici pour confirmer: ${process.env.APP_URL}/auth/callback`
    })

    res.status(201).json({
      message: 'Signup successful. Check your email to confirm.',
      workspaceId: workspace.id
    })
  } catch (error) {
    logger.error('Signup failed', { email, error: error.message })
    res.status(400).json({ error: error.message })
  }
})
```

---

## 2. Login (JWT + Refresh Token)

### Endpoint
```
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password"
}

Response:
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com"
  },
  "workspaces": [
    { "id": "ws-uuid", "name": "Client 1", "role": "admin" }
  ]
}
```

### Implementation

```javascript
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const { email, password } = req.body

  try {
    // 1. Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) throw error

    const { user, session } = data

    // 2. Generate our JWT (for API auth)
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    )

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        type: 'refresh'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    // 3. Get user's workspaces
    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, organization_id)')
      .eq('user_id', user.id)

    // 4. Log login attempt
    await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: 'login',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      })

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email },
      workspaces: memberships.map(m => ({
        id: m.workspaces.id,
        name: m.workspaces.name,
        role: m.role
      }))
    })
  } catch (error) {
    logger.warn('Login failed', { email, error: error.message })
    res.status(401).json({ error: 'Invalid credentials' })
  }
})
```

---

## 3. Refresh Token

### Endpoint
```
POST /api/v1/auth/refresh
{
  "refreshToken": "eyJ..."
}
```

### Implementation

```javascript
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' })
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET)

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' })
    }

    // Generate new access token
    const accessToken = jwt.sign(
      {
        sub: decoded.sub,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    )

    res.json({ accessToken })
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
})
```

---

## 4. Logout

### Endpoint
```
POST /api/v1/auth/logout
Header: Authorization: Bearer {accessToken}
```

### Implementation

```javascript
router.post('/logout', jwtMiddleware, async (req, res) => {
  const { user } = req

  // Log logout
  await supabase
    .from('audit_logs')
    .insert({
      user_id: user.id,
      action: 'logout'
    })

  res.json({ message: 'Logged out successfully' })
})
```

---

## 5. JWT Middleware

```javascript
// src/middleware/jwt.middleware.js

function jwtMiddleware(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' })
  }

  const token = authHeader.substring(7)

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' })
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email
    }

    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' })
    }
    res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = jwtMiddleware
```

---

## 6. Password Reset

### Endpoint 1: Request reset
```
POST /api/v1/auth/password-reset
{
  "email": "user@example.com"
}
```

### Endpoint 2: Confirm reset
```
POST /api/v1/auth/password-reset/confirm
{
  "token": "reset-token-from-email",
  "newPassword": "new-secure-password"
}
```

---

## 7. OAuth Callbacks (Google, Meta)

### Endpoint
```
GET /api/v1/auth/oauth/callback?code=google-code&source=google
```

### Implementation

```javascript
router.get('/oauth/callback', async (req, res) => {
  const { code, source, state, error } = req.query

  if (error) {
    return res.redirect(`${process.env.APP_URL}/?error=${error}`)
  }

  try {
    let tokens
    
    if (source === 'google') {
      // Exchange code for Google tokens
      tokens = await googleOAuth.getTokens(code)
    } else if (source === 'meta') {
      // Exchange code for Meta tokens
      tokens = await metaOAuth.getTokens(code)
    }

    // Determine if this is connector setup or organization login
    // (depending on flow initiated by user)

    res.redirect(`${process.env.APP_URL}/onboarding/connector-connected`)
  } catch (error) {
    logger.error('OAuth callback failed', { source, error: error.message })
    res.redirect(`${process.env.APP_URL}/?error=oauth_failed`)
  }
})
```

---

## 8. Session Management

```javascript
// Get current session
// Frontend calls this on app startup to restore session

router.get('/session', jwtMiddleware, async (req, res) => {
  const user = req.user

  // Get user's active workspaces
  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id)

  res.json({
    user,
    workspaces: workspaces.map(w => ({
      id: w.workspaces.id,
      name: w.workspaces.name,
      role: w.role
    }))
  })
})
```

---

## Checklist pré-launch

- [ ] Rate limiting on login (5 attempts/15min)
- [ ] Password requirements enforced (min 12 chars)
- [ ] Tokens in HTTPS only (Secure cookie flag)
- [ ] CORS configured strictly
- [ ] JWT secret is 64+ random characters
- [ ] Refresh token rotation (optional, for high-security)
- [ ] Email verification required before full access
- [ ] 2FA support (future, skeleton in place)
- [ ] Session timeout (15min inactivity)
- [ ] Logout clears frontend storage

---
