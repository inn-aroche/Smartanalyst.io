// Connector identity badges. We deliberately do not ship the official brand
// SVGs here — they're trademarked, and shipping pixel-accurate copies would
// expose us to brand-guideline questions. Instead each connector renders as a
// colored monogram badge ("GA", "M", "S"…) on its brand color, paired with
// the brand name. Recognizable in context ("S + Stripe" reads as Stripe), no
// trademark exposure.
//
// If we want the real brand marks later, the clean upgrade path is
// `npm install simple-icons` (MIT-licensed) + read the per-brand guidelines.

export const LOGO_ICONS = {
  ga4:            { label: 'GA4',            mono: 'GA', bg: '#F9AB00', fg: '#1a1300' },
  meta:           { label: 'Meta Ads',       mono: 'M',  bg: '#0866FF', fg: '#ffffff' },
  google_ads:     { label: 'Google Ads',     mono: 'Ad', bg: '#3D82FF', fg: '#ffffff' },
  stripe:         { label: 'Stripe',         mono: 'S',  bg: '#635BFF', fg: '#ffffff' },
  search_console: { label: 'Search Console', mono: 'SC', bg: '#34A853', fg: '#ffffff' },
  shopify:        { label: 'Shopify',        mono: 'Sh', bg: '#95BF47', fg: '#0d1a00' },
  hubspot:        { label: 'HubSpot',        mono: 'Hs', bg: '#FF7A59', fg: '#2b0a00' },
  mailchimp:      { label: 'Mailchimp',      mono: 'Mc', bg: '#FFE01B', fg: '#2b2700' },
  linkedin:       { label: 'LinkedIn Ads',   mono: 'in', bg: '#0A66C2', fg: '#ffffff' },
  klaviyo:        { label: 'Klaviyo',        mono: 'K',  bg: '#191919', fg: '#ffffff', border: '#2a2a2a' },
  notion:         { label: 'Notion',         mono: 'N',  bg: '#0e0e10', fg: '#ffffff', border: '#2a2a2a' },
}
