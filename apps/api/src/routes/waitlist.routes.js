// Public waitlist endpoint — POST /api/v1/waitlist
//
// Sans auth (formulaire public sur le site marketing). Rate-limit strict
// par IP pour limiter le spam. Email confirmation via Resend déléguée
// au service.

const express = require('express')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')

const { runValidation } = require('../middleware/validation.middleware')
const waitlistService = require('../services/waitlist/waitlist.service')

const router = express.Router()

// 10 inscriptions max par IP par heure. Assez généreux pour les vrais
// users qui pourraient soumettre 2-3 fois (typo email, ajout d'une info),
// efficace contre le spam de bots.
const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT',
      message: 'Trop d\'inscriptions depuis cette IP. Réessaie dans 1 heure.',
    },
  },
})

router.post(
  '/',
  waitlistLimiter,
  [
    body('email').isEmail().withMessage('Email invalide.').normalizeEmail(),
    body('name')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Nom trop long (100 caractères max).'),
    body('company')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Nom d\'entreprise trop long (100 caractères max).'),
    body('useCase')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description trop longue (500 caractères max).'),
    body('source')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 50 })
      .withMessage('Source trop longue.'),
  ],
  runValidation,
  async (req, res, next) => {
    try {
      const result = await waitlistService.addSignup({
        email: req.body.email,
        name: req.body.name,
        company: req.body.company,
        useCase: req.body.useCase,
        source: req.body.source,
      })
      res.status(201).json({
        message: result.isNew
          ? "Inscription confirmée. On t'envoie un email dès que ton accès est prêt."
          : 'Tes infos ont été mises à jour, merci.',
        id: result.id,
      })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
