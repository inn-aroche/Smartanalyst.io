-- 008_add_rls_policies.sql
-- Multi-tenancy security (un user ne peut pas voir les données d'un autre)
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §9

-- ENABLE RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ━━━ ORGANIZATIONS ━━━
DROP POLICY IF EXISTS "organizations_select" ON organizations;
CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "organizations_insert" ON organizations;
CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "organizations_update" ON organizations;
CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- ━━━ WORKSPACES ━━━
DROP POLICY IF EXISTS "workspaces_select" ON workspaces;
CREATE POLICY "workspaces_select" ON workspaces
  FOR SELECT USING (
    id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ━━━ WORKSPACE_MEMBERS ━━━
DROP POLICY IF EXISTS "workspace_members_select" ON workspace_members;
CREATE POLICY "workspace_members_select" ON workspace_members
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ━━━ CONNECTORS ━━━
DROP POLICY IF EXISTS "connectors_select" ON connectors;
CREATE POLICY "connectors_select" ON connectors
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "connectors_insert" ON connectors;
CREATE POLICY "connectors_insert" ON connectors
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "connectors_update" ON connectors;
CREATE POLICY "connectors_update" ON connectors
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "connectors_delete" ON connectors;
CREATE POLICY "connectors_delete" ON connectors
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ━━━ CANONICAL_METRICS ━━━
DROP POLICY IF EXISTS "canonical_metrics_select" ON canonical_metrics;
CREATE POLICY "canonical_metrics_select" ON canonical_metrics
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ━━━ REPORTS ━━━
DROP POLICY IF EXISTS "reports_select" ON reports;
CREATE POLICY "reports_select" ON reports
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ━━━ REPORT_DATA ━━━
DROP POLICY IF EXISTS "report_data_select" ON report_data;
CREATE POLICY "report_data_select" ON report_data
  FOR SELECT USING (
    report_id IN (
      SELECT id FROM reports
      WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    )
  );

-- ━━━ BUSINESS_PROFILES ━━━
DROP POLICY IF EXISTS "business_profiles_select" ON business_profiles;
CREATE POLICY "business_profiles_select" ON business_profiles
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ━━━ SUBSCRIPTIONS ━━━
DROP POLICY IF EXISTS "subscriptions_select" ON subscriptions;
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (
    organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
  );

-- ━━━ AUDIT_LOGS ━━━
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
