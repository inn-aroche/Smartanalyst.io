-- 017_add_waitlist_signups.sql
-- Beta waitlist — formulaire public d'inscription pré-launch.
-- Voir apps/api/src/services/waitlist/waitlist.service.js.
--
-- RLS : activée sans aucune policy → deny-by-default pour les clés
-- `anon` et `authenticated`. Le `service_role` (qu'utilise notre API
-- côté backend via getServiceRoleClient) bypass RLS automatiquement,
-- donc le service continue de fonctionner.
--
-- Le frontend marketing n'a JAMAIS d'accès direct à Supabase pour cette
-- table — il fait un POST vers notre endpoint /api/v1/waitlist.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  use_case TEXT,
  source TEXT DEFAULT 'marketing_site',
  -- pending  → inscrit, pas encore invité
  -- invited  → email d'invitation beta envoyé
  -- converted → user a créé son compte
  -- declined → on a décidé de ne pas l'inviter
  status TEXT DEFAULT 'pending',
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT waitlist_status_valid CHECK (status IN ('pending', 'invited', 'converted', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_status ON waitlist_signups(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_created_at ON waitlist_signups(created_at DESC);

-- Deny-by-default : activer RLS sans policy bloque anon + authenticated.
-- service_role bypass automatiquement → backend API continue à marcher.
ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
