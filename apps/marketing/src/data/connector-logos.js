// Connector icon registry. Each entry maps our internal key to a brand
// shown in marketing-integration contexts ("works with X"). On rend en
// `<img>` un PNG hébergé dans `/public/connectors/<slug>.png` (servi par
// Cloudflare Pages avec CDN). Pour les brands sans PNG, fallback monogramme.
//
// Pour ajouter un connecteur :
//   1. Dépose le PNG dans apps/marketing/public/connectors/<slug>.png
//   2. Ajoute une entrée ici (kind:'img', label, src:'/connectors/<slug>.png')
//   3. (Optionnel) UPDATE integration_providers SET icon_url='https://smartanalyst.io/connectors/<slug>.png'

function img(label, slug) {
  return { kind: 'img', label, src: `/connectors/${slug}.png` }
}

export const LOGO_ICONS = {
  // ─── Connecteurs déjà actifs ───
  ga4:            img('GA4', 'ga4'),
  meta:           img('Meta Ads', 'facebook'),
  google_ads:     img('Google Ads', 'google_ads'),
  stripe:         img('Stripe', 'stripe'),
  search_console: img('Search Console', 'search_console'),
  shopify:        img('Shopify', 'shopify'),
  hubspot:        img('HubSpot', 'hubspot'),
  linkedin:       img('LinkedIn Ads', 'linkedin'),
  klaviyo:        img('Klaviyo', 'klaviyo'),

  // ─── Tous les logos disponibles dans /public/connectors ───
  activecampaign:    img('ActiveCampaign', 'activecampaign'),
  adform:            img('Adform', 'adform'),
  adjust:            img('Adjust', 'adjust'),
  adobe_analytics:   img('Adobe Analytics', 'adobe_analytics'),
  ahrefs:            img('Ahrefs', 'ahrefs'),
  amazon:            img('Amazon', 'amazon'),
  bigquery:          img('BigQuery', 'bigquery'),
  brevo:             img('Brevo', 'brevo'),
  cm360:             img('Campaign Manager 360', 'cm360'),
  dv360:             img('Display & Video 360', 'dv360'),
  facebook:          img('Facebook', 'facebook'),
  gmb:               img('Google Business Profile', 'gmb'),
  google_sheets:     img('Google Sheets', 'google_sheets'),
  instagram:         img('Instagram', 'instagram'),
  marketo:           img('Marketo', 'marketo'),
  merchant_center:   img('Merchant Center', 'merchant_center'),
  microsoft:         img('Microsoft Ads', 'microsoft'),
  pagespeed:         img('PageSpeed Insights', 'pagespeed'),
  pinterest:         img('Pinterest', 'pinterest'),
  pipedrive:         img('Pipedrive', 'pipedrive'),
  reddit:            img('Reddit', 'reddit'),
  salesforce:        img('Salesforce', 'salesforce'),
  semrush:           img('Semrush', 'semrush'),
  similarweb:        img('Similarweb', 'similarweb'),
  snapchat:          img('Snapchat', 'snapchat'),
  tiktok:            img('TikTok', 'tiktok'),
  wix:               img('Wix', 'wix'),
  woocommerce:       img('WooCommerce', 'woocommerce'),
  x:                 img('X', 'x'),
  youtube:           img('YouTube', 'youtube'),
  zoho:              img('Zoho CRM', 'zoho'),

  // ─── Brands sans PNG (fallback monogramme) ───
  mailchimp:      { kind: 'mono', label: 'Mailchimp', mono: 'M',  bg: '#FFE01B', fg: '#1f1f1f' },
  notion:         { kind: 'mono', label: 'Notion',    mono: 'N',  bg: '#1f1f1f', fg: '#ffffff', border: '#2a2a2a' },
}
