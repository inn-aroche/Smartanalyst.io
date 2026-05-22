# @smartanalyst/api

Backend Express + workers BullMQ pour SmartAnalyst.io.

## Lancer en local

```bash
# Depuis la racine du monorepo
npm install
cp apps/api/.env.example apps/api/.env
# Renseigner SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, JWT_SECRET, etc.

# Terminal 1 — API HTTP
npm run dev:api

# Terminal 2 — workers BullMQ
npm run dev:worker
```

## Structure

```
src/
├── connectors/       # GA4, Meta Ads, Google Ads, Stripe, Search Console
├── services/         # auth, ai, metrics, pdf, email, billing
├── routes/           # Express routes
├── queue-jobs/       # BullMQ workers
├── lib/              # Supabase, Redis, Anthropic, logger
├── middleware/       # JWT, workspace scope, error handler
├── templates/        # Handlebars (PDF + emails)
├── app.js            # Express setup
└── server.js         # Entry point
```

## Tests

```bash
npm test --workspace=@smartanalyst/api
# ou depuis ce dossier :
npm test
```

Le runner utilise `node --test` (pas de framework externe).

## Migrations base

Les migrations Supabase vivent à la racine du monorepo (`/supabase/migrations/`) pour rester compatibles avec la CLI `supabase`. Voir `docs/04_SCHEMA_DONNEES_COMPLET.md`.
