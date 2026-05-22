-- 009_add_indices.sql
-- Performance optimization (additional composite indices)
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §10

CREATE INDEX IF NOT EXISTS idx_connectors_workspace_source
  ON connectors(workspace_id, source);

CREATE INDEX IF NOT EXISTS idx_canonical_metrics_workspace_metric
  ON canonical_metrics(workspace_id, metric_key);

CREATE INDEX IF NOT EXISTS idx_reports_workspace_period
  ON reports(workspace_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_role
  ON workspace_members(workspace_id, role);

-- For expensive queries on date ranges
CREATE INDEX IF NOT EXISTS idx_canonical_metrics_date_range
  ON canonical_metrics(date)
  WHERE workspace_id IS NOT NULL;
