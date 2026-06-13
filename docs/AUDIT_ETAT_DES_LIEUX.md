# SmartAnalyst.io — État des lieux pour audit V1

> Document de synthèse destiné à un audit externe (LLM ou humain).
> Objectif : challenger l'architecture et l'état fonctionnel pour atteindre
> une V1 réellement utilisable.
> Date : 2026-06-13 · Établi à partir d'un scan factuel du repo + DB prod.

---

## 1. Vision produit

**SmartAnalyst.io** = analyste marketing IA conversationnel pour PME et agences.
Promesse : connecter ses sources marketing (GA4, Meta Ads, Google Ads, Stripe,
Search Console…), poser des questions en langage naturel, recevoir des réponses
structurées avec **causes racines, preuves et actions recommandées**.

Positionnement : « pas un dashboard, pas un BI tool — une couche intelligente
qui comprend le business et parle en langage naturel ».

**Statut commercial** : beta privée fermée (lockdown par whitelist d'emails).
Pas encore de paiement actif. Un utilisateur random s'était inscrit → d'où le
lockdown.

---

## 2. Stack technique

| Couche | Techno |
|---|---|
| Backend API | Node.js 20, Express |
| Jobs asynchrones | BullMQ + Redis |
| Process manager | PM2 (api + worker + deploy-server) |
| Base de données | Supabase (Postgres 17) + Auth + Vault (secrets chiffrés) |
| Frontend SaaS | React 18 + Vite + TailwindCSS + React Query |
| Site marketing | Astro 5 (statique) |
| Tag tracking | esbuild (script JS embarquable) |
| IA | Google Gemini (`gemini-2.5-flash` par défaut) |
| Emails | Resend |
| Hébergement API | VPS Hostinger (2.24.9.186), Nginx + Let's Encrypt |
| Hébergement front | Cloudflare Pages (marketing + web SaaS) |
| DNS / proxy | Cloudflare |
| CI/CD | GitHub Actions → webhook deploy-server sur VPS |
| Observabilité | Sentry (@sentry/node v8 + OpenTelemetry) |

**Monorepo** : `apps/{api,web,marketing,tag,deploy-server}` + `packages/shared`.

---

## 3. Architecture & infrastructure

### Déploiement
- Marketing + Web : push `main` → Cloudflare Pages auto-build.
- API : push `main` → GHA → POST webhook au `deploy-server` (PM2) sur le VPS
  → `git pull` + `npm ci` + `pm2 reload`. (Hostinger bloquait les IPs GHA en SSH
  direct, d'où le pattern webhook.)
- Migrations DB : **auto-apply désactivé** (drift entre l'historique remote
  Supabase et les fichiers `NNN_*.sql` locaux). Appliquées manuellement via
  Supabase SQL Editor ou MCP. ⚠️ Dette à résoudre.

### Process sur le VPS (PM2)
- `smartanalyst-api` — serveur Express
- `smartanalyst-worker` — workers BullMQ
- `deploy-server` — reçoit le webhook de déploiement

### Queues BullMQ (scheduler)
| Queue | Cron | Rôle |
|---|---|---|
| data-sync | toutes les 4h | fan-out sync de tous les workspaces |
| monthly-reports | 6h/jour | check génération rapport mensuel |
| alert-check | toutes les 4h | détection anomalies/seuils |
| oauth-refresh | toutes les 4h (+15min) | refresh proactif des tokens OAuth |
| insights-generation | déclenché post-sync | **STUB, non implémenté** |

---

## 4. État fonctionnel par module

Légende : ✅ fonctionnel · 🟡 partiel/non validé live · ❌ stub ou absent

### 4.1 Authentification & comptes
| Élément | État | Détail |
|---|---|---|
| Signup email/password | ✅ | JWT |
| Login Google OAuth | ✅ | google-signin.service |
| Beta lockdown (whitelist) | ✅ | `BETA_ALLOWED_EMAILS` + middleware |
| Multi-workspace / membres | 🟡 | tables `workspaces`/`workspace_members` existent, pas d'UI d'invitation |
| Reset password | ❌ | absent |
| Profil utilisateur (modif nom/email/pwd) | ❌ | absent |

### 4.2 Connecteurs de données
| Connecteur | Code | Validé live | Notes |
|---|---|---|---|
| Stripe (apikey) | ✅ | ✅ | MRR/ARR/clients/paiements échoués — 3 metrics en prod |
| GA4 (OAuth) | ✅ | ✅ | 248 metrics en prod (m2benergy.be) |
| Meta Ads (OAuth) | ✅ | 🟡 | credentials seedés, jamais testé live |
| Shopify (OAuth) | ✅ | 🟡 | credentials seedés, jamais testé live |
| Google Ads | ❌ | — | doc existe (12_), code absent |
| Search Console | ❌ | — | doc existe (14_), code absent |
| Catalogue dynamique | ✅ | ✅ | table `integration_providers`, sanitize, cache 60s |
| Auto-sync post-OAuth | ✅ | ⏳ | PR #60 (à merger) |
| Bouton "Sync now" | ✅ | ⏳ | PR #60 |
| Sélecteur de property/account | ❌ | — | GA4 auto-pick la 1ère property |
| OAuth refresh proactif | ✅ | ✅ | scan + fan-out toutes les 4h |

### 4.3 Couche métriques canoniques
| Élément | État | Détail |
|---|---|---|
| Vocabulaire canonique (metric_key) | ✅ | mapping source→canonique versionné |
| Ingestion idempotente | ✅ | ON CONFLICT (workspace, date, metric_key, source) |
| Confidence score par metric | ✅ | défini dans le mapping |
| Audit trail valeur→source | 🟡 | source stockée, pas d'UI de drill-down |

### 4.4 Dashboard
| Élément | État | Détail |
|---|---|---|
| Tiles adaptatives selon sources actives | ✅ | round-robin par source |
| Fenêtres 7/30/90j | ✅ | |
| Empty state 0 connecteur | 🟡 | strings existent, câblage à vérifier |
| Drill-down / graphes temporels | ❌ | tiles = valeurs agrégées only |

### 4.5 Chat IA (cœur produit)
| Élément | État | Détail |
|---|---|---|
| Q&A avec contexte métriques | ✅ | injecte les metrics 30j dans le prompt |
| Citations sources cliquables | ✅ | PR #61 (à merger) |
| Suggestions de questions | 🟡 | statiques, pas adaptatives aux sources |
| Sauvegarde conversations | ❌ | éphémère, perdu au refresh |
| **Causes racines / preuves / actions** (promesse marketing) | ❌ | le prompt demande un format structuré mais **pas de moteur d'analyse causale réel** — c'est du Gemini one-shot sur des agrégats |
| Détection d'anomalies | ❌ | queue `alert-check` existe, handler à vérifier |

### 4.6 Insights proactifs (promis sur la home)
| Élément | État |
|---|---|
| Génération d'insights post-sync | ❌ **STUB** (`insights.handler.js` log only) |
| Score de santé des données | ❌ (mocké sur la home marketing) |
| Benchmark sectoriel | ❌ |

### 4.7 Rapports
| Élément | État | Détail |
|---|---|---|
| Tables `reports`/`report_data` | ✅ | créées, 0 rows |
| Route `/api/v1/reports` | ❌ | **commentée dans app.js** |
| Génération PDF | ❌ | dossier `services/pdf/` vide |
| Cron mensuel | 🟡 | scheduler enregistré, handler scan existe mais pas de génération réelle |

### 4.8 SmartTag (tracking maison) + Audit
| Élément | État | Détail |
|---|---|---|
| Script tag embarquable | ✅ | `apps/tag`, endpoint `/track` |
| Dashboard Live temps réel | ✅ | événements streamés (page Live.tsx) |
| Audit SEO / GEO / AI on-demand | ✅ | analyzers + table `audits` (1 row en prod) |
| Onboarding scraper (analyse URL site) | ✅ | Playwright scrape + détection profil business |

### 4.9 Onboarding utilisateur
| Élément | État | Détail |
|---|---|---|
| Endpoint analyse URL → profil | ✅ | `/onboarding/analyze` (scraper + Gemini) |
| Table `business_profiles` | ✅ | 0 rows (jamais utilisé en prod) |
| First-run wizard UI | ❌ | absent |
| Welcome email beta | ❌ | Resend câblé uniquement sur waitlist |

### 4.10 Billing & abonnements
| Élément | État | Détail |
|---|---|---|
| Tables `subscriptions` + `billing_events` | ✅ | 0 rows |
| Webhook receiver `/webhooks/stripe` | ✅ | signature HMAC + idempotence |
| Handlers métier (créer/maj sub, dunning) | ❌ | **STUB** — events loggés en "TODO Lot 2" |
| Checkout Session endpoint | ❌ | absent |
| Customer Portal endpoint | ❌ | absent |
| Wire boutons Pricing → Checkout | ❌ | boutons marketing morts |
| Plan enforcement / quotas | ❌ | free/starter/pro/agency identiques |
| Trial 14j | ❌ | |

### 4.11 Marketing (site vitrine)
| Élément | État |
|---|---|
| Home FR/EN (hero, problème, features, pricing) | ✅ |
| Pages product (+ [slug]), pricing, security, use-cases, glossary, resources | ✅ |
| Page /beta + waitlist | ✅ |
| Page status (health temps réel) | ✅ |
| Logos connecteurs officiels | ✅ |
| Blog / contenu SEO réel | 🟡 structure only |
| Cookie banner / CMP (RGPD) | ❌ |
| CGV / Mentions légales | 🟡 privacy existe, CGV absent |

---

## 5. Schéma de données (tables prod réelles)

| Table | RLS | Rows | Rôle |
|---|---|---|---|
| organizations | ✅ | 2 | tenant racine |
| workspaces | ✅ | 2 | espace de travail |
| workspace_members | ✅ | 2 | membres + rôles |
| connectors | ✅ | 2 | sources connectées (tokens chiffrés Vault) |
| canonical_metrics | ✅ | 251 | métriques normalisées |
| integration_providers | ✅ | 4 | catalogue connecteurs |
| business_profiles | ✅ | 0 | profil détecté à l'onboarding |
| audits | ✅ | 1 | audits SEO/GEO/AI |
| reports | ✅ | 0 | rapports générés |
| report_data | ✅ | 0 | données rapport |
| subscriptions | ✅ | 0 | abonnements Stripe |
| billing_events | ✅ | 0 | ledger webhooks Stripe |
| audit_logs | ✅ | 45 | trace actions |
| waitlist_signups | ✅ | 1 | inscriptions beta |
| feature_flags | ❌ | 3 | **RLS DÉSACTIVÉE — voir §6** |

---

## 6. Sécurité

### En place ✅
- Secrets chiffrés via Supabase Vault (tokens OAuth, clés API connecteurs,
  Client ID/Secret providers)
- RLS activée sur 14/15 tables (service-role bypass, anon/auth deny par défaut)
- Signature HMAC sur webhook Stripe
- JWT auth + middleware workspace-scope + requireRole
- Comparaison de tokens en `timingSafeEqual`
- CSP headers, HTTPS forcé (Let's Encrypt)
- Rate limiting par user (chat 20/min, onboarding 20/h)
- Beta lockdown fail-closed

### ⚠️ Points à challenger
1. **`feature_flags` a RLS DÉSACTIVÉE** — exposée à anyone avec l'anon key.
   Remédiation : `ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;`
   (+ policies). À traiter.
2. Rate limiting **par user uniquement**, pas par IP global sur tous les
   endpoints sensibles.
3. Pas de 2FA admin.
4. Pas d'audit log exhaustif des actions (45 rows = sous-utilisé).
5. Pas de pentest externe.
6. Drift migrations = risque de divergence schéma prod/code non tracée.

---

## 7. Couverture de tests

- **224 tests** unitaires (node:test), 20 fichiers.
- Couvre : connectors (base/ga4/stripe), webhook Stripe, canonical mapping,
  oauth-refresh, oauth-state, queue handlers, DLQ, health, metrics routes,
  beta-access, waitlist, env-validator, audit analyzers, website-scraper.
- **Absent** : tests e2e (Playwright), tests d'intégration API réels,
  tests frontend (React), tests de charge, rapport de coverage.

---

## 8. Dette technique & risques connus

| # | Risque | Gravité | Note |
|---|---|---|---|
| 1 | Migrations auto-apply désactivées (drift) | 🔴 | schéma prod non garanti = code |
| 2 | Insights proactifs = stub | 🔴 | promesse #1 du produit non tenue |
| 3 | Moteur "causes racines" inexistant | 🔴 | le chat fait du Gemini one-shot, pas d'analyse causale |
| 4 | Billing Lot 2 absent | 🟠 | pas de monétisation possible |
| 5 | Rapports non fonctionnels (route commentée) | 🟠 | promesse marketing |
| 6 | RLS off sur feature_flags | 🟠 | faille d'exposition |
| 7 | Meta/Shopify jamais validés live | 🟡 | risque de bug non détecté |
| 8 | Pas de sauvegarde conversations chat | 🟡 | UX |
| 9 | Pas de tests frontend ni e2e | 🟡 | régressions UI invisibles |
| 10 | VPS single point of failure (pas de HA) | 🟡 | infra |

---

## 9. Gaps critiques pour une V1 réellement fonctionnelle

Par ordre de criticité produit :

1. **Tenir la promesse "causes + preuves + actions"** — aujourd'hui le chat
   répond mais ne fait pas d'analyse causale ni de corrélation cross-source.
   C'est le différenciateur central et il est creux.
2. **Insights proactifs** — implémenter le handler (détection variations,
   anomalies) au lieu du stub.
3. **Onboarding first-run** — un beta user qui arrive ne sait pas quoi faire.
4. **Valider Meta + Shopify live** — sinon 2/4 connecteurs sont théoriques.
5. **Welcome email** — automatiser l'invitation beta.
6. **Billing Lot 2** — si on veut tester la conversion payante.
7. **Résoudre le drift migrations** — fiabilité du déploiement.

---

## 10. Questions à poser à l'auditeur

1. Le différenciateur (analyse causale conversationnelle) justifie-t-il le
   produit, ou est-ce un wrapper Gemini sur des agrégats ? Comment le rendre
   réellement défendable techniquement ?
2. L'architecture canonique (metric_key source-agnostique) tient-elle à
   l'échelle (10+ connecteurs, métriques hétérogènes) ?
3. Le modèle one-shot (tout le contexte dans le prompt) scale-t-il, ou faut-il
   du RAG / function-calling / agentic tool-use sur les données ?
4. Quel est le strict minimum fonctionnel pour une V1 payante crédible ?
5. Quels raccourcis pris (stubs, mocks marketing) créent un risque de
   promesse non tenue vis-à-vis des premiers clients ?
6. Priorisation : compléter les connecteurs (largeur) ou approfondir
   l'intelligence (profondeur) en premier ?

---

## Annexe — PRs récentes en attente de merge
- PR #60 : auto-sync post-OAuth + bouton Sync now + cron 4h
- PR #61 : citations sources cliquables dans le chat
