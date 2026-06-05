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
      title: 'Cookies & analytics',
      message:
        'We use a small set of analytics tags (Google Analytics 4 via GTM) to understand how the site is used. Nothing is set before you choose. Necessary technical storage stays on regardless.',
      privacyLink: 'Read our privacy policy',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      customize: 'Customize',
      save: 'Save my choices',
      categories: {
        necessary: {
          label: 'Strictly necessary',
          desc: 'Required for the site to work (security, language preference). Always on, no consent required.',
        },
        analytics: {
          label: 'Audience measurement',
          desc: 'Anonymous usage metrics (Google Analytics 4 via GTM). Helps us prioritize features.',
        },
        marketing: {
          label: 'Marketing & remarketing',
          desc: 'Ads-related tags (Google Ads, Meta Pixel). Currently not deployed — kept off by default.',
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
      title: 'Cookies & mesure d’audience',
      message:
        'Nous utilisons un petit nombre de tags d’analyse (Google Analytics 4 via GTM) pour comprendre comment le site est utilisé. Rien n’est posé avant ton choix. Les stockages techniques nécessaires restent actifs dans tous les cas.',
      privacyLink: 'Lire notre politique de confidentialité',
      acceptAll: 'Tout accepter',
      rejectAll: 'Tout refuser',
      customize: 'Personnaliser',
      save: 'Enregistrer mes choix',
      categories: {
        necessary: {
          label: 'Strictement nécessaires',
          desc: 'Indispensables au fonctionnement du site (sécurité, préférence de langue). Toujours actifs, aucun consentement requis.',
        },
        analytics: {
          label: 'Mesure d’audience',
          desc: 'Métriques d’usage anonymisées (Google Analytics 4 via GTM). Nous aide à prioriser les évolutions.',
        },
        marketing: {
          label: 'Marketing & remarketing',
          desc: 'Tags publicitaires (Google Ads, Meta Pixel). Non déployés à ce jour — désactivés par défaut.',
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
