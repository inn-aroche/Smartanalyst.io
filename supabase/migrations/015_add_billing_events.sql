-- 015_add_billing_events.sql
-- Stripe webhook event ledger — garantit l'idempotence du traitement.
--
-- Stripe peut renvoyer plusieurs fois le même event (retry automatique en cas
-- de 5xx, ou re-livraison manuelle via le Dashboard). Sans déduplication, on
-- risque de double-créditer une subscription / double-mailer / double-quota.
-- L'unique sur stripe_event_id + un INSERT ON CONFLICT DO NOTHING dans le
-- handler nous prémunissent de ça.

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiant Stripe (evt_*) — clé de déduplication.
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL, -- 'customer.subscription.created', 'invoice.paid', ...

  -- Référence à l'objet Stripe portant l'event (sub_*, in_*, cus_*, cs_*).
  stripe_object_id TEXT,

  -- Liaison organization (résolue par le handler à partir de customer/subscription).
  -- NULL si la résolution échoue (event reçu avant que l'org soit liée).
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Payload Stripe complet (audit + replay manuel possible).
  payload JSONB NOT NULL,

  -- Suivi du traitement.
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_received_at ON billing_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_organization_id
  ON billing_events(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_events_unprocessed
  ON billing_events(received_at) WHERE processed_at IS NULL;

-- RLS: la table est écrite uniquement par le service-role (webhook handler).
-- Pas de policy users → bloque tout accès via anon/auth roles.
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
