// Stripe webhook service — vérification signature + idempotence + handlers
// métier (cahier §3 Lot 3).
//
// Contrat:
//   - constructEvent(rawBody, signature) : valide HMAC Stripe, lève si KO.
//   - handleEvent(event) : INSERT ON CONFLICT DO NOTHING dans billing_events,
//     dispatch vers un handler par type, marque processed_at à la fin.
//
// Idempotence: si Stripe re-livre le même event.id, l'INSERT échoue sur la
// contrainte unique (PG code 23505) → on retourne { duplicate: true } sans
// rejouer le handler.
//
// Handlers métier (Lot 3) :
//   - checkout.session.completed       → lie stripe_customer_id à l'organization
//   - customer.subscription.created    → set organizations.plan + upsert subscriptions
//   - customer.subscription.updated    → idem (upgrade/downgrade)
//   - customer.subscription.deleted    → revient à plan 'free'
//   - invoice.payment_failed           → notification in-app (dunning soft) + log
//   - invoice.paid                     → no-op (purement informatif)

const Stripe = require('stripe')
const { logger } = require('../../lib/logger')
const { getServiceRoleClient } = require('../../lib/supabase')
const notificationCenter = require('../notifications/notification-center.service')

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
      {
        event: 'stripe_webhook_insert_failed',
        stripeEventId: event.id,
        error: insertError.message,
      },
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
// Handlers métier (cahier §3 Lot 3). Tout est idempotent : un même
// stripe_event_id ne re-passe jamais ici (court-circuité par billing_events
// UNIQUE), donc on peut faire des INSERT/UPDATE sans set de garde-fou
// supplémentaire au sein du handler.

async function _dispatch(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      return _onCheckoutCompleted(event)
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return _onSubscriptionUpsert(event)
    case 'customer.subscription.deleted':
      return _onSubscriptionDeleted(event)
    case 'invoice.payment_failed':
      return _onInvoicePaymentFailed(event)
    case 'invoice.paid':
    case 'invoice.finalized':
      // Informatif — pas d'action métier en MVP (le user voit l'historique
      // dans le Customer Portal Stripe).
      return
    default:
      logger.debug(
        { event: 'stripe_webhook_ignored', type: event.type, stripeEventId: event.id },
        `Stripe webhook ${event.type} ignored`,
      )
  }
}

// Mapping price_id Stripe → plan canonique. Driven par l'env pour qu'on
// puisse changer les prix sans déploiement code.
function _planFromPriceId(priceId) {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_AGENCY) return 'agency'
  return null
}

async function _findOrgByCustomerId(supabase, stripeCustomerId) {
  if (!stripeCustomerId) return null
  const { data } = await supabase
    .from('organizations')
    .select('id, plan')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle()
  return data || null
}

/**
 * Au moment du checkout réussi, on lie le stripe_customer_id à l'organization
 * (passée en client_reference_id côté création de session). C'est la 1ère fois
 * où on connaît le customer Stripe d'une org — on l'épingle pour que tous les
 * webhooks suivants soient routables.
 */
async function _onCheckoutCompleted(event) {
  const session = event.data.object || {}
  const stripeCustomerId = session.customer
  const orgId = session.client_reference_id || session.metadata?.organization_id
  if (!stripeCustomerId || !orgId) {
    logger.warn(
      {
        event: 'stripe_checkout_unrouted',
        stripeEventId: event.id,
        hasCustomer: Boolean(stripeCustomerId),
        hasOrg: Boolean(orgId),
      },
      'checkout.session.completed without customer or org reference',
    )
    return
  }
  const supabase = getServiceRoleClient()
  await supabase
    .from('organizations')
    .update({ stripe_customer_id: stripeCustomerId })
    .eq('id', orgId)
  logger.info(
    { event: 'stripe_customer_linked', orgId, stripeCustomerId },
    'Linked Stripe customer to organization',
  )
}

/**
 * Met à jour le plan de l'organization + upsert la ligne subscriptions à
 * partir d'un objet `subscription` Stripe. Géré pour created ET updated
 * (upgrade/downgrade) — Stripe envoie les deux selon le contexte.
 */
async function _onSubscriptionUpsert(event) {
  const sub = event.data.object || {}
  const stripeCustomerId = sub.customer
  const priceId = sub.items?.data?.[0]?.price?.id || null
  const plan = _planFromPriceId(priceId)
  const status = sub.status // 'active' | 'past_due' | 'canceled' | 'trialing' | ...
  const supabase = getServiceRoleClient()

  const org = await _findOrgByCustomerId(supabase, stripeCustomerId)
  if (!org) {
    logger.warn(
      { event: 'stripe_sub_unrouted', stripeEventId: event.id, stripeCustomerId },
      'subscription event for unknown customer (org not found)',
    )
    return
  }

  // Upsert subscriptions row keyed by stripe_subscription_id.
  await supabase.from('subscriptions').upsert(
    {
      organization_id: org.id,
      stripe_subscription_id: sub.id,
      stripe_customer_id: stripeCustomerId,
      stripe_price_id: priceId,
      plan: plan || org.plan || 'free',
      status,
      current_period_start: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
    },
    { onConflict: 'stripe_subscription_id' },
  )

  // Met à jour le plan de l'org SI active. Si past_due/canceled, on ne
  // downgrade pas immédiatement : on attend `customer.subscription.deleted`
  // pour basculer en 'free'.
  if (plan && (status === 'active' || status === 'trialing')) {
    await supabase.from('organizations').update({ plan }).eq('id', org.id)
    logger.info(
      { event: 'stripe_plan_changed', orgId: org.id, fromPlan: org.plan, toPlan: plan },
      'Organization plan updated',
    )
  }
}

async function _onSubscriptionDeleted(event) {
  const sub = event.data.object || {}
  const supabase = getServiceRoleClient()
  const org = await _findOrgByCustomerId(supabase, sub.customer)
  if (!org) return
  await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', sub.id)
  await supabase.from('organizations').update({ plan: 'free' }).eq('id', org.id)
  logger.info(
    { event: 'stripe_plan_downgraded_to_free', orgId: org.id, stripeSubId: sub.id },
    'Subscription deleted — organization back to free',
  )
}

/**
 * Échec de paiement : on log + on notifie in-app. Pas de retry automatique
 * côté code — Stripe gère le smart retry au niveau de l'invoice (configurable
 * dans le dashboard Stripe → Billing → Settings).
 */
async function _onInvoicePaymentFailed(event) {
  const invoice = event.data.object || {}
  const supabase = getServiceRoleClient()
  const org = await _findOrgByCustomerId(supabase, invoice.customer)
  if (!org) return
  // Trouve un workspace de l'org pour adresser la notif (workspace-scoped).
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .eq('organization_id', org.id)
    .limit(1)
  const workspaceId = workspaces?.[0]?.id
  if (!workspaceId) {
    logger.warn(
      { event: 'stripe_payment_failed_no_workspace', orgId: org.id },
      'invoice.payment_failed but no workspace to notify',
    )
    return
  }
  // Calcul des jours de grâce restants pour le message.
  const sub = await supabase
    .from('subscriptions')
    .select('current_period_end')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then((r) => r.data)
    .catch(() => null)
  const GRACE_DAYS = 7
  let graceMsg = ''
  if (sub?.current_period_end) {
    const deadline = new Date(new Date(sub.current_period_end).getTime() + GRACE_DAYS * 86_400_000)
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000))
    graceMsg = ` Tu as ${daysLeft} jour${daysLeft > 1 ? 's' : ''} pour régulariser avant la suspension de ton plan.`
  }

  await notificationCenter
    .createNotification({
      workspaceId,
      type: 'system',
      severity: 'critical',
      title: 'Échec de paiement',
      body: `Le règlement de ton abonnement a échoué. Mets à jour ton moyen de paiement dans Réglages → Plan & facturation.${graceMsg}`,
      link: '/settings?tab=billing',
      meta: {
        invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        action: 'update_payment_method',
      },
    })
    .catch(() => null)
  logger.warn(
    {
      event: 'stripe_payment_failed',
      orgId: org.id,
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
    },
    'Stripe invoice payment failed — user notified',
  )
}

module.exports = { constructEvent, handleEvent }
