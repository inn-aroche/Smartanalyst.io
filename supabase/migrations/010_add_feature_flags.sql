-- 010_add_feature_flags.sql
-- Feature flags pour rollout progressif (safe to deploy daily)
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §11

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
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_rollout CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

-- Feature flags initiaux (seed)
INSERT INTO feature_flags (name, description, enabled, rollout_percentage)
VALUES
  ('benchmark_v2_aggregated', 'Benchmark sectoriel V2 basé sur données agrégées utilisateurs', false, 0),
  ('dark_mode', 'Mode sombre dashboard', false, 0),
  ('weekly_insights_email', 'Email hebdo insights proactifs (Lundi 8am)', true, 100)
ON CONFLICT (name) DO NOTHING;
