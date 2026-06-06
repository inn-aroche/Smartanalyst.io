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
      login: 'Log in',
      cta: 'Request early access',
    },
    footer: {
      tagline: 'A senior marketing analyst, but typed.',
      copyright: (year) => `© ${year} SmartAnalyst. All rights reserved.`,
      colProduct: 'Product',
      colUseCases: 'Use cases',
      colResources: 'Resources',
      colCompany: 'Company',
      colLegal: 'Legal',
      product: 'Overview',
      pricing: 'Pricing',
      security: 'Security',
      resources: 'Resources hub',
      glossary: 'Marketing glossary',
      blog: 'Blog (coming)',
      guides: 'Guides (coming)',
      contact: 'Contact',
      privacy: 'Privacy',
      terms: 'Terms',
      gdpr: 'GDPR',
      status: 'Status',
      builtWith: 'Built in Paris · EU hosting · GDPR ready',
      cookieSettings: 'Cookie settings',
    },
    consent: {
      title: 'Cookies',
      message:
        'We use cookies to improve your experience and measure how the site is used. You decide what stays on.',
      privacyLink: 'Read our privacy policy',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      customize: 'Customize',
      save: 'Save',
      categories: {
        necessary: {
          label: 'Essential',
          desc: 'Required for the site to work. Always on.',
        },
        analytics: {
          label: 'Analytics',
          desc: 'Helps us understand how visitors use the site.',
        },
        marketing: {
          label: 'Advertising',
          desc: 'Used to personalize ads and measure campaigns.',
        },
      },
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
      login: 'Se connecter',
      cta: 'Demander un accès',
    },
    footer: {
      tagline: 'Un analyste marketing senior, mais en chat.',
      copyright: (year) => `© ${year} SmartAnalyst. Tous droits réservés.`,
      colProduct: 'Produit',
      colUseCases: 'Cas d’usage',
      colResources: 'Ressources',
      colCompany: 'Entreprise',
      colLegal: 'Légal',
      product: 'Vue d’ensemble',
      pricing: 'Tarifs',
      security: 'Sécurité',
      resources: 'Hub Ressources',
      glossary: 'Glossaire marketing',
      blog: 'Blog (bientôt)',
      guides: 'Guides (bientôt)',
      contact: 'Contact',
      privacy: 'Confidentialité',
      terms: 'CGU',
      gdpr: 'RGPD',
      status: 'État du service',
      builtWith: 'Conçu à Paris · Hébergement EU · Compatible RGPD',
      cookieSettings: 'Préférences cookies',
    },
    consent: {
      title: 'Cookies',
      message:
        'Nous utilisons des cookies pour améliorer ton expérience et mesurer l’usage du site. Tu choisis ce qui reste activé.',
      privacyLink: 'Lire notre politique de confidentialité',
      acceptAll: 'Tout accepter',
      rejectAll: 'Tout refuser',
      customize: 'Personnaliser',
      save: 'Enregistrer',
      categories: {
        necessary: {
          label: 'Essentiels',
          desc: 'Nécessaires au fonctionnement du site. Toujours actifs.',
        },
        analytics: {
          label: 'Mesure d’audience',
          desc: 'Nous aide à comprendre comment les visiteurs utilisent le site.',
        },
        marketing: {
          label: 'Publicité',
          desc: 'Personnalise les pubs et mesure les campagnes.',
        },
      },
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
