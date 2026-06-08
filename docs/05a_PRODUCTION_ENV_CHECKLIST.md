# Production environment checklist — apps/api

Variables d'environnement **obligatoires** pour le déploiement production de l'API
(`api.smartanalyst.io`, PM2 `smartanalyst-api`). À synchroniser avec le secret
GitHub `API_ENV_FILE` consommé par `.github/workflows/deploy-api.yml`.

Ne **jamais** committer les valeurs réelles. Ne **jamais** coller ce fichier
rempli dans un canal non-chiffré (Slack, email, chat).

## Bloquants (sans ces vars, l'API démarre mais des features cassent silencieusement)

| Variable | Pourquoi c'est bloquant | Symptôme si absent |
|---|---|---|
| `NODE_ENV=production` | Active le mode prod (Helmet HSTS, redirect HTTPS, log JSON) | Modes dev permissifs, secrets en logs pretty |
| `VAULT_ENABLED=true` | Active le chiffrement Vault des secrets DB | Tokens OAuth stockés en clair → fuite si dump DB |
| `JWT_SECRET=<≥32 chars random>` | Signature JWT | Auth cassée |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` | Accès DB | Tout casse |
| `OAUTH_REDIRECT_URI=https://api.smartanalyst.io/api/v1/connectors/oauth/callback` | URL renvoyée aux providers OAuth | `redirect_uri_mismatch` côté Google/Meta/Shopify |
| `APP_URL=https://app.smartanalyst.io` | Redirect post-OAuth vers le frontend | Callback OAuth atterrit sur API |
| `CORS_ALLOWED_ORIGINS=https://app.smartanalyst.io,https://smartanalyst.io` | CORS strict | Frontend bloqué |

## Connecteurs (obligatoires si le connecteur correspondant est activé en prod)

| Variable | Provider | Note |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | GA4 | App OAuth Web type, redirect = `OAUTH_REDIRECT_URI` |
| `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET`, `GOOGLE_LOGIN_REDIRECT_URI` | Google Sign-In | OAuth client séparé du connecteur GA4 |
| `META_APP_ID`, `META_APP_SECRET` | Meta Ads | App en mode Live |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | Shopify | App publique (Shopify Partner Dashboard) |
| `STRIPE_SECRET_KEY=sk_live_*` | Stripe | Mode live obligatoire en prod |
| `STRIPE_WEBHOOK_SECRET=whsec_*` | Stripe | Récupéré depuis Stripe Dashboard webhooks |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY` | Stripe | Price IDs des plans |

## Services tiers

| Variable | Service | Note |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (audit, chat, insights) | Requis pour toutes les features IA |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | Emails transactionnels |
| `REDIS_URL` | Redis (BullMQ + cache + WS pub/sub) | URL avec auth si Redis managé |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Google Gemini (optionnel, fallback) | Pas bloquant |

## Observabilité (optionnels mais recommandés)

| Variable | Rôle |
|---|---|
| `LOG_LEVEL=info` | Niveau de log Pino (default debug en dev, info en prod) |
| `SLACK_WEBHOOK_URL` | Alertes ops (jobs failed, sync errors) |
| `ADMIN_TOKEN` | Auth pour `/admin/queues/*` (DLQ + retry, voir doc 20). ≥ 32 chars. Si absent, les endpoints répondent 503 `admin_disabled` mais l'API tourne normalement. Génère avec `openssl rand -hex 32`. |
| `SENTRY_DSN` | Error tracking. Sans ça, les erreurs prod ne partent nulle part. Crée un projet "Node.js" sur sentry.io. |
| `SENTRY_ENVIRONMENT=production` | Tag les events Sentry (default = `NODE_ENV`). |
| `SENTRY_TRACES_SAMPLE_RATE=0.1` | % de requêtes échantillonnées pour les traces perf. 0.1 = 10%. Mettre 1.0 en debug, 0 pour désactiver. |
| `SENTRY_RELEASE` | **Ne pas mettre dans le `.env` prod**. Injecté automatiquement par `scripts/deploy-api.sh` = commit SHA. Permet à Sentry d'associer chaque event à une release et de proposer un rollback. |

### Setup Sentry (5 min)

1. https://sentry.io → New project → Platform: Node.js → Project name: `smartanalyst-api`.
2. Copie le DSN affiché.
3. Ajoute dans le secret GitHub `API_ENV_FILE` (et localement dans `apps/api/.env`) :
   ```
   SENTRY_DSN=https://xxx@oNNN.ingest.sentry.io/PROJECT_ID
   SENTRY_ENVIRONMENT=production
   SENTRY_TRACES_SAMPLE_RATE=0.1
   ```
4. Redéploie. Au prochain crash 5xx, l'event apparaît dans Sentry avec le commit SHA, le route, l'IP, le user.id (si auth) et le stack trace.

Sans `SENTRY_DSN`, l'API boote normalement — c'est juste qu'aucun event n'est envoyé (no-op silencieux).

## Vérification au boot

À ajouter dans `apps/api/src/server.js` (TODO Lot 3) : fail-fast au démarrage
si une des variables "Bloquantes" est absente, plutôt que de découvrir le
problème au 1er appel d'une feature.

## Procédure de mise à jour

1. Modifier le secret GitHub `API_ENV_FILE` (Settings → Secrets and variables
   → Actions → `API_ENV_FILE`) — copier-coller depuis le `.env` local
   maintenu en clair sur la machine de l'admin.
2. Re-déclencher le workflow `deploy-api.yml` (Actions UI ou commit) — il
   écrase le `.env` sur le VPS depuis le secret.
3. Vérifier les logs PM2 après reload : `pm2 logs smartanalyst-api` côté VPS.
4. Pour `VAULT_ENABLED` en particulier : confirmer qu'un decrypt log montre
   `mode: vault` (pas `mode: passthrough`) via une feature qui touche un
   secret (ex: `GET /api/v1/connectors/catalog` avec un provider configuré).
