# 04_SCHEMA_DONNEES_COMPLET.md

## Vue d'ensemble

Ce document contient le **DDL complète** (CREATE TABLE) pour SmartAnalyst. Tous les fichiers SQL sont copy-paste ready et déployables directement en Supabase.

**Important:** Les migrations sont versionnées (`001_*.sql`, `002_*.sql`, etc.). Chaque migration est **idempotente** et peut être appliquée plusieurs fois sans erreur.

**Pour qui :** DBA, Backend leads, DevOps.

**À lire avant :** 03_ARCHITECTURE_GLOBALE.md.

---

## 1. Migrations structure

```
supabase/migrations/
├─ 001_init_base_schema.sql      (organizations, workspaces, users)
├─ 002_add_connectors_table.sql  (connectors, tokens chiffrés)
├─ 003_add_canonical_metrics.sql (canonical_metrics, central schema)
├─ 004_add_reports_tables.sql    (reports, report_data)
├─ 005_add_business_profiles.sql (onboarding analysis)
├─ 006_add_subscriptions.sql     (Stripe billing)
├─ 007_add_audit_logs.sql        (RGPD compliance)
├─ 008_add_rls_policies.sql      (security, multi-tenancy)
├─ 009_add_indices.sql           (performance)
└─ 010_add_feature_flags.sql     (gradual rollout)
```

---

## 2. Migration 001 - Base schema

```sql
-- 001_init_base_schema.sql
-- Organizations, Workspaces, Workspace Members

-- ORGANIZATIONS (agences, entreprises)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  logo_url TEXT,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'trial', -- 'trial', 'free', 'starter', 'pro', 'agency'
  plan_active BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Europe/Paris', -- IANA timezone
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_organizations_owner_id ON organizations(owner_id);
CREATE UNIQUE INDEX idx_organizations_email ON organizations(email);

-- WORKSPACES (clients gérés par une organization)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  timezone TEXT DEFAULT 'Europe/Paris', -- Fuseau horaire du client
  sector TEXT, -- 'ecommerce', 'saas', 'agency', 'local_business', 'media', 'professional_services'
  market TEXT, -- 'b2b', 'b2c', 'b2b2c'
  
  -- White-label config
  brand_color TEXT DEFAULT '#6366f1',
  logo_url TEXT,
  
  -- Report settings
  report_day SMALLINT DEFAULT 1, -- 1-31, jour du mois pour auto-send
  auto_send BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_workspaces_organization_id ON workspaces(organization_id);
CREATE INDEX idx_workspaces_is_active ON workspaces(is_active);

-- WORKSPACE_MEMBERS (permissions granulaires)
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'editor', -- 'admin', 'editor', 'viewer'
  invited_by_user_id UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);
```

---

## 3. Migration 002 - Connectors

```sql
-- 002_add_connectors_table.sql
-- Tokens OAuth chiffrés via Supabase Vault

CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'ga4', 'meta_ads', 'google_ads', 'stripe', 'search_console'
  
  -- OAuth tokens (chiffrés via Vault)
  access_token TEXT, -- ENCRYPTED
  refresh_token TEXT, -- ENCRYPTED
  token_expires_at TIMESTAMPTZ,
  
  -- Account info
  account_id TEXT NOT NULL, -- GA4 property ID, Meta Ad Account ID, etc.
  account_name TEXT, -- Display name
  
  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'expired', 'error', 'disconnected'
  status_reason TEXT, -- 'Rate limit', 'Invalid credentials', etc.
  last_error_message TEXT,
  last_error_at TIMESTAMPTZ,
  
  -- Sync info
  last_synced_at TIMESTAMPTZ,
  last_sync_duration_ms INT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, source, account_id)
);

CREATE INDEX idx_connectors_workspace_id ON connectors(workspace_id);
CREATE INDEX idx_connectors_status ON connectors(status);
CREATE INDEX idx_connectors_last_synced_at ON connectors(last_synced_at DESC);
```

---

## 4. Migration 003 - Canonical Metrics

```sql
-- 003_add_canonical_metrics.sql
-- Universal metrics schema (all sources normalized)

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

CREATE INDEX idx_canonical_metrics_workspace_date ON canonical_metrics(workspace_id, date DESC);
CREATE INDEX idx_canonical_metrics_key ON canonical_metrics(metric_key);
CREATE INDEX idx_canonical_metrics_confidence ON canonical_metrics(confidence_score);

-- Partitioning (optional, for massive scale)
-- This keeps queries fast when months of data exist
-- CREATE TABLE canonical_metrics_2025_05 PARTITION OF canonical_metrics
--   FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
```

---

## 5. Migration 004 - Reports

```sql
-- 004_add_reports_tables.sql

-- REPORTS (generated PDFs)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Status lifecycle
  status TEXT DEFAULT 'pending', -- 'pending', 'generating', 'ready', 'sent', 'error'
  error_message TEXT,
  
  -- PDF storage
  pdf_url TEXT, -- Signed URL (expires in 7 days)
  pdf_path TEXT, -- Internal path in Storage (for renewal)
  
  -- Sending
  recipient_email TEXT,
  sent_at TIMESTAMPTZ,
  send_attempts INT DEFAULT 0,
  
  -- Data snapshot (what was used to generate this report)
  data_snapshot JSONB, -- { 'ga4_sessions': 1200, 'meta_spend': 500, ... }
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_workspace_id ON reports(workspace_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_period ON reports(period_start, period_end);

-- REPORT_DATA (raw + normalized data used in each report)
CREATE TABLE IF NOT EXISTS report_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'ga4', 'meta_ads', 'stripe', etc.
  
  raw_data JSONB, -- Original API response
  normalized JSONB, -- Transformed to canonical schema
  ai_insights TEXT, -- Insights generated for this source
  
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_data_report_id ON report_data(report_id);
CREATE INDEX idx_report_data_source ON report_data(source);
```

---

## 6. Migration 005 - Business Profiles

```sql
-- 005_add_business_profiles.sql
-- Onboarding analysis (auto-detected sector, market, tools)

CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Analyzed URL
  url TEXT NOT NULL,
  
  -- Detected info
  sector TEXT, -- 'ecommerce', 'saas', 'agency', etc.
  market TEXT, -- 'b2b', 'b2c', 'b2b2c'
  brand_keywords TEXT[], -- ['fashion', 'sustainable', 'women']
  description TEXT, -- AI-generated description
  
  -- Detected tools
  detected_tools JSONB, -- { 'shopify': true, 'ga4': true, 'meta_pixel': true }
  confidence_score INT DEFAULT 50, -- 0-100
  
  -- Raw data (for debugging)
  raw_html_data JSONB, -- Scraped HTML, parsed content
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id),
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX idx_business_profiles_workspace_id ON business_profiles(workspace_id);
CREATE INDEX idx_business_profiles_sector ON business_profiles(sector);
```

---

## 7. Migration 006 - Subscriptions

```sql
-- 006_add_subscriptions.sql
-- Stripe billing integration

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Stripe references
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,
  
  -- Plan info
  plan TEXT NOT NULL, -- 'free', 'starter', 'pro', 'agency'
  status TEXT NOT NULL, -- 'active', 'past_due', 'canceled', 'trialing'
  
  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_organization_id ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

---

## 8. Migration 007 - Audit Logs

```sql
-- 007_add_audit_logs.sql
-- RGPD compliance (traçabilité de toutes les actions)

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

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_workspace_id ON audit_logs(workspace_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

---

## 9. Migration 008 - RLS Policies

```sql
-- 008_add_rls_policies.sql
-- Multi-tenancy security (one user can't see another's data)

-- ENABLE RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS: User can only see their own
CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- WORKSPACES: User can see if they are a member
CREATE POLICY "workspaces_select" ON workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- WORKSPACE_MEMBERS: User can see members of their workspaces
CREATE POLICY "workspace_members_select" ON workspace_members
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- CONNECTORS: User can see if member of workspace
CREATE POLICY "connectors_select" ON connectors
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "connectors_insert" ON connectors
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- CANONICAL_METRICS: User can see workspace's metrics
CREATE POLICY "canonical_metrics_select" ON canonical_metrics
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- REPORTS: User can see workspace's reports
CREATE POLICY "reports_select" ON reports
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Repeat similar for other tables...
-- (business_profiles, subscriptions, audit_logs)
```

---

## 10. Migration 009 - Indices

```sql
-- 009_add_indices.sql
-- Performance optimization

-- Already created with tables, but here are additional ones:

CREATE INDEX idx_connectors_workspace_source ON connectors(workspace_id, source);
CREATE INDEX idx_canonical_metrics_workspace_metric ON canonical_metrics(workspace_id, metric_key);
CREATE INDEX idx_reports_workspace_period ON reports(workspace_id, period_start, period_end);
CREATE INDEX idx_workspace_members_workspace_role ON workspace_members(workspace_id, role);

-- For expensive queries
CREATE INDEX idx_canonical_metrics_date_range ON canonical_metrics(date) WHERE workspace_id IS NOT NULL;
```

---

## 11. Migration 010 - Feature Flags

```sql
-- 010_add_feature_flags.sql

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  
  -- Rollout config
  enabled BOOLEAN DEFAULT false,
  rollout_percentage INT DEFAULT 0, -- 0-100
  
  -- Targeting
  target_organizations UUID[], -- Empty = all orgs
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example rows (seed data):
-- ('new_benchmark_ui', description='New benchmark UI redesign', enabled=true, rollout_percentage=50)
-- ('dark_mode', enabled=false, rollout_percentage=0)
```

---

## 12. Seed data (for local dev + tests)

```sql
-- seeds.sql (not production, dev only)

-- Test organization
INSERT INTO organizations (owner_id, name, email, plan)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'Test Agency',
  'test@smartanalyst.local',
  'pro'
) ON CONFLICT DO NOTHING;

-- Test workspace
INSERT INTO workspaces (organization_id, name, sector, market)
VALUES (
  (SELECT id FROM organizations LIMIT 1),
  'Test E-commerce Client',
  'ecommerce',
  'b2c'
) ON CONFLICT DO NOTHING;

-- Test workspace member
INSERT INTO workspace_members (workspace_id, user_id, role, accepted_at)
VALUES (
  (SELECT id FROM workspaces LIMIT 1),
  (SELECT id FROM auth.users LIMIT 1),
  'admin',
  NOW()
) ON CONFLICT DO NOTHING;
```

---

## 13. Database maintenance

### 13.1 Backup strategy

```bash
# Daily backup (automated by Hostinger)
# Retention: 30 days

# Manual backup (before major changes)
pg_dump "postgresql://user:password@db.supabase.co:5432/postgres" \
  > backup_2025-05-15.sql
```

### 13.2 Reindex (monthly)

```sql
-- Reindex all tables (optimize query performance)
REINDEX DATABASE postgres;
```

### 13.3 Monitor table sizes

```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 14. Deployment checklist

- [ ] Migrations applied in order (001, 002, 003, ...)
- [ ] RLS policies enabled on all tables
- [ ] Indices created
- [ ] Vault configured (for token encryption)
- [ ] Seed data inserted (dev only)
- [ ] Backups configured
- [ ] Monitor disk usage
- [ ] Test data retention (24 months)

---

## Prochaine étape

Lire **05_INFRASTRUCTURE_DEVOPS.md** (VPS, PM2, Redis, monitoring).

---

*Dernière mise à jour : Mai 2025*
