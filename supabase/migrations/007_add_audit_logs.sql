-- 007_add_audit_logs.sql
-- RGPD compliance (traçabilité de toutes les actions sensibles)
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §8

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  action TEXT NOT NULL, -- 'login', 'connector_added', 'report_sent', 'data_deleted'
  resource_type TEXT, -- 'connector', 'report', 'workspace_member'
  resource_id UUID,

  -- What changed
  changes JSONB, -- { 'before': {...}, 'after': {...} }

  -- Request info (for anti-abuse)
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_id ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
