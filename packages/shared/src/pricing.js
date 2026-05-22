// Single source of truth for plans, prices, and quotas.
// Consumed by: marketing site (pricing page), api (billing/gating), web (UI badges).
// If you change a number here, it changes everywhere — do not duplicate.

export const PLANS = Object.freeze({
  FREE: {
    id: 'free',
    label: 'Découverte',
    priceEurMonth: 0,
    stripePriceEnv: null,
    quotas: {
      connectors: 1,
      workspacesPerUser: 1,
      questionsPerMonth: 20,
      reportsPerMonth: 1,
      seatsIncluded: 1,
    },
  },
  STARTER: {
    id: 'starter',
    label: 'Starter',
    priceEurMonth: 29,
    stripePriceEnv: 'STRIPE_PRICE_STARTER',
    quotas: {
      connectors: 3,
      workspacesPerUser: 1,
      questionsPerMonth: 200,
      reportsPerMonth: 4,
      seatsIncluded: 1,
    },
  },
  PRO: {
    id: 'pro',
    label: 'Pro',
    priceEurMonth: 79,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
    quotas: {
      connectors: 10,
      workspacesPerUser: 3,
      questionsPerMonth: 1000,
      reportsPerMonth: 20,
      seatsIncluded: 3,
    },
  },
  AGENCY: {
    id: 'agency',
    label: 'Agence',
    priceEurMonth: 199,
    stripePriceEnv: 'STRIPE_PRICE_AGENCY',
    quotas: {
      connectors: 50,
      workspacesPerUser: 25,
      questionsPerMonth: 10000,
      reportsPerMonth: 200,
      seatsIncluded: 10,
    },
  },
});

export const PLAN_ORDER = ['FREE', 'STARTER', 'PRO', 'AGENCY'];

export function getPlanById(id) {
  return Object.values(PLANS).find((p) => p.id === id) ?? null;
}
