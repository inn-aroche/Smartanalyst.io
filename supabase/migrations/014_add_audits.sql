-- 014_add_audits.sql
-- M4 Phase D — Audit SEO/GEO on-demand.
-- One row per audit run. Sync today (POST returns the completed audit),
-- async-ready (status enum + started_at/completed_at) for when Performance
-- (PageSpeed Insights) and AI scoring are added — those analyzers can take
-- 20-30 s combined and will move to a worker.

CREATE TABLE audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  url TEXT NOT NULL,
  -- L'URL effective après suivi des redirections (peut différer de `url`).
  final_url TEXT,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error TEXT, -- message d'erreur si status='failed'

  -- Score agrégé 0-100 (uniquement quand status='completed').
  score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

  -- Résultats détaillés. Schéma :
  --   { seo: { findings: [...], score, summary }, geo: {...}, perf: {...}, ai: {...} }
  -- Seul `seo` est rempli pour l'instant ; les autres branches arrivent dans
  -- les PRs suivantes (Phase D parts 2/3).
  results JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_audits_workspace_created
  ON audits(workspace_id, created_at DESC);

CREATE INDEX idx_audits_status
  ON audits(status)
  WHERE status IN ('queued', 'running');

-- ─── Row-Level Security ─────────────────────────────────────────────────
-- Pattern aligné sur les autres tables workspace-scoped : un user voit les
-- audits de ses workspaces, peut en créer dans ses workspaces, mais ne peut
-- pas modifier l'historique (les mises à jour de status sont faites par le
-- service-role côté API).

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audits_select_own_workspace" ON audits
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "audits_insert_own_workspace" ON audits
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- L'UPDATE / DELETE est réservé au service-role (logique applicative).
-- Aucune policy = refus par défaut.

COMMENT ON TABLE audits IS 'M4 Phase D — Audit SEO/GEO on-demand par workspace.';
COMMENT ON COLUMN audits.results IS 'JSONB: { seo, geo, perf, ai } — branches optionnelles selon analyzers exécutés.';
COMMENT ON COLUMN audits.score IS 'Score agrégé 0-100 calculé depuis les analyzers, NULL tant que status != completed.';
