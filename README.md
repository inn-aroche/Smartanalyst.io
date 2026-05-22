# SmartAnalyst.io

L'analyste marketing IA en français. Branche tes outils une fois. Pose tes questions en français. Reçois des insights contextualisés avec recommandations concrètes.

---

## Documentation

Toute la spec produit + technique vit dans [`docs/`](./docs). **Lire en premier** :

1. [`00_BRIEF_EXECUTIF.md`](./docs/00_BRIEF_EXECUTIF.md) — Vision, features, personas, pricing
2. [`01_CONVENTIONS_GLOBALES.md`](./docs/01_CONVENTIONS_GLOBALES.md) — Nommage, langue, timezone, canonical metrics
3. [`02_BONNES_PRATIQUES_TRANSVERSALES.md`](./docs/02_BONNES_PRATIQUES_TRANSVERSALES.md) — RGPD, sécurité, perf, a11y
4. [`03_ARCHITECTURE_GLOBALE.md`](./docs/03_ARCHITECTURE_GLOBALE.md) — Flux données, pattern Connector, RLS
5. [`04_SCHEMA_DONNEES_COMPLET.md`](./docs/04_SCHEMA_DONNEES_COMPLET.md) — DDL complet (10 migrations)

Index complet : [`docs/INDEX.md`](./docs/INDEX.md).

---

## Structure du monorepo

Le dépôt est organisé en **workspaces npm** : chaque app a ses propres dépendances mais partage `node_modules/` hoisté à la racine.

```
.
├── docs/                       # 55 documents de spec (référence absolue)
├── apps/
│   ├── api/                    # @smartanalyst/api — Express + BullMQ workers
│   │   ├── src/                #   connectors, services, routes, queue-jobs, lib, middleware, templates
│   │   ├── tests/              #   node --test
│   │   └── .env.example
│   ├── marketing/              # @smartanalyst/marketing — site vitrine Astro (statique → Hostinger Cloud)
│   │   └── src/pages/          #   index, product, pricing, securite
│   └── web/                    # @smartanalyst/web — SaaS UI (placeholder, à démarrer)
├── packages/
│   └── shared/                 # @smartanalyst/shared — PLANS, FEATURES partagés (vitrine ↔ api)
├── supabase/
│   └── migrations/             # 10 migrations SQL (idempotentes)
└── scripts/                    # Utilitaires dev/ops
```

### Déploiement cible

| Workspace | Domaine | Hébergement |
|---|---|---|
| `apps/marketing` | `smartanalyst.io` | Cloud Hosting Hostinger (build statique uploadé) |
| `apps/api` | `api.smartanalyst.io` | Railway / Render / VPS (process HTTP + workers H24) |
| `apps/web` | `app.smartanalyst.io` | même infra que l’API |

---

## Quickstart (dev local)

> **Pré-requis** : Node 20+, Redis local (ou docker), accès Supabase + Anthropic + Stripe.

```bash
# 1. Installer toutes les workspaces en une fois
nvm use && npm install

# 2. Configurer l'environnement de l'API
cp apps/api/.env.example apps/api/.env
# Renseigner SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, JWT_SECRET, etc.

# 3. Appliquer les migrations Supabase (depuis la racine)
# Via Supabase CLI : supabase db push
# Ou copier le contenu de supabase/migrations/*.sql dans le SQL editor

# 4. Lancer l'API
npm run dev:api

# 5. Lancer les workers (BullMQ) dans un autre terminal
npm run dev:worker

# 6. (Plus tard) Lancer la vitrine Astro
npm run dev:marketing
```

### Scripts racine utiles

| Commande | Effet |
|---|---|
| `npm test` | Lance les tests de tous les workspaces (`--if-present`) |
| `npm run lint` | Lint tous les workspaces |
| `npm run dev:api` | API Express en watch mode |
| `npm run dev:worker` | Workers BullMQ |
| `npm run dev:marketing` | Site Astro |

---

## Conventions (rappel essentiel)

- **Fichiers / dossiers** : `kebab-case` (ex. `ga4.connector.js`, `health-score.service.js`)
- **Classes / Types** : `PascalCase` (ex. `GA4Connector`)
- **Variables / fonctions** : `camelCase`
- **Constantes** : `UPPER_SNAKE_CASE`
- **Tables / colonnes BDD** : `snake_case`
- **Code** : anglais. **Commentaires métier** : français. **Messages user** : français. **Logs** : anglais, JSON structuré.
- **Toutes les timestamps en UTC** en base. Le fuseau horaire vit au niveau du workspace.
- **L'IA parle TOUJOURS à `canonical_metrics`**, jamais aux données brutes des connecteurs.

Détails : [`docs/01_CONVENTIONS_GLOBALES.md`](./docs/01_CONVENTIONS_GLOBALES.md).

---

## Statut

Phase 0 — Bootstrap. Voir le brief exécutif pour les jalons (J60 : 1 000 € MRR).
