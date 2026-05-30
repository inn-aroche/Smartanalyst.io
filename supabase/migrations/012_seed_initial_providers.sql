-- 012_seed_initial_providers.sql
-- Seed du catalogue avec les 3 premiers connecteurs OAuth2 :
-- GA4, Meta Ads (Facebook/Instagram), Shopify.
--
-- Tous les rows sont insérés en status='soon' tant que les Client ID/Secret
-- (encrypted via vault) n'ont pas été renseignés via providers.service.setCredentials().
-- Le script apps/api/scripts/seed-oauth-credentials.js peut les hydrater
-- depuis les variables d'environnement (GOOGLE_CLIENT_ID, META_APP_ID, etc.).
--
-- Une fois les credentials renseignés, basculer en status='available' :
--   UPDATE integration_providers SET status='available' WHERE source='ga4';

INSERT INTO integration_providers (
  source, name, category, description, status, auth_kind,
  authorize_url, token_url, scopes,
  requires_subdomain, requires_account_id, extra_config,
  display_order
)
VALUES
  -- ━━━ Google Analytics 4 ━━━
  (
    'ga4',
    'Google Analytics 4',
    'Analytics',
    'Sessions, conversions, sources de trafic, audience.',
    'soon',
    'oauth2',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://oauth2.googleapis.com/token',
    ARRAY['https://www.googleapis.com/auth/analytics.readonly'],
    FALSE,
    TRUE,
    -- Google exige access_type=offline + prompt=consent pour renvoyer un refresh_token.
    jsonb_build_object(
      'authorize_extra_params', jsonb_build_object(
        'access_type', 'offline',
        'prompt', 'consent',
        'include_granted_scopes', 'true'
      ),
      'api_base', 'https://analyticsdata.googleapis.com/v1beta'
    ),
    10
  ),

  -- ━━━ Meta Ads (Facebook & Instagram) ━━━
  (
    'meta_ads',
    'Meta Ads',
    'Advertising',
    'Dépenses, ROAS, CPA campagnes Facebook & Instagram.',
    'soon',
    'oauth2',
    'https://www.facebook.com/v18.0/dialog/oauth',
    'https://graph.facebook.com/v18.0/oauth/access_token',
    ARRAY['ads_read', 'business_management'],
    FALSE,
    TRUE,
    jsonb_build_object(
      'api_version', 'v18.0',
      'api_base', 'https://graph.facebook.com/v18.0'
    ),
    20
  ),

  -- ━━━ Shopify ━━━
  -- Spécificité : l'authorize_url contient le sub-domaine de la boutique
  -- ({shop}.myshopify.com), renseigné par l'utilisateur au moment du clic
  -- "Connect" et passé via le param `subst` du flow OAuth.
  (
    'shopify',
    'Shopify',
    'Ecommerce',
    'Commandes, chiffre d''affaires, produits, clients.',
    'soon',
    'oauth2',
    'https://{shop}.myshopify.com/admin/oauth/authorize',
    'https://{shop}.myshopify.com/admin/oauth/access_token',
    ARRAY['read_orders', 'read_products', 'read_customers'],
    TRUE,
    FALSE,
    jsonb_build_object(
      'api_version', '2024-07',
      'api_base_template', 'https://{shop}.myshopify.com/admin/api/2024-07'
    ),
    30
  )
ON CONFLICT (source) DO NOTHING;
