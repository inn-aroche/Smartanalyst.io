-- 021_add_smarttag_daily.sql
-- Persistance journalière des événements SmartTag.
--
-- Jusqu'ici le SmartTag était real-time ONLY (Redis pub/sub + compteurs TTL
-- court). Aucune donnée historique → impossible de comparer "SmartTag a vu N
-- conversions" vs GA4/Meta, qui est LE différenciateur du produit.
--
-- Cette table stocke un agrégat JOUR par (workspace, type d'event, nom).
-- Grain volontairement aligné sur canonical_metrics (date × clé × source)
-- pour que l'insight engine compare des choux avec des choux.
--
-- event_name : '' pour les events standards (pageview, click, error,
-- session_start) ; le nom pour les events 'custom' (ex: 'lead_submit').
-- '' plutôt que NULL pour que la contrainte UNIQUE fonctionne (NULL != NULL
-- en SQL → casserait l'idempotence de l'upsert).

CREATE TABLE IF NOT EXISTS public.smarttag_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  event_type text NOT NULL,
  event_name text NOT NULL DEFAULT '',
  event_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, date, event_type, event_name)
);

CREATE INDEX IF NOT EXISTS idx_smarttag_daily_workspace_date
  ON public.smarttag_daily (workspace_id, date DESC);

-- ━━━ RLS : lecture par les membres du workspace, écriture service-role only ━━━
ALTER TABLE public.smarttag_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "smarttag_daily_select" ON public.smarttag_daily;
CREATE POLICY "smarttag_daily_select" ON public.smarttag_daily
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
-- Pas de policy INSERT/UPDATE/DELETE → seul le service_role (qui bypasse RLS)
-- écrit, via la RPC ci-dessous appelée par l'ingestion serveur.

-- ━━━ RPC d'incrément atomique ━━━
-- Évite la race "read-modify-write" si deux events arrivent en parallèle :
-- l'upsert + l'addition se font en une seule instruction côté Postgres.
CREATE OR REPLACE FUNCTION public.increment_smarttag_daily(
  p_workspace_id uuid,
  p_date date,
  p_event_type text,
  p_event_name text,
  p_delta integer DEFAULT 1
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.smarttag_daily (workspace_id, date, event_type, event_name, event_count)
  VALUES (p_workspace_id, p_date, p_event_type, COALESCE(p_event_name, ''), p_delta)
  ON CONFLICT (workspace_id, date, event_type, event_name)
  DO UPDATE SET
    event_count = public.smarttag_daily.event_count + EXCLUDED.event_count,
    updated_at = now();
$$;
