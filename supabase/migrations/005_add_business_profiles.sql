-- 005_add_business_profiles.sql
-- Onboarding analysis (auto-detected sector, market, tools)
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §6

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
  CONSTRAINT valid_business_profile_confidence
    CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_workspace_id ON business_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_sector ON business_profiles(sector);
