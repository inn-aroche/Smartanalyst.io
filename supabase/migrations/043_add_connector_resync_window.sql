-- Migration 043 — fenêtre de resync paramétrable par connecteur (K0).
--
-- Le sync quotidien (cron 3h UTC) et le sync manuel utilisaient tous les
-- deux une fenêtre de 7 jours hardcodée, identique pour toutes les sources.
-- Or les APIs sources ne révisent pas leurs données au même rythme :
-- Stripe peut voir un remboursement/litige arriver des semaines après la
-- transaction d'origine, Shopify peut voir un statut de commande changer
-- après livraison — un simple "delta d'hier" les rate. On rend la fenêtre
-- configurable par connecteur, avec un défaut calibré par source à la
-- connexion (voir connector.service.js SOURCE_DEFAULT_RESYNC_DAYS).

ALTER TABLE public.connectors
  ADD COLUMN IF NOT EXISTS resync_window_days integer NOT NULL DEFAULT 7
    CHECK (resync_window_days BETWEEN 1 AND 90);

COMMENT ON COLUMN public.connectors.resync_window_days IS
  'Fenêtre (en jours) resynchronisée à chaque cron/sync manuel, pour rattraper les données révisées a posteriori par la source (remboursements Stripe, statuts Shopify...). Défaut calibré par source à la connexion.';
