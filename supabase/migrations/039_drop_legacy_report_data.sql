-- Migration 039 — nettoyage du legacy rapports (ex-migration 004).
--
-- `report_data` n'a jamais été référencée par le code applicatif (zéro
-- lecture/écriture dans apps/api). On la supprime, ainsi que les index
-- legacy de `reports` devenus redondants avec ceux de la migration 029
-- (reports_workspace_idx / reports_status_idx).
--
-- ⚠️ Application en prod = opération DB de prod → validation humaine requise.

DROP TABLE IF EXISTS public.report_data;

-- Index legacy 004, redondants avec ceux de 029.
DROP INDEX IF EXISTS idx_reports_workspace_id;
DROP INDEX IF EXISTS idx_reports_status;
DROP INDEX IF EXISTS idx_reports_period;
