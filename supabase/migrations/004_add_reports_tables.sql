-- 004_add_reports_tables.sql
-- Reports + report_data (raw + normalized data used per report)
-- Source: docs/04_SCHEMA_DONNEES_COMPLET.md §5

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

CREATE INDEX IF NOT EXISTS idx_reports_workspace_id ON reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_period ON reports(period_start, period_end);

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

CREATE INDEX IF NOT EXISTS idx_report_data_report_id ON report_data(report_id);
CREATE INDEX IF NOT EXISTS idx_report_data_source ON report_data(source);
