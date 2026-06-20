-- Migration 036 — invitations workspace (cahier §3 Lot 4 — Team management)
--
-- Permet à un admin/editor d'inviter par email un user à rejoindre son
-- workspace. Le user destinataire reçoit un lien `/invite/accept?token=…` ;
-- s'il a déjà un compte SmartAnalyst il accepte et son membership est créé,
-- sinon il est redirigé vers `/signup` puis le membership est créé à la fin.
--
-- Le token est stocké hashé (SHA-256 hex) côté serveur — le clear-text ne
-- circule que dans l'email. Expiration 7 jours par défaut.

CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Email du destinataire (lowercased côté service).
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),

  -- Rôle qui sera attribué à l'acceptation.
  role text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')) DEFAULT 'editor',

  -- SHA-256 hex du token clair (jamais stocker en clair).
  token_hash text NOT NULL UNIQUE,

  -- Cycle : pending → accepted | revoked | expired.
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')) DEFAULT 'pending',

  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Une invitation active (pending) par email × workspace : empêche les
  -- doublons accidentels (clic répété sur "inviter").
  CONSTRAINT workspace_invitations_unique_pending
    UNIQUE (workspace_id, email, status)
);

CREATE INDEX IF NOT EXISTS workspace_invitations_ws_idx
  ON public.workspace_invitations (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx
  ON public.workspace_invitations (lower(email)) WHERE status = 'pending';

-- RLS : membres du workspace lecture seule ; service-role gère l'écriture.
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_invitations_member_read ON public.workspace_invitations;
CREATE POLICY workspace_invitations_member_read ON public.workspace_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invitations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.workspace_invitations IS
  'Invitations workspace (Lot 4). Token hashé SHA-256, expire après 7j.';
