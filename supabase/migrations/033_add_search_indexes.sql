-- Migration 033 — recherche globale (cahier §3 Lot 2)
-- Active pg_trgm + indices GIN sur les colonnes texte cherchées par la
-- recherche cross-entity (conversations / insights / reports).
--
-- Pourquoi pg_trgm + GIN plutôt qu'un tsvector full-text :
--   - les titres sont courts (qq mots), la recherche est plutôt "fuzzy/partial"
--     que vraie linguistique
--   - pas besoin de stemming multi-langue (FR/EN) côté DB pour ce scope
--   - simple à requêter via ILIKE '%q%' avec accélération par l'index trgm

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Insights : titre + summary (les 2 sont affichés en résultat).
CREATE INDEX IF NOT EXISTS insights_title_trgm_idx
  ON public.insights USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS insights_summary_trgm_idx
  ON public.insights USING gin (summary gin_trgm_ops);

-- Chat conversations : titre (généré au 1er message).
CREATE INDEX IF NOT EXISTS chat_conversations_title_trgm_idx
  ON public.chat_conversations USING gin (title gin_trgm_ops);

-- Reports : titre (kind + date par défaut, mais l'user peut customiser).
CREATE INDEX IF NOT EXISTS reports_title_trgm_idx
  ON public.reports USING gin (title gin_trgm_ops);
