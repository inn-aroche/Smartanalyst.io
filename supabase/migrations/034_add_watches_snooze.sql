-- Migration 034 — snooze des veilles (cahier §3 Lot 4 + §4.4)
--
-- Ajoute `snoozed_until` à `watches` : tant que `now() < snoozed_until`, le
-- watch evaluator skippe la veille (pas de re-trigger). À la fin du snooze,
-- la veille reprend automatiquement sans intervention user.
--
-- Permet à l'user de mettre une veille en pause sans la supprimer (utile
-- ex. pendant les vacances ou pendant qu'un fix est en cours).

ALTER TABLE public.watches
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

-- Index partiel sur les veilles actuellement snoozées (faible cardinalité —
-- la plupart des veilles ne sont jamais snoozées).
CREATE INDEX IF NOT EXISTS watches_snoozed_idx
  ON public.watches (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

COMMENT ON COLUMN public.watches.snoozed_until IS
  'Si non-null et dans le futur, la veille est en pause jusqu''à cette date. À la fin, reprise automatique sans intervention user.';
