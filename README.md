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

## Structure du repo

```
.
├── docs/                       # 55 documents de spec (référence absolue)
├── src/
│   ├── connectors/             # GA4, Meta Ads, Google Ads, Stripe, Search Console
│   ├── services/
│   │   ├── auth/               # JWT, OAuth, password reset
│   │   ├── ai/                 # Insights, chat, anomaly detection
│   │   ├── metrics/            # Canonical metrics layer + health score
│   │   ├── pdf/                # Génération rapports (Playwright)
│   │   ├── email/              # Resend transactional
│   │   └── billing/            # Stripe
│   ├── routes/                 # Express routes
│   ├── queue-jobs/             # BullMQ workers
│   ├── lib/                    # Supabase, Redis, Anthropic, logger
│   ├── middleware/             # JWT, workspace scope, error handler
│   ├── templates/              # Handlebars (PDF + emails)
│   ├── app.js                  # Express setup
│   └── server.js               # Entry point
├── supabase/
│   └── migrations/             # 10 migrations SQL (idempotentes)
├── frontend/                   # SaaS UI (HTML/JS vanilla)
├── vitrine/                    # Site marketing (landing, pricing, product)
├── scripts/                    # Utilitaires dev/ops
└── tests/
```

---

## Quickstart (dev local)

> **Pré-requis** : Node 20+, Redis local (ou docker), accès Supabase + Anthropic + Stripe.

```bash
# 1. Installer
nvm use && npm install

# 2. Configurer l'environnement
cp .env.example .env
# Renseigner SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, JWT_SECRET, etc.

# 3. Appliquer les migrations Supabase
# Via Supabase CLI : supabase db push
# Ou copier le contenu de supabase/migrations/*.sql dans le SQL editor

# 4. Lancer l'API
npm run dev

# 5. Lancer les workers (BullMQ) dans un autre terminal
npm run worker
```

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
