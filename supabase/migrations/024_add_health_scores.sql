-- 024_add_health_scores.sql
-- Brief V2 §3.1 — Score de santé global 0-100 + breakdown par dimension,
-- historisé pour afficher "vs semaine précédente".
--
-- Snapshot quotidien (upsert par date) : on garde une trace pour la courbe
-- d'évolution et le delta. Le calcul vit dans health-score.service.js.

CREATE TABLE IF NOT EXISTS public.health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  -- Sous-scores par dimension : { paid, organic, conversion, revenue, tracking }
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Métriques brutes ayant servi au calcul (audit / debug).
  inputs jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, date)
);

CREATE INDEX IF NOT EXISTS idx_health_scores_workspace_date
  ON public.health_scores (workspace_id, date DESC);

ALTER TABLE public.health_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_scores_select" ON public.health_scores;
CREATE POLICY "health_scores_select" ON public.health_scores
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
-- Écriture : service_role uniquement (le calcul tourne côté serveur).
