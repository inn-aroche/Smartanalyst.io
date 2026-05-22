-- 003_add_canonical_metrics.sql
-- Universal metrics schema (all sources normalized)
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §4

CREATE TABLE IF NOT EXISTS canonical_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  metric_key TEXT NOT NULL, -- 'spend_paid_social', 'sessions_all', 'revenue_total', etc.
  metric_value NUMERIC NOT NULL,

  -- Source tracking (for audit + fallback)
  source TEXT NOT NULL, -- 'ga4', 'meta_ads', 'stripe', 'computed'
  connector_id UUID REFERENCES connectors(id) ON DELETE SET NULL,

  -- Data quality
  confidence_score INT DEFAULT 100, -- 0-100 (noisy data = lower)
  timezone_source TEXT, -- 'Europe/Paris' (for audit, if different)

  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, date, metric_key, source),
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_canonical_metrics_workspace_date
  ON canonical_metrics(workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_metrics_key
  ON canonical_metrics(metric_key);
CREATE INDEX IF NOT EXISTS idx_canonical_metrics_confidence
  ON canonical_metrics(confidence_score);
