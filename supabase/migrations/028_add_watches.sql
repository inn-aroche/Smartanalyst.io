-- Migration 028 — watches (alertes custom personnalisées)
-- Brief V2 §3.3 : « + Créer une alerte » du WatchModal (3 étapes guidées).
--
-- Une watch = une condition (chute / dépassement / passage) sur une métrique
-- canonique. Évaluée à chaque ingest (à câbler dans un job de fond) ; quand
-- la condition se réalise on notifie via les canaux choisis (in-app / email).
--
-- Volontairement simple : pas de fenêtre temporelle complexe, pas de
-- combinaison de conditions. On peut affiner en V2.

CREATE TABLE IF NOT EXISTS public.watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Description NL telle que l'user l'a écrite (sert pour le résumé + audit).
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 280),
  -- Métrique surveillée (canonical_key, cf. apps/api/.../canonical-metrics-mapping.js).
  metric_key text NOT NULL CHECK (char_length(metric_key) BETWEEN 3 AND 80),
  -- Source spécifique optionnelle (ga4, meta_ads, …) ; NULL = toutes sources.
  source text,
  -- Opérateur. Quatre cas couvrent ~95 % des watches utiles :
  --   drops_below      : valeur passe SOUS le seuil
  --   rises_above      : valeur passe AU-DESSUS du seuil
  --   changes_by_pct   : variation jour-sur-jour ≥ |seuil|%
  --   any_change       : tout changement (signal de présence)
  operator text NOT NULL CHECK (operator IN ('drops_below', 'rises_above', 'changes_by_pct', 'any_change')),
  -- Seuil. Ignoré quand operator='any_change'.
  threshold numeric,
  -- Canaux de notification.
  notify_in_app boolean NOT NULL DEFAULT true,
  notify_email  boolean NOT NULL DEFAULT false,
  -- État runtime.
  enabled boolean NOT NULL DEFAULT true,
  triggered_count integer NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watches_workspace_idx ON public.watches (workspace_id, enabled);
CREATE INDEX IF NOT EXISTS watches_metric_idx ON public.watches (metric_key);

-- Trigger updated_at — réutilise la fonction commune si elle existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE TRIGGER watches_set_updated_at
      BEFORE UPDATE ON public.watches
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- RLS : membre du workspace peut lire les siennes ; les écritures passent
-- toujours par le service role côté API (jamais en direct depuis le client).
ALTER TABLE public.watches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS watches_member_read ON public.watches;
CREATE POLICY watches_member_read ON public.watches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = watches.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.watches IS
  'Alertes custom utilisateur (WatchModal §3.3). Évaluation au tick d''ingest, notification via in-app + email selon settings.';
