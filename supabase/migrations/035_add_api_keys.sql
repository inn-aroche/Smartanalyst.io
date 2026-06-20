-- Migration 035 — clés API par workspace (cahier §3 Lot 4 + §4.8)
--
-- Permet à un user d'émettre une clé API pour son workspace afin de scripter
-- l'accès à ses données (export programmatique, intégration custom, MCP-out
-- post-beta). La clé en clair n'est montrée qu'à la création — ensuite on ne
-- stocke que le hash SHA-256, comme un mot de passe.
--
-- Format de la clé : `sa_<env>_<32 chars random base62>`. `prefix` (8 premiers
-- chars) stocké en clair pour permettre à l'user de retrouver "celle qui
-- commence par sa_live_xyz" dans une liste sans avoir à révéler.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Label libre saisi par l'user (ex. "Zapier prod", "Script export mensuel").
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),

  -- 8 premiers caractères de la clé, en clair. Affiché en UI ("sa_live_AbCd…")
  -- pour que l'user reconnaisse une clé sans avoir à la révéler.
  prefix text NOT NULL,

  -- SHA-256 hexadécimal de la clé entière. Comparaison via crypto.timingSafeEqual
  -- côté serveur. Une perte de cette colonne = impossible de récupérer les clés
  -- existantes (l'user devra en re-générer).
  key_hash text NOT NULL,

  -- Audit minimal.
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  -- Soft delete (revoke) : la clé reste en base pour l'historique mais le
  -- middleware d'auth la rejette si revoked_at IS NOT NULL.
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_keys_workspace_idx
  ON public.api_keys (workspace_id, revoked_at);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx
  ON public.api_keys (key_hash)
  WHERE revoked_at IS NULL;

-- RLS : seuls les membres du workspace peuvent lister/créer/révoquer leurs
-- propres clés. Le hash n'est jamais exposé via l'API REST (sélection
-- explicite des colonnes côté service).
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_member_read ON public.api_keys;
CREATE POLICY api_keys_member_read ON public.api_keys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = api_keys.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.api_keys IS
  'Clés API par workspace (cahier §3 Lot 4). La clé en clair n''est exposée qu''à la création — on stocke seulement le hash SHA-256.';
