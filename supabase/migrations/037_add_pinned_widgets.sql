-- Migration 037 — pinned_widgets (cahier 22b §3.4 + roadmap V2.3)
--
-- Permet d'epingler un bloc d'une reponse chat (KPI / chart) sur le dashboard
-- d'accueil (BriefHome). Le widget stocke une spec JSON auto-suffisante :
--   - kind : 'kpi' (carte chiffre simple) | 'chart' (mini histogramme series)
--   - spec : { title, value?, delta?, series?, unit?, metricKey? }
--   - position : ordre d'affichage (le plus petit = en haut)
--
-- RLS : workspace_members lecture/ecriture (admin et editor). Service-role
-- gere les cas internes.

CREATE TABLE IF NOT EXISTS public.pinned_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Type de widget. Etendable plus tard (table, funnel, compare...).
  kind text NOT NULL CHECK (kind IN ('kpi', 'chart')),

  -- Spec libre cote application. Validee cote service avant insert.
  -- Limite raisonnable : un widget chart fait ~5 Ko max.
  spec jsonb NOT NULL,

  -- Origine — pour debug ("tu peux retrouver d'ou ca vient").
  source_kind text CHECK (source_kind IN ('chat', 'insight', 'manual')) DEFAULT 'chat',
  source_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,

  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinned_widgets_workspace_idx
  ON public.pinned_widgets (workspace_id, position ASC, created_at DESC);

ALTER TABLE public.pinned_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pinned_widgets_member_read ON public.pinned_widgets;
CREATE POLICY pinned_widgets_member_read ON public.pinned_widgets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = pinned_widgets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.pinned_widgets IS
  'Widgets epingles sur le dashboard (cahier 22b — chat "Pin to dashboard").';
