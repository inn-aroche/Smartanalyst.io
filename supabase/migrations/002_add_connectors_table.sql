-- 002_add_connectors_table.sql
-- Tokens OAuth chiffrés via Supabase Vault
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §3

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

CREATE INDEX IF NOT EXISTS idx_connectors_workspace_id ON connectors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connectors_status ON connectors(status);
CREATE INDEX IF NOT EXISTS idx_connectors_last_synced_at ON connectors(last_synced_at DESC);
