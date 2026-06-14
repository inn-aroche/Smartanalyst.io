-- 027_add_notification_settings.sql
-- Brief V2 §3.9 — réglages notifications par workspace.
-- 1 row par workspace, créée à la volée par GET si manquante (lazy upsert).

CREATE TABLE IF NOT EXISTS public.notification_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  weekly_digest boolean NOT NULL DEFAULT true,
  critical_alerts boolean NOT NULL DEFAULT true,
  -- Email override : si null, fallback sur organizations.email (recipient.js).
  email_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_settings_select" ON public.notification_settings;
CREATE POLICY "notification_settings_select" ON public.notification_settings
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "notification_settings_update" ON public.notification_settings;
CREATE POLICY "notification_settings_update" ON public.notification_settings
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
-- INSERT : service_role uniquement (création à la volée via le service).
