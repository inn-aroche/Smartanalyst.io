-- 020_enable_rls_feature_flags.sql
-- Sécurité P0 : active RLS sur feature_flags.
--
-- Contexte : feature_flags était la seule table publique sans RLS — donc
-- lisible/modifiable par quiconque possède l'anon key Supabase. L'advisor
-- Supabase la flaggait en "critical".
--
-- Vérifié avant application :
--   - aucune lecture de feature_flags dans le code API (table seedée mais
--     pas encore consommée) ;
--   - le frontend ne tape jamais Supabase en direct (tout passe par l'API).
--
-- Donc : RLS ON sans policy permissive = deny par défaut pour anon/authenticated.
-- Le service_role (jobs + API backend) BYPASSE RLS nativement, donc le jour
-- où le code lira la table via le service client, ça marchera sans changement.
-- Si plus tard on veut une lecture client-side des flags (rollout progressif),
-- on ajoutera une policy SELECT explicite à ce moment-là.

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
