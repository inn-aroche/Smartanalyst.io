# Migrations Supabase en CI — setup one-time

Workflow `db-migrations.yml` (Lot 3 PR #C) qui applique automatiquement
les migrations Supabase dans `supabase/migrations/*.sql` lors d'un push
sur `main`.

Avantages vs apply manuel via le dashboard :

- Plus de "j'ai modifié le schema en prod direct, j'ai oublié de
  commit le SQL" → drift entre code et DB
- Plus de "Aurélien était en vacances, personne d'autre n'avait
  les credentials pour apply" → tout passe par GitHub
- Traçabilité : chaque migration appliquée est liée à un commit Git +
  un workflow run + un timestamp

---

## Schéma

```
PR ouvert avec nouvelle migration
        │
        │ workflow db-migrations.yml job `lint`
        │   → scripts/lint-migrations.sh
        │   → vérif naming NNN_*.sql, pas de doublon
        ▼
PR review code + lint vert
        │
        │ Merge sur main
        ▼
workflow db-migrations.yml job `apply`
        │   → supabase link --project-ref $REF
        │   → supabase migration list (état avant)
        │   → supabase db push --include-all
        │   → supabase migration list (état après)
        ▼
DB Supabase à jour
```

Sur PR (sans merge) : juste lint. **Aucun apply** — la prod ne risque
rien tant que la PR n'est pas mergée.

---

## Setup (5 min, une fois)

### 1. Créer un Personal Access Token Supabase

1. https://supabase.com/dashboard/account/tokens
2. **Generate new token** → name: `github-actions-smartanalyst`
3. **Copy** le token affiché (commence par `sbp_...`)

⚠️ Le token a accès à **TOUS** les projets de ton compte Supabase. À garder dans GitHub Secrets uniquement.

### 2. Récupérer le project ref

1. https://supabase.com/dashboard/project/_ → ouvre ton projet `smartanalyst`
2. Dans l'URL : `https://supabase.com/dashboard/project/<PROJECT_REF>/...`
3. Le `<PROJECT_REF>` ressemble à `abcdefghijklmnopqrst` (20 chars alphanum)

### 3. Récupérer le password DB

1. Dashboard Supabase → ton projet → **Project Settings** → **Database**
2. Section **Connection string** → **Database password**
3. Soit tu connais (= celui défini au setup du projet)
4. Soit tu clique **Reset database password** pour en générer un nouveau (⚠️ va casser
   l'API actuelle en prod : faudra ensuite mettre à jour
   `/srv/smartanalyst-api/apps/api/.env` SUPABASE_SERVICE_KEY si besoin —
   normalement non, le password DB est distinct du service_role JWT)

### 4. Ajouter les 3 secrets GitHub

https://github.com/inn-aroche/Smartanalyst.io/settings/secrets/actions/new

Ajoute ces 3 secrets :

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token de l'étape 1 (`sbp_...`) |
| `SUPABASE_PROJECT_REF` | Ref de l'étape 2 (20 chars) |
| `SUPABASE_DB_PASSWORD` | Password de l'étape 3 |

### 5. Tester avec workflow_dispatch

Le workflow accepte `workflow_dispatch` (déclenchement manuel) :

👉 https://github.com/inn-aroche/Smartanalyst.io/actions/workflows/db-migrations.yml → **Run workflow** → branche `main` → Run.

Le job `lint` doit passer (les 15 migrations actuelles respectent déjà le naming `NNN_*.sql`).

Le job `apply` ne tournera **PAS** sur workflow_dispatch parce qu'il a `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`. C'est volontaire — pour déclencher un apply manuel hors d'un merge, on le ferait via une autre route (job avec workflow_dispatch dédié, ou commit direct sur main).

### 6. Smoke test : apply un no-op

Pour vérifier la chaîne complète, fais un commit vide qui touche `supabase/migrations/` (ex: corrige un commentaire dans une migration existante) → push sur main → le job `apply` doit tourner et afficher "migrations already applied" car aucun nouveau fichier.

---

## Comment ajouter une nouvelle migration

```bash
# 1. Trouve le prochain numéro
ls supabase/migrations/*.sql | sort | tail -1
# → 015_add_billing_events.sql
# → prochain = 016

# 2. Crée le fichier
touch supabase/migrations/016_add_my_feature.sql

# 3. Écris ton SQL (avec IF NOT EXISTS et autres protections)
cat > supabase/migrations/016_add_my_feature.sql <<EOF
-- 016_add_my_feature.sql
-- Description courte du changement.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS my_new_field TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_my_new_field
  ON workspaces(my_new_field);
EOF

# 4. Commit + PR
git add supabase/migrations/016_add_my_feature.sql
git commit -m "feat(db): add my_new_field to workspaces"
git push -u origin claude/add-my-feature
# Ouvre PR sur GitHub → CI lint passe → merge → apply auto

# 5. Vérifier que c'est appliqué
# Dans les logs du job `apply` → étape "Verify post-push state"
# devrait montrer 016_add_my_feature.sql comme "Applied"
```

### Naming convention

`NNN_descriptive_name.sql` :
- `NNN` : 3 chiffres (zero-padded). Le lint check le pattern.
- `_descriptive_name` : snake_case, lowercase, court mais explicite.
- `.sql` : extension obligatoire.

Exemples OK :
- ✅ `016_add_billing_events_index.sql`
- ✅ `020_drop_legacy_user_preferences.sql`

Exemples KO (le lint bloquera la PR) :
- ❌ `16_add_X.sql` (manque le zero padding)
- ❌ `016_AddBillingIndex.sql` (camelCase)
- ❌ `016-add-billing.sql` (kebab-case)

### Bonnes pratiques SQL

- **Toujours `IF NOT EXISTS`** sur les `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD COLUMN`. Une migration doit être idempotente — si on la réapplique 2× ça ne doit pas planter.
- **`DROP … IF EXISTS`** pour les destructifs. Idem.
- **Pas de `DROP TABLE` sans `BEGIN/COMMIT`** : entoure-le d'une transaction pour avoir un rollback automatique en cas d'erreur.
- **Mode test** : run la migration sur ton Supabase de **staging** (si tu en as un) avant de merger. Sinon : revue extra-attentive du PR.

---

## En cas de problème

### Le job `apply` plante

1. Va dans les logs du workflow → step **"Push migrations to Supabase"**
2. Cherche l'erreur SQL exacte (ex: `column "X" already exists` → manque un `IF NOT EXISTS`)
3. Crée un PR de fix avec une nouvelle migration corrective (jamais modifier une migration déjà appliquée)

### "Drift" entre le code et la DB

**État actuel (hotfix temporaire)** : le job `apply` du workflow est désactivé sur push main car les 17 migrations 001-017 ont été appliquées manuellement via le SQL Editor Supabase **avant** la mise en place du workflow. Chaque apply manuel crée une entrée dans `supabase_migrations.schema_migrations` avec un timestamp `YYYYMMDDHHMMSS` (ex: `20260528151015`) — pas avec le nom du fichier local (`001_init_base_schema.sql`). Le CLI Supabase voit donc 17 versions distantes qui ne correspondent à aucun fichier local → `supabase db push` plante.

**Comment résoudre une fois pour toutes** (one-shot, ~10 min) :

```bash
# 1. Sur ton Mac
brew install supabase/tap/supabase    # si pas installé

# 2. Login + link
supabase login                          # ouvre un browser
supabase link --project-ref <PROJECT_REF>

# 3. Marquer les 17 timestamps comme "applied" dans l'historique distant
#    (= "ces migrations sont déjà en prod, ne les rejouez pas")
supabase migration repair --status applied \
  20260528151015 20260528151032 20260528151052 20260528151105 \
  20260528151121 20260528151131 20260528151141 20260528151207 \
  20260528151222 20260528151232 20260530105834 20260530105850 \
  20260530144305 20260531135123 20260531165340 20260531204640 \
  20260531205056

# 4. Vérifier l'alignement
supabase migration list --linked
# → tous les distants en colonne "Remote" devraient être "applied"

# 5. Optionnel : tester un push
supabase db push --dry-run
# → "All migrations are in sync"

# 6. Re-activer l'apply auto dans .github/workflows/db-migrations.yml :
#    Remplacer `if: github.event_name == 'workflow_dispatch'`
#    par      `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`
#    Commit + merge → l'apply auto reprend pour les nouvelles migrations.
```

**En attendant le repair** : appliquer les nouvelles migrations manuellement via le SQL Editor du dashboard Supabase. Le lint catch toujours les collisions de numéros (vu sur PR #44).

### "Drift" si quelqu'un modifie le schema direct via dashboard

Si quelqu'un a modifié le schema directement via le dashboard Supabase (hors fichier de migration), la prochaine apply peut plomber (un objet existe déjà alors qu'il n'est pas dans le fichier SQL).

Pour aligner :
1. `supabase db diff` (en local après `supabase link`) → voir le delta
2. Créer une migration `NNN_align_with_prod.sql` qui matche l'état actuel
3. Merge → l'apply sera no-op + le drift est documenté

### Rollback d'une migration

Pas de mécanisme automatique. Méthodologie manuelle :
1. Créer une nouvelle migration `NNN_revert_X.sql` qui annule la précédente
2. Merge → apply la revert
3. Documenter dans le commit pourquoi

---

## Sécurité

- **`SUPABASE_ACCESS_TOKEN`** : ne le mets jamais dans le code, jamais dans le `.env`
  versionné. Uniquement GitHub Secrets.
- **`SUPABASE_DB_PASSWORD`** : si tu suspectes une fuite, rotate-le via le
  dashboard Supabase (Settings → Database → Reset password) puis mets à jour
  le secret GitHub.
- **Environnement `production-db`** : tu peux ajouter des protection rules
  sur cet environnement (Settings → Environments → production-db →
  Required reviewers) si tu veux qu'un humain approuve chaque apply.
  Recommandé si tu travailles en équipe.

---

## Hors scope

- **Dry-run sur PR avec une vraie DB éphémère** : nécessite Docker + Supabase
  stack complet (Postgres + auth.users + RLS bootstrap). Trop lourd pour MVP.
  Alternative future : Supabase preview branches (feature payante).
- **Tests pgTAP en CI** : `supabase/tests/rls-isolation.test.sql` existe mais
  n'est pas câblé au workflow. À ajouter dans un PR follow-up — nécessite une
  DB de test isolée.
- **Backup automatique avant apply** : Supabase fait des PITR (Point-In-Time
  Recovery) déjà, donc on n'ajoute pas de couche custom.
