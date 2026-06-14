-- 023_extend_action_status_for_tasks.sql
-- Brief V2 §3.4 — cycle de vie des Tâches :
--   proposed (IA suggère, user pas encore validé)
--     → todo (validée par l'user, vraie tâche à faire)
--         → done (faite) | archived (écartée)
--     → archived (écartée direct sans validation)
--
-- L'ancien statut `dismissed` est renommé `archived` (rétro-compatibilité
-- assurée par la migration des rows existants). `in_progress` est conservé
-- mais devient marginal dans la sémantique du brief.

-- 1. Migrer les rows existants (au moment du run : 0 rows en prod, mais on
-- prépare le futur si la PR met du temps à merger).
UPDATE public.action_cards
SET status = 'archived'
WHERE status = 'dismissed';

-- 2. Mettre à jour la contrainte CHECK pour accepter le nouveau set.
ALTER TABLE public.action_cards DROP CONSTRAINT IF EXISTS action_cards_status_check;
ALTER TABLE public.action_cards ADD CONSTRAINT action_cards_status_check
  CHECK (status IN ('proposed', 'todo', 'in_progress', 'done', 'archived'));

-- 3. Nouveau default `proposed` (l'insight engine génère désormais des
-- "tâches proposées" que l'user valide ou écarte).
ALTER TABLE public.action_cards ALTER COLUMN status SET DEFAULT 'proposed';
