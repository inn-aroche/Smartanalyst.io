-- Migration 029 — reports (rapports mensuels / à la demande)
-- Brief V2 §3.6 — livrable de synthèse pour soi (board / investisseur) ou
-- pour partage. On stocke le HTML rendu (pas le PDF) : impression-PDF
-- depuis le navigateur, plus moderne + zéro dépendance Chromium.

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Période couverte par le rapport (YYYY-MM-DD inclusif).
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- "monthly" (auto, 1er du mois) · "quarterly" (auto, 1er du trimestre)
  -- · "custom" (à la demande user).
  kind text NOT NULL CHECK (kind IN ('monthly', 'quarterly', 'custom')) DEFAULT 'custom',
  -- Cycle : draft → generating → ready (HTML disponible) → sent (livré) | failed
  status text NOT NULL CHECK (status IN ('draft', 'generating', 'ready', 'sent', 'failed')) DEFAULT 'draft',
  -- Titre lisible (ex: « Point du mois — juin 2026 »).
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- Mot de l'analyste (commentaire IA si présent, ajouté à la couverture).
  analyst_note text,
  -- HTML complet du rapport, prêt à rendre dans un <iframe srcdoc>.
  -- Limite raisonnable : ~200 Ko (la moyenne est ~30 Ko).
  html_content text,
  -- Destinataire si envoyé par email (audit + retry).
  sent_to text,
  -- White-label : rapport personnalisé (logo client visible).
  white_label boolean NOT NULL DEFAULT false,
  -- Erreur de génération si status='failed'.
  error_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_workspace_idx ON public.reports (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status) WHERE status IN ('generating', 'failed');

-- Trigger updated_at — réutilise la fonction commune si elle existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE TRIGGER reports_set_updated_at
      BEFORE UPDATE ON public.reports
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- RLS : membres du workspace en lecture seule ; mutations via service-role.
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reports_member_read ON public.reports;
CREATE POLICY reports_member_read ON public.reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = reports.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.reports IS
  'Rapports mensuels / à la demande (brief V2 §3.6). HTML stocké inline, conversion PDF côté navigateur (window.print).';
