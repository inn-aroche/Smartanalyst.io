// Single source of truth for plans, prices, and quotas.
// Consumed by: marketing site (pricing page), api (billing/gating), web (UI badges).
// If you change a number here, it changes everywhere — do not duplicate.
//
// Reference: docs/00_BRIEF_EXECUTIF.md § "Les 4 plans"

export const PLANS = Object.freeze({
  FREE: {
    id: 'free',
    label: 'Découverte',
    tagline: 'Pour découvrir le produit sans engagement',
    priceEurMonth: 0,
    stripePriceEnv: null,
    quotas: {
      clients: 1,
      connectors: 1,
      insightsPerMonth: 3,
      autoSendReports: false,
      whiteLabel: 'none', // "Propulsé par SmartAnalyst" visible
    },
  },
  STARTER: {
    id: 'starter',
    label: 'Starter',
    tagline: 'Pour le freelance ou la TPE qui pilote son marketing',
    priceEurMonth: 99,
    stripePriceEnv: 'STRIPE_PRICE_STARTER',
    quotas: {
      clients: 5,
      connectors: 3,
      insightsPerMonth: 100,
      autoSendReports: true,
      whiteLabel: 'logo', // logo uniquement
    },
  },
  PRO: {
    id: 'pro',
    label: 'Pro',
    tagline: 'Pour l’agence qui gère 5 à 20 clients',
    priceEurMonth: 199,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
    quotas: {
      clients: 20,
      connectors: 'all_p1', // tous les connecteurs P1 (GA4, Meta, Google Ads, Stripe, Search Console)
      insightsPerMonth: 500,
      autoSendReports: true,
      whiteLabel: 'logo_colors', // logo + couleurs
    },
    featured: true,
  },
  AGENCY: {
    id: 'agency',
    label: 'Agence',
    tagline: 'Pour les agences avec un portefeuille illimité',
    priceEurMonth: 399,
    stripePriceEnv: 'STRIPE_PRICE_AGENCY',
    quotas: {
      clients: Infinity,
      connectors: 'all',
      insightsPerMonth: Infinity,
      autoSendReports: true,
      whiteLabel: 'full', // marque blanche complète
    },
  },
});

export const PLAN_ORDER = ['FREE', 'STARTER', 'PRO', 'AGENCY'];

// 14 jours gratuit, toutes features, pas de CB requise.
// Reference: docs/00_BRIEF_EXECUTIF.md § "Les 4 plans" → "Trial"
export const TRIAL_DAYS = 14;
export const TRIAL_REQUIRES_CARD = false;

export function getPlanById(id) {
  return Object.values(PLANS).find((p) => p.id === id) ?? null;
}

// Helper for display: turn Infinity into "Illimité" without leaking JS quirks into templates.
export function formatQuota(value) {
  if (value === Infinity) return 'Illimité';
  if (value === 'all_p1') return 'Tous (P1)';
  if (value === 'all') return 'Tous';
  return String(value);
}

export function formatWhiteLabel(level) {
  switch (level) {
    case 'none':
      return 'Logo SmartAnalyst visible';
    case 'logo':
      return 'Votre logo';
    case 'logo_colors':
      return 'Logo + couleurs';
    case 'full':
      return 'Marque blanche complète';
    default:
      return level;
  }
}
