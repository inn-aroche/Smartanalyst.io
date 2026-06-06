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
| `SENTRY_DSN` | Error tracking (à câbler — voir Lot 3 du chantier d'audit) |

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
