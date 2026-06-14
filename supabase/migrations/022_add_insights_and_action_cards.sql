-- 022_add_insights_and_action_cards.sql
-- Insight Engine lean (étape 3 du plan V1). Deux tables seulement, tout le
-- détail mouvant vit en JSONB (evidence, chart_spec, limitations).
--
-- insights      : ce que Smart Analyst a détecté (avec preuves + limites).
-- action_cards  : quoi faire, priorisé (impact/effort), suivable par l'user.
--
-- Écriture : service_role (job post-sync). Lecture : membres du workspace.
-- L'user peut changer le statut (snooze/resolve/dismiss, todo/done).

CREATE TABLE IF NOT EXISTS public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  title text NOT NULL,
  summary text NOT NULL,

  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'snoozed', 'resolved', 'dismissed')),

  period_start date,
  period_end date,
  comparison_start date,
  comparison_end date,

  primary_source text,

  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  chart_spec jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_model_output jsonb,

  -- Empreinte de dédup : évite de recréer le même insight à chaque sync.
  dedup_key text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insights_workspace_status
  ON public.insights (workspace_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_insights_dedup
  ON public.insights (workspace_id, dedup_key) WHERE dedup_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.action_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES public.insights(id) ON DELETE SET NULL,

  title text NOT NULL,
  description text,

  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  impact text NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
  effort text NOT NULL CHECK (effort IN ('low', 'medium', 'high')),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),

  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done', 'dismissed')),

  source jsonb,
  expected_impact jsonb,
  follow_up_check jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_cards_workspace_status
  ON public.action_cards (workspace_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_action_cards_insight
  ON public.action_cards (insight_id) WHERE insight_id IS NOT NULL;

-- ━━━ RLS ━━━
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_cards ENABLE ROW LEVEL SECURITY;

-- Membres : lecture de leurs insights.
DROP POLICY IF EXISTS "insights_select" ON public.insights;
CREATE POLICY "insights_select" ON public.insights
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Membres : modification (changer le statut : snooze/resolve/dismiss).
DROP POLICY IF EXISTS "insights_update" ON public.insights;
CREATE POLICY "insights_update" ON public.insights
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "action_cards_select" ON public.action_cards;
CREATE POLICY "action_cards_select" ON public.action_cards
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "action_cards_update" ON public.action_cards;
CREATE POLICY "action_cards_update" ON public.action_cards
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
-- INSERT/DELETE : service_role only (bypasse RLS) → le job génère, l'user ne
-- crée pas d'insight à la main en V1.
