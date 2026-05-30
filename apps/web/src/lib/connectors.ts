// Catalogue of integrations the product surfaces in the UI.
// Status:
//   - "available" → wired end-to-end (OAuth + ingestion + canonical mapping)
//   - "soon"      → on the roadmap, displayed with a "Coming soon" pill
// Adding a new connector to the available set requires implementing it under
// apps/api/src/connectors/ and listing the source key here.

export type ConnectorStatus = 'available' | 'soon'
export type ConnectorCategory =
  | 'Analytics'
  | 'Advertising'
  | 'Payments'
  | 'CRM'
  | 'Email & SMS'
  | 'Ecommerce'
  | 'Product & Events'
  | 'SEO'
  | 'Social'
  | 'Support'
  | 'Data warehouse'
  | 'Spreadsheet & Files'

export type ConnectorDef = {
  source: string
  name: string
  category: ConnectorCategory
  status: ConnectorStatus
  authKind: 'oauth' | 'apikey'
  description: string
}

export const CONNECTORS: ConnectorDef[] = [
  // ── Available — wired end-to-end ────────────────────────────────────────
  {
    source: 'ga4',
    name: 'Google Analytics 4',
    category: 'Analytics',
    status: 'available',
    authKind: 'oauth',
    description: 'Sessions, conversions, traffic sources, audience.',
  },
  {
    source: 'stripe',
    name: 'Stripe',
    category: 'Payments',
    status: 'available',
    authKind: 'apikey',
    description: 'Revenue, MRR, churn, refunds, subscriptions.',
  },

  // ── Coming soon — Google/Meta suite (backends not wired yet) ─────────────
  {
    source: 'meta_ads',
    name: 'Meta Ads',
    category: 'Advertising',
    status: 'soon',
    authKind: 'oauth',
    description: 'Facebook & Instagram ad spend, ROAS, CPA.',
  },
  {
    source: 'google_ads',
    name: 'Google Ads',
    category: 'Advertising',
    status: 'soon',
    authKind: 'oauth',
    description: 'Campaigns, keywords, conversions, quality score.',
  },
  {
    source: 'search_console',
    name: 'Google Search Console',
    category: 'SEO',
    status: 'soon',
    authKind: 'oauth',
    description: 'Impressions, clicks, queries, indexation health.',
  },

  // ── Coming soon — Advertising ───────────────────────────────────────────
  { source: 'tiktok_ads', name: 'TikTok Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'TikTok ad spend, CPM, ROAS.' },
  { source: 'linkedin_ads', name: 'LinkedIn Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'B2B campaigns, lead gen forms.' },
  { source: 'pinterest_ads', name: 'Pinterest Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'Pin promotion performance.' },
  { source: 'snapchat_ads', name: 'Snapchat Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'Snap Ads delivery & ROI.' },
  { source: 'reddit_ads', name: 'Reddit Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'Subreddit targeting performance.' },
  { source: 'twitter_ads', name: 'X / Twitter Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'X campaigns, engagement.' },
  { source: 'taboola', name: 'Taboola', category: 'Advertising', status: 'soon', authKind: 'apikey', description: 'Native ads performance.' },
  { source: 'outbrain', name: 'Outbrain', category: 'Advertising', status: 'soon', authKind: 'apikey', description: 'Content discovery campaigns.' },
  { source: 'criteo', name: 'Criteo', category: 'Advertising', status: 'soon', authKind: 'apikey', description: 'Retargeting performance.' },
  { source: 'bing_ads', name: 'Microsoft Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'Bing search ads.' },
  { source: 'apple_search_ads', name: 'Apple Search Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'App Store search campaigns.' },
  { source: 'amazon_ads', name: 'Amazon Ads', category: 'Advertising', status: 'soon', authKind: 'oauth', description: 'Sponsored products & brands.' },

  // ── Coming soon — Analytics ─────────────────────────────────────────────
  { source: 'ga_universal', name: 'Google Analytics (UA)', category: 'Analytics', status: 'soon', authKind: 'oauth', description: 'Legacy Universal Analytics for historical data.' },
  { source: 'mixpanel', name: 'Mixpanel', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'Product event analytics.' },
  { source: 'amplitude', name: 'Amplitude', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'User behavior & retention.' },
  { source: 'posthog', name: 'PostHog', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'Product analytics & feature flags.' },
  { source: 'heap', name: 'Heap', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'Autocaptured events.' },
  { source: 'plausible', name: 'Plausible', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'Privacy-focused web analytics.' },
  { source: 'fathom', name: 'Fathom Analytics', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'Lightweight site analytics.' },
  { source: 'hotjar', name: 'Hotjar', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'Heatmaps & session recordings.' },
  { source: 'fullstory', name: 'FullStory', category: 'Analytics', status: 'soon', authKind: 'apikey', description: 'Digital experience analytics.' },

  // ── Coming soon — Product & Events ──────────────────────────────────────
  { source: 'segment', name: 'Segment', category: 'Product & Events', status: 'soon', authKind: 'apikey', description: 'CDP — unified event stream.' },
  { source: 'rudderstack', name: 'RudderStack', category: 'Product & Events', status: 'soon', authKind: 'apikey', description: 'Open-source CDP.' },
  { source: 'mparticle', name: 'mParticle', category: 'Product & Events', status: 'soon', authKind: 'apikey', description: 'Customer data platform.' },
  { source: 'snowplow', name: 'Snowplow', category: 'Product & Events', status: 'soon', authKind: 'apikey', description: 'Behavioral data warehouse.' },

  // ── Coming soon — Email & SMS ───────────────────────────────────────────
  { source: 'klaviyo', name: 'Klaviyo', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Email & SMS for ecommerce.' },
  { source: 'mailchimp', name: 'Mailchimp', category: 'Email & SMS', status: 'soon', authKind: 'oauth', description: 'Email campaigns & automation.' },
  { source: 'brevo', name: 'Brevo (ex-Sendinblue)', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Email, SMS, marketing automation.' },
  { source: 'sendgrid', name: 'SendGrid', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Transactional & marketing email.' },
  { source: 'postmark', name: 'Postmark', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Transactional email.' },
  { source: 'mailgun', name: 'Mailgun', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Email API.' },
  { source: 'activecampaign', name: 'ActiveCampaign', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Marketing automation & CRM.' },
  { source: 'customer_io', name: 'Customer.io', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Lifecycle messaging.' },
  { source: 'iterable', name: 'Iterable', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Cross-channel messaging.' },
  { source: 'braze', name: 'Braze', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Enterprise customer engagement.' },
  { source: 'mailerlite', name: 'MailerLite', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Email marketing.' },
  { source: 'omnisend', name: 'Omnisend', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Email & SMS for ecommerce.' },
  { source: 'convertkit', name: 'ConvertKit', category: 'Email & SMS', status: 'soon', authKind: 'apikey', description: 'Creator-focused email.' },

  // ── Coming soon — CRM ───────────────────────────────────────────────────
  { source: 'hubspot', name: 'HubSpot', category: 'CRM', status: 'soon', authKind: 'oauth', description: 'CRM, marketing hub, sales hub.' },
  { source: 'salesforce', name: 'Salesforce', category: 'CRM', status: 'soon', authKind: 'oauth', description: 'Sales Cloud, Marketing Cloud.' },
  { source: 'pipedrive', name: 'Pipedrive', category: 'CRM', status: 'soon', authKind: 'oauth', description: 'Sales pipeline tracking.' },
  { source: 'zoho_crm', name: 'Zoho CRM', category: 'CRM', status: 'soon', authKind: 'oauth', description: 'CRM & lead management.' },
  { source: 'attio', name: 'Attio', category: 'CRM', status: 'soon', authKind: 'apikey', description: 'Modern CRM.' },
  { source: 'close', name: 'Close', category: 'CRM', status: 'soon', authKind: 'apikey', description: 'Inside sales CRM.' },
  { source: 'copper', name: 'Copper', category: 'CRM', status: 'soon', authKind: 'oauth', description: 'CRM for Google Workspace.' },
  { source: 'monday', name: 'monday.com', category: 'CRM', status: 'soon', authKind: 'oauth', description: 'Work OS & CRM.' },
  { source: 'freshsales', name: 'Freshsales', category: 'CRM', status: 'soon', authKind: 'apikey', description: 'AI-powered CRM.' },

  // ── Coming soon — Ecommerce ─────────────────────────────────────────────
  { source: 'shopify', name: 'Shopify', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Orders, products, customers.' },
  { source: 'woocommerce', name: 'WooCommerce', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'WordPress ecommerce.' },
  { source: 'prestashop', name: 'PrestaShop', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'Open-source ecommerce.' },
  { source: 'magento', name: 'Adobe Commerce (Magento)', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Enterprise ecommerce.' },
  { source: 'bigcommerce', name: 'BigCommerce', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'SaaS ecommerce platform.' },
  { source: 'amazon_seller', name: 'Amazon Seller Central', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Amazon marketplace sales.' },
  { source: 'etsy', name: 'Etsy', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Marketplace orders.' },
  { source: 'ebay', name: 'eBay', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Marketplace listings & sales.' },
  { source: 'wix', name: 'Wix Stores', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Wix ecommerce data.' },
  { source: 'squarespace', name: 'Squarespace Commerce', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Squarespace store data.' },

  // ── Coming soon — Payments ──────────────────────────────────────────────
  { source: 'paypal', name: 'PayPal', category: 'Payments', status: 'soon', authKind: 'oauth', description: 'Transactions & refunds.' },
  { source: 'square', name: 'Square', category: 'Payments', status: 'soon', authKind: 'oauth', description: 'POS & online payments.' },
  { source: 'adyen', name: 'Adyen', category: 'Payments', status: 'soon', authKind: 'apikey', description: 'Enterprise payments.' },
  { source: 'mollie', name: 'Mollie', category: 'Payments', status: 'soon', authKind: 'apikey', description: 'European payments.' },
  { source: 'lemonway', name: 'Lemonway', category: 'Payments', status: 'soon', authKind: 'apikey', description: 'Marketplace payments.' },
  { source: 'paddle', name: 'Paddle', category: 'Payments', status: 'soon', authKind: 'apikey', description: 'SaaS billing & tax.' },
  { source: 'lemonsqueezy', name: 'Lemon Squeezy', category: 'Payments', status: 'soon', authKind: 'apikey', description: 'Digital product payments.' },
  { source: 'chargebee', name: 'Chargebee', category: 'Payments', status: 'soon', authKind: 'apikey', description: 'Subscription billing.' },
  { source: 'recurly', name: 'Recurly', category: 'Payments', status: 'soon', authKind: 'apikey', description: 'Subscription management.' },

  // ── Coming soon — Social ────────────────────────────────────────────────
  { source: 'instagram_business', name: 'Instagram (Business)', category: 'Social', status: 'soon', authKind: 'oauth', description: 'Organic posts & insights.' },
  { source: 'facebook_pages', name: 'Facebook Pages', category: 'Social', status: 'soon', authKind: 'oauth', description: 'Page insights & posts.' },
  { source: 'linkedin_pages', name: 'LinkedIn Company Pages', category: 'Social', status: 'soon', authKind: 'oauth', description: 'Company page analytics.' },
  { source: 'twitter_organic', name: 'X / Twitter (organic)', category: 'Social', status: 'soon', authKind: 'oauth', description: 'Tweets & engagement.' },
  { source: 'tiktok_organic', name: 'TikTok (organic)', category: 'Social', status: 'soon', authKind: 'oauth', description: 'TikTok account insights.' },
  { source: 'youtube', name: 'YouTube', category: 'Social', status: 'soon', authKind: 'oauth', description: 'Channel & video analytics.' },
  { source: 'pinterest_organic', name: 'Pinterest (organic)', category: 'Social', status: 'soon', authKind: 'oauth', description: 'Pin & board analytics.' },

  // ── Coming soon — SEO ───────────────────────────────────────────────────
  { source: 'ahrefs', name: 'Ahrefs', category: 'SEO', status: 'soon', authKind: 'apikey', description: 'Backlinks, keywords, content gap.' },
  { source: 'semrush', name: 'Semrush', category: 'SEO', status: 'soon', authKind: 'apikey', description: 'Keyword & competitor analysis.' },
  { source: 'moz', name: 'Moz', category: 'SEO', status: 'soon', authKind: 'apikey', description: 'Domain authority, link explorer.' },
  { source: 'serpstat', name: 'Serpstat', category: 'SEO', status: 'soon', authKind: 'apikey', description: 'SEO & keyword research.' },
  { source: 'screaming_frog', name: 'Screaming Frog', category: 'SEO', status: 'soon', authKind: 'apikey', description: 'Site crawl data.' },
  { source: 'sistrix', name: 'Sistrix', category: 'SEO', status: 'soon', authKind: 'apikey', description: 'Visibility index.' },

  // ── Coming soon — Support ───────────────────────────────────────────────
  { source: 'zendesk', name: 'Zendesk', category: 'Support', status: 'soon', authKind: 'oauth', description: 'Support tickets & CSAT.' },
  { source: 'intercom', name: 'Intercom', category: 'Support', status: 'soon', authKind: 'oauth', description: 'Conversations & user engagement.' },
  { source: 'freshdesk', name: 'Freshdesk', category: 'Support', status: 'soon', authKind: 'apikey', description: 'Helpdesk metrics.' },
  { source: 'helpscout', name: 'Help Scout', category: 'Support', status: 'soon', authKind: 'apikey', description: 'Customer conversations.' },
  { source: 'crisp', name: 'Crisp', category: 'Support', status: 'soon', authKind: 'apikey', description: 'Live chat & helpdesk.' },

  // ── Coming soon — Data warehouse ────────────────────────────────────────
  { source: 'bigquery', name: 'BigQuery', category: 'Data warehouse', status: 'soon', authKind: 'oauth', description: 'Custom SQL queries.' },
  { source: 'snowflake', name: 'Snowflake', category: 'Data warehouse', status: 'soon', authKind: 'apikey', description: 'Enterprise data warehouse.' },
  { source: 'redshift', name: 'Amazon Redshift', category: 'Data warehouse', status: 'soon', authKind: 'apikey', description: 'AWS data warehouse.' },
  { source: 'postgres', name: 'PostgreSQL', category: 'Data warehouse', status: 'soon', authKind: 'apikey', description: 'Direct database connection.' },
  { source: 'mysql', name: 'MySQL', category: 'Data warehouse', status: 'soon', authKind: 'apikey', description: 'Direct database connection.' },
  { source: 'databricks', name: 'Databricks', category: 'Data warehouse', status: 'soon', authKind: 'apikey', description: 'Lakehouse analytics.' },

  // ── Coming soon — Spreadsheets & Files ──────────────────────────────────
  { source: 'google_sheets', name: 'Google Sheets', category: 'Spreadsheet & Files', status: 'soon', authKind: 'oauth', description: 'Import any tab as a dataset.' },
  { source: 'excel_online', name: 'Microsoft Excel', category: 'Spreadsheet & Files', status: 'soon', authKind: 'oauth', description: 'Excel files on OneDrive/SharePoint.' },
  { source: 'airtable', name: 'Airtable', category: 'Spreadsheet & Files', status: 'soon', authKind: 'apikey', description: 'Bases & tables.' },
  { source: 'notion_db', name: 'Notion (databases)', category: 'Spreadsheet & Files', status: 'soon', authKind: 'oauth', description: 'Notion databases as datasets.' },
  { source: 'dropbox', name: 'Dropbox', category: 'Spreadsheet & Files', status: 'soon', authKind: 'oauth', description: 'CSV/Excel from Dropbox folders.' },
  { source: 'google_drive', name: 'Google Drive', category: 'Spreadsheet & Files', status: 'soon', authKind: 'oauth', description: 'CSV/Excel from Drive.' },
  { source: 'onedrive', name: 'OneDrive', category: 'Spreadsheet & Files', status: 'soon', authKind: 'oauth', description: 'Files from OneDrive.' },

  // ── Coming soon — More Ecommerce / niche ────────────────────────────────
  { source: 'gorgias', name: 'Gorgias', category: 'Support', status: 'soon', authKind: 'apikey', description: 'Ecommerce helpdesk.' },
  { source: 'yotpo', name: 'Yotpo', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'Reviews & loyalty.' },
  { source: 'judgeme', name: 'Judge.me', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'Product reviews.' },
  { source: 'recharge', name: 'Recharge', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'Subscription commerce.' },
  { source: 'gorgias_chat', name: 'Front', category: 'Support', status: 'soon', authKind: 'oauth', description: 'Customer ops inbox.' },
  { source: 'webflow', name: 'Webflow', category: 'Ecommerce', status: 'soon', authKind: 'oauth', description: 'Webflow CMS & ecommerce.' },
  { source: 'kajabi', name: 'Kajabi', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'Online courses & memberships.' },
  { source: 'teachable', name: 'Teachable', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'Course platform sales.' },
  { source: 'thinkific', name: 'Thinkific', category: 'Ecommerce', status: 'soon', authKind: 'apikey', description: 'Online learning platform.' },

  // ── Coming soon — Niche tools ───────────────────────────────────────────
  { source: 'typeform', name: 'Typeform', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Form submissions & responses.' },
  { source: 'calendly', name: 'Calendly', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Booking events.' },
  { source: 'stripe_atlas', name: 'Stripe Atlas', category: 'Payments', status: 'soon', authKind: 'oauth', description: 'Stripe Atlas company metrics.' },
  { source: 'productboard', name: 'Productboard', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Product feedback signals.' },
  { source: 'linear', name: 'Linear', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Issue tracking velocity.' },
  { source: 'github', name: 'GitHub', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Repo activity & releases.' },
  { source: 'gitlab', name: 'GitLab', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Project activity.' },
  { source: 'jira', name: 'Jira', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Issue & sprint data.' },
  { source: 'asana', name: 'Asana', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Project management data.' },
  { source: 'clickup', name: 'ClickUp', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Tasks & workspaces.' },
  { source: 'trello', name: 'Trello', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Boards & cards.' },
  { source: 'slack', name: 'Slack', category: 'Product & Events', status: 'soon', authKind: 'oauth', description: 'Channel activity insights.' },
]

export const CONNECTOR_BY_SOURCE: Record<string, ConnectorDef> = CONNECTORS.reduce(
  (acc, c) => {
    acc[c.source] = c
    return acc
  },
  {} as Record<string, ConnectorDef>,
)

export function countByStatus() {
  return {
    available: CONNECTORS.filter((c) => c.status === 'available').length,
    soon: CONNECTORS.filter((c) => c.status === 'soon').length,
    total: CONNECTORS.length,
  }
}
