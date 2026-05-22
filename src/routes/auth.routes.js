// Auth routes: /api/v1/auth/*
// Source: docs/07_API_AUTH_CONNEXION.md
//
// Pattern: les routes font (1) validation, (2) rate limit, (3) appel service,
// (4) sérialisation réponse. Toute la logique métier vit dans auth.service.

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body, validationResult } = require('express-validator')

const { UserFacingError } = require('../lib/error-handler')
const { jwtMiddleware } = require('../middleware/jwt.middleware')
const authService = require('../services/auth/auth.service')

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

function assertValid(req) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const first = errors.array()[0]
    throw new UserFacingError(first.msg, {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      meta: { field: first.path, errors: errors.array() },
    })
  }
}

// ━━━ POST /signup ━━━
router.post(
  '/signup',
  signupLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Email invalide.')
      .normalizeEmail(),
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
  async (req, res, next) => {
    try {
      assertValid(req)
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
  async (req, res, next) => {
    try {
      assertValid(req)
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
  async (req, res, next) => {
    try {
      assertValid(req)
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

// TODO: password reset (request + confirm) — dépend du service Resend
// TODO: OAuth callbacks (Google, Meta) — déplacés dans connectors.routes pour le flux OAuth connecteur

module.exports = router
