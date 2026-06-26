-- Migration 038 — snooze granulaire des insights (cahier 23 §3.3).
--
-- Avant : `status='snoozed'` figeait l'insight indéfiniment. L'user qui
-- snoozait un insight pour le revoir le lendemain devait le rouvrir
-- manuellement (pas d'UI pour) → insights critiques cachés par accident.
--
-- Après : `snoozed_until` est une deadline. À chaque listInsights, le
-- service ré-ouvre automatiquement les insights dont la deadline est passée
-- (status passe de 'snoozed' à 'open'). L'insight redevient visible dans le
-- digest hebdo et dans la page Veille sans intervention user.

ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

-- Index partiel sur les insights actuellement snoozés (faible cardinalité —
-- la majorité des insights restent en 'open' ou passent en 'dismissed').
CREATE INDEX IF NOT EXISTS insights_snoozed_idx
  ON public.insights (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

COMMENT ON COLUMN public.insights.snoozed_until IS
  'Si non-null et dans le futur, l''insight est en pause jusqu''à cette date. À la fin, le service le ré-ouvre automatiquement (status: snoozed → open).';
