-- 011_add_integration_providers.sql
-- Catalogue dynamique des connecteurs (providers) supportés par l'app.
--
-- Permet d'ajouter un nouveau type d'intégration via INSERT sans redéploy
-- (avant : config hardcodée dans apps/api/src/connectors/index.js et
-- apps/web/src/lib/connectors.ts).
--
-- Les Client ID / Client Secret des apps OAuth créées chez chaque provider
-- (Meta for Developers, Shopify Partners, Google Cloud, etc.) sont chiffrés
-- via Supabase Vault (cf apps/api/src/lib/vault.js).
--
-- Accès : la table n'est JAMAIS lue directement depuis le frontend. Le
-- backend (service role) la lit et expose une version sanitized (sans les
-- colonnes *_encrypted) via /api/v1/connectors/catalog.

CREATE TABLE IF NOT EXISTS integration_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ━━━ Identifiants ━━━
  -- source : clé technique stable, utilisée comme foreign-equivalent dans
  -- la table `connectors` (connectors.source = integration_providers.source).
  source TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,

  -- ━━━ Statut affiché côté front ━━━
  -- 'available'  : connectable maintenant (Client ID/Secret renseignés + adapter codé)
  -- 'beta'       : connectable mais marqué expérimental
  -- 'soon'       : visible dans le catalogue avec pill "Coming soon", pas de bouton actif
  -- 'disabled'   : masqué côté front (kill-switch)
  status TEXT NOT NULL DEFAULT 'soon',

  -- ━━━ Type d'authentification ━━━
  -- 'oauth2' : flow standard (authorize_url + token_url + scopes)
  -- 'apikey' : utilisateur colle une clé API restreinte (cf. Stripe restricted keys)
  auth_kind TEXT NOT NULL,

  -- ━━━ Config OAuth (NULL si auth_kind = 'apikey') ━━━
  authorize_url TEXT,
  token_url TEXT,
  scopes TEXT[],

  -- ━━━ Credentials SmartAnalyst chez le provider (chiffrés via Vault) ━━━
  -- Restent NULL tant qu'on n'a pas créé l'app OAuth chez le provider.
  -- Une fois remplis : la source peut passer en status='available'.
  client_id_encrypted TEXT,
  client_secret_encrypted TEXT,

  -- ━━━ Cas particuliers par provider ━━━
  -- requires_subdomain  : Shopify a besoin de {shop}.myshopify.com par user
  -- requires_account_id : Meta, Google Ads ont besoin d'un ad_account_id par user
  -- extra_config        : config libre (ex. Google Ads developer token,
  --                       TikTok app id, Shopify API version pinnée)
  requires_subdomain BOOLEAN NOT NULL DEFAULT FALSE,
  requires_account_id BOOLEAN NOT NULL DEFAULT FALSE,
  extra_config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ━━━ Affichage ━━━
  icon_url TEXT,
  display_order INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT integration_providers_status_check
    CHECK (status IN ('available', 'beta', 'soon', 'disabled')),
  CONSTRAINT integration_providers_auth_kind_check
    CHECK (auth_kind IN ('oauth2', 'apikey'))
);

CREATE INDEX IF NOT EXISTS idx_integration_providers_status
  ON integration_providers(status);
CREATE INDEX IF NOT EXISTS idx_integration_providers_category
  ON integration_providers(category);
CREATE INDEX IF NOT EXISTS idx_integration_providers_display_order
  ON integration_providers(display_order);

-- ━━━ RLS ━━━
-- Aucune policy SELECT/INSERT/UPDATE/DELETE pour authenticated/anon.
-- Conséquence : seul le service role (qui bypass RLS) peut accéder à la
-- table. C'est volontaire : la table contient des secrets chiffrés que
-- le frontend ne doit jamais voir directement.
ALTER TABLE integration_providers ENABLE ROW LEVEL SECURITY;
