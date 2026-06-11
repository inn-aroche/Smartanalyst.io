-- 017_add_waitlist_signups.sql
-- Beta waitlist — formulaire public d'inscription pré-launch.
-- Voir apps/api/src/services/waitlist/waitlist.service.js.
--
-- Pas de RLS : la table est uniquement écrite/lue par le service role
-- depuis l'API. Le frontend marketing n'a pas accès direct à Supabase.

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

-- RLS désactivé volontairement (accès uniquement via service role).
ALTER TABLE waitlist_signups DISABLE ROW LEVEL SECURITY;
