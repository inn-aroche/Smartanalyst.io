// Centralized UI strings for nav + footer.
// Per-page content lives in each page file (it's bigger and tightly coupled to layout).

export const STRINGS = {
  en: {
    nav: {
      features: 'Features',
      useCases: 'Use cases',
      product: 'Product',
      pricing: 'Pricing',
      security: 'Security',
      cta: 'Request early access',
    },
    footer: {
      copyright: (year) => `© ${year} SmartAnalyst. All rights reserved.`,
      privacy: 'Privacy',
      terms: 'Terms',
      contact: 'Contact',
      language: 'English',
    },
    langSwitch: 'FR',
    langSwitchFull: 'Français',
  },
  fr: {
    nav: {
      features: 'Fonctionnalités',
      useCases: 'Cas d’usage',
      product: 'Produit',
      pricing: 'Tarifs',
      security: 'Sécurité',
      cta: 'Demander un accès',
    },
    footer: {
      copyright: (year) => `© ${year} SmartAnalyst. Tous droits réservés.`,
      privacy: 'Confidentialité',
      terms: 'CGU',
      contact: 'Contact',
      language: 'Français',
    },
    langSwitch: 'EN',
    langSwitchFull: 'English',
  },
};

// Locale-aware URL helpers — pages live at /path (en) and /fr/path (fr).
export function localizedPath(path, locale) {
  // Normalize leading slash
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'fr') {
    if (clean === '/') return '/fr';
    return `/fr${clean}`;
  }
  return clean;
}

// Given the current pathname, return the equivalent in the alt locale.
export function altLocalePath(pathname, currentLocale) {
  // Strip trailing slash for comparison, but keep root as '/'.
  const p = pathname.replace(/\/$/, '') || '/';
  if (currentLocale === 'fr') {
    if (p === '/fr') return '/';
    return p.replace(/^\/fr/, '') || '/';
  }
  if (p === '/') return '/fr';
  return `/fr${p}`;
}

// Detect locale from a pathname (used in Nav / Footer that don't always get a prop).
export function detectLocale(pathname) {
  return pathname.startsWith('/fr') ? 'fr' : 'en';
}
