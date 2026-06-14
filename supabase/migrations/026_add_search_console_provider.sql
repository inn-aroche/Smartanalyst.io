-- 026_add_search_console_provider.sql
-- Brief V2 §3.7A P1 : Search Console.
--
-- Réutilise la même OAuth Google app que GA4 (Client ID/Secret partagés). On
-- copie les credentials chiffrés de la row 'ga4' vers 'search_console' au
-- moment du INSERT — éviter un seed-script séparé.
--
-- Scope GSC : webmasters.readonly (à autoriser dans la console GCP côté app
-- OAuth, en plus du scope GA4 analytics.readonly).

INSERT INTO public.integration_providers (
  source, name, category, description, status, auth_kind,
  authorize_url, token_url, scopes,
  client_id_encrypted, client_secret_encrypted,
  requires_subdomain, requires_account_id, extra_config, icon_url, display_order
)
SELECT
  'search_console',
  'Google Search Console',
  'SEO',
  'Clics, impressions, CTR et position moyenne organiques sur les SERP Google.',
  'available',
  'oauth2',
  'https://accounts.google.com/o/oauth2/v2/auth',
  'https://oauth2.googleapis.com/token',
  ARRAY['https://www.googleapis.com/auth/webmasters.readonly'],
  client_id_encrypted,
  client_secret_encrypted,
  FALSE,
  FALSE,
  '{}'::jsonb,
  'https://smartanalyst.io/connectors/search_console.png',
  200
FROM public.integration_providers
WHERE source = 'ga4'
ON CONFLICT (source) DO UPDATE SET
  status = 'available',
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  scopes = EXCLUDED.scopes,
  updated_at = NOW();
