// Libellés lisibles des sources de données — partagés entre le chat
// (SourceFilter) et le wizard de rapports. Pour un connecteur non mappé,
// retomber sur la clé brute (ex: 'shopify' → 'Shopify' via fallbackLabel).

export const SOURCE_LABELS: Record<string, string> = {
  ga4: 'Google Analytics',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  stripe: 'Stripe',
  shopify: 'Shopify',
  search_console: 'Search Console',
  smarttag: 'SmartTag',
}

/** Libellé d'une source : mapping connu, sinon capitalisation de la clé. */
export function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
}
