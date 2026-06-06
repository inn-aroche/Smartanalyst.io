// Webhooks publics (signés cryptographiquement par le provider).
//
// IMPORTANT: ces routes sont montées AVANT le body parser JSON global dans
// app.js — la signature Stripe s'évalue sur le body brut (Buffer), pas sur
// l'objet parsé. Tout middleware qui consomme le body avant la signature
// invalide le check.

const express = require('express')
const { logger } = require('../lib/logger')
const stripeWebhook = require('../services/billing/stripe-webhook.service')

const router = express.Router()

router.post(
  '/stripe',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const signature = req.header('stripe-signature')
    if (!signature) {
      logger.warn({ event: 'stripe_webhook_missing_signature' })
      return res.status(400).json({ error: 'missing_signature' })
    }

    let event
    try {
      event = stripeWebhook.constructEvent(req.body, signature)
    } catch (err) {
      // Stripe re-essaie sur 4xx ? Non — sur 4xx il marque l'event comme failed et
      // ne re-livre pas. Sur 5xx il re-livre. Ici signature KO = volontaire 400.
      logger.warn(
        { event: 'stripe_webhook_invalid_signature', error: err.message },
        'Stripe webhook signature verification failed',
      )
      return res.status(400).json({ error: 'invalid_signature' })
    }

    try {
      const result = await stripeWebhook.handleEvent(event)
      return res.status(200).json({ received: true, ...result })
    } catch (err) {
      logger.error(
        {
          event: 'stripe_webhook_handler_failed',
          type: event.type,
          stripeEventId: event.id,
          error: err.message,
          stack: err.stack,
        },
        'Stripe webhook handler failed',
      )
      // 500 → Stripe va re-livrer (backoff exponentiel jusqu'à 3 jours). L'INSERT
      // billing_events a déjà eu lieu si la persistence a fonctionné, donc le
      // re-play retombera sur "duplicate: true" → safe.
      return res.status(500).json({ error: 'handler_failed' })
    }
  },
)

module.exports = router
