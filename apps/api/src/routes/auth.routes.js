// Auth routes: /api/v1/auth/*
// Source: docs/07_API_AUTH_CONNEXION.md
//
// Pattern: les routes font (1) validation, (2) rate limit, (3) appel service,
// (4) sérialisation réponse. Toute la logique métier vit dans auth.service.

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const authService = require('../services/auth/auth.service')
const googleSigninService = require('../services/auth/google-signin.service')

const router = express.Router()

// Rate limit strict sur /login: 5 tentatives par IP / 15min.
// Source: docs/02 §2.3
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // ne compte que les échecs
  message: {
    error: {
      code: 'RATE_LIMIT',
      message: 'Trop de tentatives. Réessaie dans 15 minutes.',
    },
  },
})

// Rate limit modéré sur /signup: 10 / IP / heure pour éviter le spam d'inscriptions
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT',
      message: 'Trop d’inscriptions depuis cette IP. Réessaie dans 1 heure.',
    },
  },
})

// ━━━ POST /signup ━━━
router.post(
  '/signup',
  signupLimiter,
  [
    body('email').isEmail().withMessage('Email invalide.').normalizeEmail(),
    body('password')
      .isLength({ min: 12 })
      .withMessage('Le mot de passe doit faire au moins 12 caractères.'),
    body('organization_name')
      .trim()
      .notEmpty()
      .withMessage('Le nom de ton organisation est requis.')
      .isLength({ max: 100 })
      .withMessage('Nom d’organisation trop long (100 caractères max).'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await authService.signup({
        email: req.body.email,
        password: req.body.password,
        organizationName: req.body.organization_name,
      })
      res.status(201).json({
        message: 'Inscription réussie. Vérifie ta boîte email pour confirmer ton compte.',
        user: result.user,
        workspaceId: result.workspaceId,
        organizationId: result.organizationId,
      })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /login ━━━
router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Email invalide.').normalizeEmail(),
    body('password').notEmpty().withMessage('Mot de passe requis.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await authService.login({
        email: req.body.email,
        password: req.body.password,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      })
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /refresh ━━━
router.post(
  '/refresh',
  [
    body('refreshToken')
      .exists({ checkFalsy: true })
      .withMessage('Refresh token requis.')
      .bail()
      .isString()
      .withMessage('Refresh token invalide.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await authService.refresh(req.body.refreshToken)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /logout ━━━
router.post('/logout', jwtMiddleware, async (req, res, next) => {
  try {
    await authService.logout({
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })
    res.json({ message: 'Déconnecté.' })
  } catch (err) {
    next(err)
  }
})

// ━━━ GET /me ━━━
router.get('/me', jwtMiddleware, async (req, res, next) => {
  try {
    const session = await authService.getSession(req.user.id)
    res.json({
      user: req.user,
      workspaces: session.workspaces,
    })
  } catch (err) {
    next(err)
  }
})

// ━━━ GET /google/start ━━━
// Returns the Google authorize URL. Frontend calls this then redirects the
// browser to the URL. Optional ?returnTo=<path> is preserved via the state.
router.get('/google/start', (req, res, next) => {
  try {
    const returnTo =
      typeof req.query.returnTo === 'string' ? req.query.returnTo : null
    const { authorizeUrl } = googleSigninService.buildAuthorizeUrl({ returnTo })
    res.json({ authorize_url: authorizeUrl })
  } catch (err) {
    next(err)
  }
})

// ━━━ GET /google/callback ━━━
// Google redirects here after user consent. We exchange the code, sign the
// user in via Supabase, bootstrap a workspace on first login, then redirect
// to the SPA's /auth/callback with our tokens in the URL fragment (#…) so
// they never hit a server log.
router.get('/google/callback', async (req, res, next) => {
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '')

  if (req.query.error) {
    const reason = encodeURIComponent(String(req.query.error))
    return res.redirect(`${appUrl}/auth/callback#error=${reason}`)
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null
  const state = typeof req.query.state === 'string' ? req.query.state : null

  if (!code || !state) {
    return res.redirect(`${appUrl}/auth/callback#error=missing_code_or_state`)
  }

  try {
    const result = await googleSigninService.handleCallback({
      code,
      state,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    const fragment = new URLSearchParams({
      token: result.token,
      refresh_token: result.refreshToken,
      user: JSON.stringify(result.user),
      workspaces: JSON.stringify(result.workspaces),
    })
    if (result.returnTo) fragment.set('return_to', result.returnTo)

    return res.redirect(`${appUrl}/auth/callback#${fragment.toString()}`)
  } catch (err) {
    if (err && err.code && err.statusCode && err.statusCode < 500) {
      const reason = encodeURIComponent(err.code)
      return res.redirect(`${appUrl}/auth/callback#error=${reason}`)
    }
    return next(err)
  }
})

// ━━━ Password reset ━━━
// Rate limit strict : 5 demandes / heure / IP (anti-spam, anti-enumeration).
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Trop de demandes. Attends une heure.' } },
})

// ━━━ POST /auth/password-reset/request ━━━
// Body: { email }
// Réponse 200 systématique (anti-enumeration). Si l'email existe côté
// Supabase Auth, un mail de reset est envoyé.
router.post(
  '/password-reset/request',
  passwordResetLimiter,
  [body('email').isEmail().withMessage('Email invalide.').normalizeEmail()],
  runValidation,
  async (req, res, next) => {
    try {
      await authService.requestPasswordReset({ email: req.body.email })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /auth/password-reset/confirm ━━━
// Body: { accessToken, password } — accessToken vient du fragment d'URL
// après le clic sur le lien de reset envoyé par Supabase.
router.post(
  '/password-reset/confirm',
  [
    body('accessToken').isString().notEmpty().withMessage('Token requis.'),
    body('password')
      .isString()
      .isLength({ min: 12 })
      .withMessage('Mot de passe ≥ 12 caractères.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      await authService.confirmPasswordReset({
        accessToken: req.body.accessToken,
        newPassword: req.body.password,
      })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
