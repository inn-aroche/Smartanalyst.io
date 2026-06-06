-- pgTAP test: Multi-tenant isolation (RLS cross-tenant).
--
-- Objectif : prouver que les policies déclarées dans 008_add_rls_policies.sql
-- (+ 014 pour audits) isolent réellement deux workspaces, et qu'un utilisateur
-- de l'un ne peut pas lire les données de l'autre — pour aucune des tables.
--
-- Méthode : on insère un graphe (2 orgs, 2 users, 2 workspaces, members,
-- connectors, metrics, business_profile, audit_log, audit, report) en role
-- postgres (bypass RLS), puis on simule successivement chaque user via
-- `set local role authenticated` + `request.jwt.claims.sub = <uuid>`, et on
-- vérifie que `SELECT` ne retourne QUE les rows de SON workspace.
--
-- Tout est dans un BEGIN/ROLLBACK donc rien n'est persisté.
--
-- Exécution :
--   supabase test db                # via Supabase CLI (recommandé)
--   psql -f supabase/tests/rls-isolation.test.sql <db_url>
-- Voir supabase/tests/README.md.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(18);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Fixtures (role postgres — bypass RLS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- UUIDs déterministes (faciles à grep dans les logs si besoin).
\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set org_a  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set org_b  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set ws_a   'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set ws_b   'dddddddd-dddd-dddd-dddd-dddddddddddd'

-- auth.users : insert minimal (les colonnes obligatoires varient selon la
-- version Supabase ; on remplit avec des valeurs par défaut conservatives).
INSERT INTO auth.users (id, email, encrypted_password, instance_id, aud, role,
                        raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
VALUES
  (:'user_a', 'a@test.invalid', '', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', 'b@test.invalid', '', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

-- organizations : chaque user possède une org.
INSERT INTO organizations (id, owner_id, name, email) VALUES
  (:'org_a', :'user_a', 'Org A', 'a@test.invalid'),
  (:'org_b', :'user_b', 'Org B', 'b@test.invalid');

-- workspaces : 1 par org.
INSERT INTO workspaces (id, organization_id, name) VALUES
  (:'ws_a', :'org_a', 'Workspace A'),
  (:'ws_b', :'org_b', 'Workspace B');

-- workspace_members : chaque user est membre admin de son workspace UNIQUEMENT.
INSERT INTO workspace_members (workspace_id, user_id, role, accepted_at) VALUES
  (:'ws_a', :'user_a', 'admin', now()),
  (:'ws_b', :'user_b', 'admin', now());

-- connectors : 1 par workspace.
INSERT INTO connectors (workspace_id, source, account_id, account_name, status) VALUES
  (:'ws_a', 'ga4', 'properties/111', 'WS A Property', 'active'),
  (:'ws_b', 'ga4', 'properties/222', 'WS B Property', 'active');

-- canonical_metrics : 1 par workspace.
INSERT INTO canonical_metrics (workspace_id, source, metric_name, metric_value, date)
VALUES
  (:'ws_a', 'ga4', 'sessions_all', 100, current_date),
  (:'ws_b', 'ga4', 'sessions_all', 200, current_date);

-- business_profiles : 1 par workspace.
INSERT INTO business_profiles (workspace_id, sector, market) VALUES
  (:'ws_a', 'saas', 'b2b'),
  (:'ws_b', 'ecommerce', 'b2c');

-- reports : 1 par workspace.
INSERT INTO reports (workspace_id, title, period_start, period_end) VALUES
  (:'ws_a', 'WS A Q1', current_date, current_date),
  (:'ws_b', 'WS B Q1', current_date, current_date);

-- subscriptions : 1 par org.
INSERT INTO subscriptions (organization_id, plan, status) VALUES
  (:'org_a', 'pro', 'active'),
  (:'org_b', 'pro', 'active');

-- audit_logs : 1 par workspace (logs activité dans la table 007).
INSERT INTO audit_logs (workspace_id, user_id, action) VALUES
  (:'ws_a', :'user_a', 'connector.created'),
  (:'ws_b', :'user_b', 'connector.created');

-- audits (table 014 — SEO/GEO audits IA, distincte de audit_logs).
INSERT INTO audits (workspace_id, url, status) VALUES
  (:'ws_a', 'https://a.test.invalid', 'completed'),
  (:'ws_b', 'https://b.test.invalid', 'completed');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Helper : simuler l'identité d'un user via JWT claims.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION pg_temp.simulate_user(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Assertions — user A ne voit QUE ses données.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT pg_temp.simulate_user(:'user_a');

SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = :'org_b'),
  0, 'User A ne voit pas l''org de User B'
);
SELECT is(
  (SELECT count(*)::int FROM workspaces WHERE id = :'ws_b'),
  0, 'User A ne voit pas le workspace de User B'
);
SELECT is(
  (SELECT count(*)::int FROM workspace_members WHERE workspace_id = :'ws_b'),
  0, 'User A ne voit pas les members du workspace B'
);
SELECT is(
  (SELECT count(*)::int FROM connectors WHERE workspace_id = :'ws_b'),
  0, 'User A ne voit pas les connecteurs du workspace B'
);
SELECT is(
  (SELECT count(*)::int FROM canonical_metrics WHERE workspace_id = :'ws_b'),
  0, 'User A ne voit pas les métriques du workspace B'
);
SELECT is(
  (SELECT count(*)::int FROM business_profiles WHERE workspace_id = :'ws_b'),
  0, 'User A ne voit pas le business_profile du workspace B'
);
SELECT is(
  (SELECT count(*)::int FROM reports WHERE workspace_id = :'ws_b'),
  0, 'User A ne voit pas les rapports du workspace B'
);
SELECT is(
  (SELECT count(*)::int FROM subscriptions WHERE organization_id = :'org_b'),
  0, 'User A ne voit pas la subscription de l''org B'
);
SELECT is(
  (SELECT count(*)::int FROM audit_logs WHERE workspace_id = :'ws_b'),
  0, 'User A ne voit pas les audit_logs du workspace B'
);
SELECT is(
  (SELECT count(*)::int FROM audits WHERE workspace_id = :'ws_b'),
  0, 'User A ne voit pas les audits du workspace B'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Assertions — User A voit BIEN ses propres données (sanity).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT is(
  (SELECT count(*)::int FROM workspaces WHERE id = :'ws_a'),
  1, 'User A voit son propre workspace'
);
SELECT is(
  (SELECT count(*)::int FROM connectors WHERE workspace_id = :'ws_a'),
  1, 'User A voit son propre connecteur'
);
SELECT is(
  (SELECT count(*)::int FROM canonical_metrics WHERE workspace_id = :'ws_a'),
  1, 'User A voit ses propres métriques'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. Tentative d'écriture cross-tenant : User A essaye d'insérer un
--    connecteur dans le workspace B → doit échouer (policy INSERT).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT throws_ok(
  format($q$INSERT INTO connectors (workspace_id, source, account_id, status)
            VALUES ('%s', 'meta_ads', 'act_evil', 'active')$q$, :'ws_b'),
  '42501', NULL,
  'User A NE PEUT PAS insérer un connecteur dans le workspace B (WITH CHECK refuse)'
);

-- UPDATE cross-tenant : ne lève pas d'erreur (RLS filtre invisible), affecte
-- 0 row. La vérification que le row de B est intact se fait section 7 en
-- role postgres.
UPDATE connectors SET status='disabled' WHERE workspace_id = :'ws_b';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. Symétrie — User B ne voit pas non plus celles de A.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT pg_temp.simulate_user(:'user_b');

SELECT is(
  (SELECT count(*)::int FROM connectors WHERE workspace_id = :'ws_a'),
  0, 'Symétrie : User B ne voit pas les connecteurs du workspace A'
);
SELECT is(
  (SELECT count(*)::int FROM canonical_metrics WHERE workspace_id = :'ws_a'),
  0, 'Symétrie : User B ne voit pas les métriques du workspace A'
);
SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = :'org_a'),
  0, 'Symétrie : User B ne voit pas l''org de A'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. Vérification côté postgres role : le connecteur B est intact
--    après les tentatives d'écriture cross-tenant ci-dessus.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESET role;
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT status FROM connectors WHERE workspace_id = :'ws_b'),
  'active',
  'Vu en postgres : le connecteur du workspace B est resté status=active malgré tentative UPDATE cross-tenant'
);

SELECT * FROM finish();
ROLLBACK;
