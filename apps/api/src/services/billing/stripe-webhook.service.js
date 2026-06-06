// Stripe webhook service — vérification signature + idempotence + dispatch.
//
// Source: docs/10_BILLING_ET_STRIPE.md (à compléter dans le Lot 2 du chantier d'audit
// pour les handlers complets upgrade/downgrade/dunning).
//
// Contrat:
//   - constructEvent(rawBody, signature) : valide HMAC Stripe, lève si KO.
//   - handleEvent(event) : INSERT ON CONFLICT DO NOTHING dans billing_events,
//     dispatch vers un handler par type, marque processed_at à la fin.
//
// Idempotence: si Stripe re-livre le même event.id, l'INSERT échoue sur la
// contrainte unique (PG code 23505) → on retourne { duplicate: true } sans
// rejouer le handler. C'est la garantie demandée par le Lot 1 du chantier.

const Stripe = require('stripe')
const { logger } = require('../../lib/logger')
const { getServiceRoleClient } = require('../../lib/supabase')

const STRIPE_API_VERSION = '2024-06-20'

function _stripeClient() {
  // Pour constructEvent on n'a besoin que de la lib, pas d'une clé valide. Mais
  // l'instanciation Stripe veut une clé non-vide. On utilise la real key si dispo,
  // sinon un placeholder (signe que le webhook n'arrivera de toute façon pas en
  // dev sans STRIPE_WEBHOOK_SECRET).
  return new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
    apiVersion: STRIPE_API_VERSION,
  })
}

function constructEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    const err = new Error('STRIPE_WEBHOOK_SECRET not configured')
    err.code = 'WEBHOOK_SECRET_MISSING'
    throw err
  }
  return _stripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
}

async function handleEvent(event) {
  const supabase = getServiceRoleClient()
  const stripeObject = event.data?.object || {}
  const stripeObjectId = stripeObject.id || null

  // Étape 1 — INSERT (idempotence). Si conflit unique → déjà reçu.
  const { data: inserted, error: insertError } = await supabase
    .from('billing_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      stripe_object_id: stripeObjectId,
      payload: event,
    })
    .select('id')
    .single()

  if (insertError) {
    // 23505 = unique_violation Postgres
    if (insertError.code === '23505') {
      logger.info(
        { event: 'stripe_webhook_duplicate', stripeEventId: event.id, type: event.type },
        'Stripe webhook duplicate — already processed, skipping',
      )
      return { duplicate: true }
    }
    logger.error(
      { event: 'stripe_webhook_insert_failed', stripeEventId: event.id, error: insertError.message },
      'Failed to record stripe webhook event',
    )
    throw insertError
  }

  // Étape 2 — dispatch handler.
  try {
    await _dispatch(event)
    await supabase
      .from('billing_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', inserted.id)
    return { processed: true, id: inserted.id }
  } catch (err) {
    await supabase
      .from('billing_events')
      .update({ error: String(err.message || err).slice(0, 1000) })
      .eq('id', inserted.id)
    throw err
  }
}

// ─── Dispatch ────────────────────────────────────────────────────────────
// Le Lot 1 ne fait que **tracer** l'event de façon idempotente. Les handlers
// métier (upgrade plan, dunning, mail facture) sont planifiés dans le Lot 2.

async function _dispatch(event) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.finalized':
      logger.info(
        {
          event: 'stripe_webhook_received',
          type: event.type,
          stripeEventId: event.id,
          stripeObjectId: event.data?.object?.id,
        },
        `Stripe webhook ${event.type} received (handler TODO Lot 2)`,
      )
      return
    default:
      logger.debug(
        { event: 'stripe_webhook_ignored', type: event.type, stripeEventId: event.id },
        `Stripe webhook ${event.type} ignored`,
      )
  }
}

module.exports = { constructEvent, handleEvent }
