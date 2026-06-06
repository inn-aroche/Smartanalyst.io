# Tests RLS (pgTAP)

Tests qui **prouvent l'isolation multi-tenant** en exerçant les policies
déclarées dans `supabase/migrations/008_add_rls_policies.sql` (+ `014` pour
`audits`).

## Pourquoi pgTAP plutôt que node:test ?

- Les policies RLS s'évaluent dans Postgres — un test SQL est plus proche
  de la source de vérité (`auth.uid()`, `SET LOCAL role authenticated`,
  `request.jwt.claims.sub`) qu'un test JS qui passe par PostgREST.
- Pas besoin de forger des JWT côté API.
- Tout le test tient dans un `BEGIN ... ROLLBACK` → aucune fuite en DB.

## Prérequis

- **Supabase CLI** installé (`brew install supabase/tap/supabase`).
- Un projet Supabase local lancé (`supabase start`) **ou** une DB de test
  jetable accessible en `postgres` role.

## Exécution

### Avec Supabase CLI (recommandé)

```bash
supabase test db
# ou pour ne lancer que ce fichier :
supabase test db --file supabase/tests/rls-isolation.test.sql
```

### Avec psql direct (DB de test jetable)

```bash
psql "$TEST_DATABASE_URL" -f supabase/tests/rls-isolation.test.sql
```

### Première fois — pgTAP

`CREATE EXTENSION IF NOT EXISTS pgtap;` est inclus dans le test. Si la DB ne
l'a pas, l'extension est dispo dans le repo Supabase par défaut.

## Sortie attendue

20 assertions, toutes vertes :

```
ok 1 - User A ne voit pas l'org de User B
ok 2 - User A ne voit pas le workspace de User B
...
ok 20 - Vu en postgres : le connecteur du workspace B est resté status=active...
1..20
```

## Ce qui est couvert

Pour chaque table avec RLS, vérifie qu'un user du workspace A **ne voit pas**
les rows du workspace B (et symétriquement) :

- `organizations`, `workspaces`, `workspace_members`
- `connectors`, `canonical_metrics`, `business_profiles`
- `reports`, `subscriptions`
- `audit_logs`, `audits`

Plus :
- Tentative d'**INSERT** cross-tenant → bloquée (code SQLSTATE 42501).
- Tentative d'**UPDATE** cross-tenant → ne touche aucune row (RLS filtre).
- Vérification post-test côté `postgres` role que les données du workspace
  cible n'ont **pas** été modifiées.

## Ajouter une table avec RLS

1. Migration : déclarer la table, `ENABLE ROW LEVEL SECURITY`, créer la(les)
   policy(ies).
2. Ajouter une ligne fixture dans `rls-isolation.test.sql` (section 1).
3. Ajouter une assertion `is((SELECT count(*) FROM <table> WHERE workspace_id = :'ws_b'), 0, '...')` après `simulate_user(:'user_a')`.
4. Mettre à jour `SELECT plan(N)` avec le nouveau total.

## CI

Ce test n'est **pas** branché à GitHub Actions tant que Supabase CLI n'est
pas installé dans le workflow `ci.yml`. C'est un suivi du Lot 4 du chantier
d'audit (qualité code & tests). À lancer manuellement avant chaque release.
