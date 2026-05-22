-- 001_init_base_schema.sql
-- Organizations, Workspaces, Workspace Members
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §2

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_email ON organizations(email);

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

CREATE INDEX IF NOT EXISTS idx_workspaces_organization_id ON workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_active ON workspaces(is_active);

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

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);
