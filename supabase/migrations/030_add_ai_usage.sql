-- Migration 030 — ai_usage : compteur de tokens par workspace
-- Pour éviter les dérives de coût (chat, insights, validation watches, etc.).
-- Chaque appel LLM est enregistré ; agrégation mensuelle pour les budgets.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model text NOT NULL,
  -- chat · insight_engine · watch_validator · audit · report
  request_type text NOT NULL CHECK (char_length(request_type) BETWEEN 1 AND 40),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour les agrégations mensuelles par workspace (le cas d'usage principal).
CREATE INDEX IF NOT EXISTS ai_usage_workspace_month_idx
  ON public.ai_usage (workspace_id, created_at DESC);

-- Quota mensuel par workspace. NULL = pas de limite.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS ai_monthly_token_limit integer;

-- RLS : membres lisent les leurs.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_member_read ON public.ai_usage;
CREATE POLICY ai_usage_member_read ON public.ai_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_usage.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.ai_usage IS
  'Journal des appels LLM par workspace (audit du tracking IA + contrôle des dérives de coût).';
