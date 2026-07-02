-- Migration 041 — feedback utilisateur sur les réponses assistant (C1).
--
-- Le pouce 👍/👎 du chat n'était qu'en mémoire côté front : aucune boucle
-- qualité IA exploitable (measurement plan §6 — mesurer Rapide vs Approfondi).
-- Colonne simple sur chat_messages ; écriture via service-role uniquement
-- (la route vérifie l'appartenance workspace via la jointure conversation).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS feedback text CHECK (feedback IN ('up', 'down'));

COMMENT ON COLUMN public.chat_messages.feedback IS
  'Feedback utilisateur sur une réponse assistant : up | down | null.';
