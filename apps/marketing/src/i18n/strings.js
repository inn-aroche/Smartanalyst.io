// Centralized UI strings for nav + footer.
// Per-page content lives in each page file (it's bigger and tightly coupled to layout).

export const LOCALES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export const STRINGS = {
  en: {
    nav: {
      features: 'Features',
      useCases: 'Use cases',
      product: 'Product',
      pricing: 'Pricing',
      security: 'Security',
      resources: 'Resources',
      cta: 'Request early access',
    },
    footer: {
      copyright: (year) => `© ${year} SmartAnalyst. All rights reserved.`,
      privacy: 'Privacy',
      terms: 'Terms',
      contact: 'Contact',
    },
  },
  fr: {
    nav: {
      features: 'Fonctionnalités',
      useCases: 'Cas d’usage',
      product: 'Produit',
      pricing: 'Tarifs',
      security: 'Sécurité',
      resources: 'Ressources',
      cta: 'Demander un accès',
    },
    footer: {
      copyright: (year) => `© ${year} SmartAnalyst. Tous droits réservés.`,
      privacy: 'Confidentialité',
      terms: 'CGU',
      contact: 'Contact',
    },
  },
};

// Pages now live at /<locale>/<path> for all locales (prefixDefaultLocale: true).
// Root '/' is a redirect page that picks the user's language.
export function localizedPath(path, locale) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (clean === '/') return `/${locale}`;
  // Anchor-only paths like '/#cta' should preserve the anchor on the locale home
  if (clean.startsWith('/#')) return `/${locale}${clean.slice(1)}`;
  return `/${locale}${clean}`;
}

// Strip the leading /locale segment and return the path that's "shared" across locales
// (e.g. '/en/pricing' → '/pricing', '/fr' → '/').
export function stripLocale(pathname) {
  const p = pathname.replace(/\/$/, '') || '/';
  const m = p.match(/^\/(en|fr)(\/.*)?$/);
  if (!m) return p;
  return m[2] || '/';
}

// Build the URL of the current page in another locale.
export function switchLocalePath(pathname, targetLocale) {
  const inner = stripLocale(pathname);
  if (inner === '/') return `/${targetLocale}`;
  return `/${targetLocale}${inner}`;
}

// Detect locale from a pathname (used in components that don't always get a prop).
export function detectLocale(pathname) {
  const m = pathname.match(/^\/(en|fr)(\/|$)/);
  return m ? m[1] : 'en';
}
