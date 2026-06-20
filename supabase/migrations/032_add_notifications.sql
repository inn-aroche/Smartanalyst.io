-- Migration 032 — notifications (centre de notifications in-app)
-- Cahier §3 Lot 1 : NotificationCenter — seul vrai levier de retour.
--
-- Une notification = un évènement à signaler au workspace : insight
-- critique créé, veille déclenchée, connecteur en panne silencieuse,
-- digest hebdo prêt, etc. Workspace-scoped : toute la team voit le
-- même flux ; l'état "lu" se gère par membre via `notification_reads`.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Type catégorise la provenance — sert au filtrage UI et au choix de
  -- l'icône côté front. Liste extensible mais contrôlée pour éviter le
  -- "vrac" non typé.
  type text NOT NULL CHECK (type IN (
    'insight_created',
    'watch_triggered',
    'connector_health',
    'digest_ready',
    'task_proposed',
    'system'
  )),
  -- Sévérité visuelle (icône + couleur badge). Distincte du type pour
  -- pouvoir avoir des "system" critiques ou des "watch" simplement info.
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body  text,
  -- Lien interne (relative) pour le "voir détails" depuis la dropdown.
  link  text,
  -- Métadonnées libres (id de l'insight source, id du connecteur, etc.).
  meta  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_workspace_created_idx
  ON public.notifications (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_type_idx
  ON public.notifications (type);

COMMENT ON TABLE public.notifications IS
  'Centre de notifications in-app (cahier §3 Lot 1). Workspace-scoped, état lu géré par notification_reads.';

-- État "lu" par utilisateur — séparé de notifications pour que la même
-- notif puisse être "lue" par certains membres et "non-lue" par d'autres.
CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS notification_reads_user_idx
  ON public.notification_reads (user_id, read_at DESC);

-- RLS notifications : lecture par les membres du workspace, écriture
-- réservée au service_role (jamais en direct depuis le client — le
-- backend décide quand notifier).
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_member_read ON public.notifications;
CREATE POLICY notifications_member_read ON public.notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = notifications.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS notification_reads : chaque user gère ses propres marqueurs de
-- lecture (SELECT + INSERT + DELETE). Pas d'UPDATE — on insère ou on
-- supprime la ligne pour basculer lu/non-lu.
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_reads_self_select ON public.notification_reads;
CREATE POLICY notification_reads_self_select ON public.notification_reads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notification_reads_self_insert ON public.notification_reads;
CREATE POLICY notification_reads_self_insert ON public.notification_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_reads_self_delete ON public.notification_reads;
CREATE POLICY notification_reads_self_delete ON public.notification_reads
  FOR DELETE USING (user_id = auth.uid());
