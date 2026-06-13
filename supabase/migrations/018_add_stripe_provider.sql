-- 018_add_stripe_provider.sql
-- Ajoute Stripe au catalogue de connecteurs (table integration_providers).
--
-- Stripe est auth_kind='apikey' (pas OAuth) : l'utilisateur colle SA clé
-- restreinte (rk_test_... / rk_live_...). Donc pas besoin de Client ID /
-- Secret côté plateforme, et credentials_configured=true automatiquement
-- (cf providers.service.js sanitize()).
--
-- L'INSERT est idempotent via ON CONFLICT (source) — safe à réappliquer.
-- Status 'available' direct car le connector code est déjà déployé
-- (stripe.connector.js).

INSERT INTO integration_providers (
  source,
  name,
  category,
  description,
  status,
  auth_kind,
  authorize_url,
  token_url,
  scopes,
  requires_subdomain,
  requires_account_id,
  extra_config,
  icon_url,
  display_order
) VALUES (
  'stripe',
  'Stripe',
  'Payments',
  'MRR, churn, paiements échoués, clients actifs depuis ton compte Stripe.',
  'available',
  'apikey',
  NULL,
  NULL,
  NULL,
  FALSE,
  FALSE,
  '{}'::jsonb,
  NULL,
  100
)
ON CONFLICT (source) DO UPDATE SET
  status = 'available',
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  auth_kind = EXCLUDED.auth_kind,
  updated_at = NOW();
