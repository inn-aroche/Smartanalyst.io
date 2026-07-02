-- Migration 040 — wizard de rapport (cahier §4.6 + demande produit).
--
-- `context` : texte libre saisi par l'utilisateur à la génération (promo en
-- cours, lancement, focus…) — injecté dans le prompt IA de la synthèse.
-- `generation_params` : paramètres complets de génération (sources,
-- segmentBy, compare, template, aiNote, mode) — permet l'idempotence
-- on-demand, l'affichage « filtré GA4+Meta » dans la liste, et la
-- régénération à l'identique.
--
-- RLS : la table reports est déjà couverte (029) — lecture membre,
-- écritures service-role uniquement. Colonnes additives, pas de nouveau
-- chemin d'accès.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS generation_params jsonb;

COMMENT ON COLUMN public.reports.context IS
  'Contexte business libre fourni par l''utilisateur à la génération (max 2000 chars, validé côté API).';
COMMENT ON COLUMN public.reports.generation_params IS
  'Paramètres de génération (sources, segmentBy, compareToPreviousPeriod, template, aiNote, mode) — idempotence + régénération.';
