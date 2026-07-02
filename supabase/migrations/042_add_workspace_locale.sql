-- Migration 042 — locale du workspace (C3, i18n des emails transactionnels).
--
-- Les emails (digest hebdo, alertes critiques, brief de tâche, rapport prêt)
-- étaient hardcodés FR, en contradiction avec « international dès J1 »
-- (ADR-0003). La locale vivait uniquement en localStorage côté front — les
-- jobs serveur (cron digest) n'avaient aucune source. On la persiste au
-- niveau workspace ; le sélecteur de langue des Réglages la synchronise.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en'));

COMMENT ON COLUMN public.workspaces.locale IS
  'Langue des emails transactionnels et contenus serveur du workspace (fr | en).';
