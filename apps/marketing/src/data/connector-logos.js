// Connector icon registry. Each entry maps our internal key to a brand
// shown in marketing-integration contexts ("works with X"). For brands
// covered by the MIT-licensed simple-icons package we render the actual
// brand-color SVG via that package. For brands not in simple-icons we
// fall back to a colored monogram badge.
//
// The package gives us each icon's official brand color (`hex`) and the
// single SVG path; we render them client-side as <svg viewBox="0 0 24 24">
// with the brand color as the fill.

import {
  siGoogleanalytics,
  siMeta,
  siGoogleads,
  siStripe,
  siGooglesearchconsole,
  siShopify,
  siHubspot,
  siMailchimp,
  siNotion,
} from 'simple-icons'

function fromSi(icon, override = {}) {
  return {
    kind: 'svg',
    label: override.label || icon.title,
    hex: override.hex || `#${icon.hex}`,
    path: icon.path,
  }
}

export const LOGO_ICONS = {
  ga4:            fromSi(siGoogleanalytics, { label: 'GA4' }),
  meta:           fromSi(siMeta,            { label: 'Meta Ads' }),
  google_ads:     fromSi(siGoogleads),
  stripe:         fromSi(siStripe),
  search_console: fromSi(siGooglesearchconsole, { label: 'Search Console' }),
  shopify:        fromSi(siShopify),
  hubspot:        fromSi(siHubspot),
  mailchimp:      fromSi(siMailchimp),
  notion:         { ...fromSi(siNotion), hex: '#FFFFFF' }, // Notion's official mark is black; invert on dark bg.

  // Not currently in this version of simple-icons → monogram fallback.
  linkedin:       { kind: 'mono', label: 'LinkedIn Ads', mono: 'in', bg: '#0A66C2', fg: '#ffffff' },
  klaviyo:        { kind: 'mono', label: 'Klaviyo',      mono: 'K',  bg: '#1B1B1B', fg: '#ffffff', border: '#2a2a2a' },
}
