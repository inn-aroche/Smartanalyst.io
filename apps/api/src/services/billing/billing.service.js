// Service Stripe — création de sessions Checkout et Customer Portal.
//
// Cahier §3 Lot 3 (Billing UI). On expose 2 actions :
//   - createCheckoutSession({ orgId, plan, locale, urls }) → URL Stripe
//   - createPortalSession({ orgId, returnUrl }) → URL Customer Portal
//
// Garde-fous :
//   - STRIPE_SECRET_KEY obligatoire (sinon throw CLEAR_ERROR)
//   - Le price_id du plan demandé doit être configuré côté env (STRIPE_PRICE_*)
//   - On stocke org.stripe_customer_id à la 1re fois pour ne pas recréer un
//     customer Stripe à chaque checkout (sinon on retrouve des doublons côté
//     Stripe et le Customer Portal ne montre pas l'historique).

const Stripe = require('stripe')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')

const STRIPE_API_VERSION = '2024-06-20'

class BillingNotConfiguredError extends Error {
  constructor() {
    super('STRIPE_SECRET_KEY not configured.')
    this.code = 'BILLING_NOT_CONFIGURED'
    this.statusCode = 503
  }
}

class BillingPlanUnavailableError extends Error {
  constructor(plan) {
    super(`Stripe price for plan "${plan}" is not configured.`)
    this.code = 'BILLING_PLAN_UNAVAILABLE'
    this.statusCode = 503
  }
}

function _client() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || key.startsWith('sk_test_placeholder') || key === '') {
    throw new BillingNotConfiguredError()
  }
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION })
}

function _priceIdForPlan(plan) {
  const map = {
    pro: process.env.STRIPE_PRICE_PRO,
    starter: process.env.STRIPE_PRICE_STARTER,
    agency: process.env.STRIPE_PRICE_AGENCY,
  }
  const priceId = map[plan]
  if (!priceId) throw new BillingPlanUnavailableError(plan)
  return priceId
}

/**
 * Récupère ou crée le `stripe_customer_id` de l'organization. Idempotent :
 * 2 appels concurrents au pire crééront 2 customers Stripe (qu'on dédupliquera
 * via webhook), mais on évite ça en stockant le 1er créé.
 */
async function _ensureStripeCustomer({ stripe, orgId, email }) {
  const supabase = getServiceRoleClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) {
    const err = new Error('Organization not found')
    err.code = 'ORG_NOT_FOUND'
    err.statusCode = 404
    throw err
  }
  if (org.stripe_customer_id) return org.stripe_customer_id

  const customer = await stripe.customers.create({
    email,
    name: org.name || undefined,
    metadata: { organization_id: orgId },
  })
  await supabase.from('organizations').update({ stripe_customer_id: customer.id }).eq('id', orgId)
  return customer.id
}

/**
 * Crée une Stripe Checkout Session pour faire passer une org du plan free
 * au plan demandé. Retourne l'URL hostée Stripe.
 *
 * @param {object} params
 * @param {string} params.orgId
 * @param {string} params.plan         - 'pro' (MVP), 'starter' | 'agency' (legacy)
 * @param {string} [params.userEmail]  - pour pré-remplir le checkout
 * @param {string} params.successUrl   - URL de retour après paiement OK
 * @param {string} params.cancelUrl    - URL de retour si user annule
 * @returns {Promise<{ url: string, sessionId: string }>}
 */
async function createCheckoutSession({ orgId, plan, userEmail, successUrl, cancelUrl }) {
  const stripe = _client()
  const priceId = _priceIdForPlan(plan)
  const customerId = await _ensureStripeCustomer({ stripe, orgId, email: userEmail })

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: orgId,
    metadata: { organization_id: orgId, plan },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Allow promotion codes (utile si on lance une beta avec une promo).
    allow_promotion_codes: true,
  })

  logger.info(
    {
      event: 'stripe_checkout_session_created',
      orgId,
      plan,
      sessionId: session.id,
      customerId,
    },
    'Stripe Checkout session created',
  )

  return { url: session.url, sessionId: session.id }
}

/**
 * Crée une session Customer Portal pour gérer son abonnement (changer plan,
 * mettre à jour CB, voir factures, annuler).
 *
 * Pré-requis : org doit déjà avoir un stripe_customer_id (pas le cas si elle
 * n'a jamais checkout — dans ce cas on throw NO_CUSTOMER pour que l'UI
 * propose un upgrade plutôt qu'un manage).
 */
async function createPortalSession({ orgId, returnUrl }) {
  const stripe = _client()
  const supabase = getServiceRoleClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!org?.stripe_customer_id) {
    const err = new Error('No Stripe customer for this organization yet')
    err.code = 'NO_CUSTOMER'
    err.statusCode = 404
    throw err
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: returnUrl,
  })
  logger.info(
    { event: 'stripe_portal_session_created', orgId, customerId: org.stripe_customer_id },
    'Stripe Customer Portal session created',
  )
  return { url: session.url }
}

module.exports = {
  createCheckoutSession,
  createPortalSession,
  BillingNotConfiguredError,
  BillingPlanUnavailableError,
}
