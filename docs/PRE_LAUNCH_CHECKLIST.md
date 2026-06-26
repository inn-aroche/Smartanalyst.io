# Pré-launch checklist — Ouverture publique SmartAnalyst

> **Audience :** Aurélien (toi). Ce document liste TOUT ce qui doit être validé manuellement avant d'ouvrir au public — les choses qu'un agent code ne peut pas/ne doit pas faire seul.
> **Référence :** CLAUDE.md § « Exige une validation humaine ».
> **Status :** ☐ = à faire · ☑ = fait · ⚠ = en cours/bloqué.

Marque chaque ligne au fur et à mesure. Un seul ⚠ critique = on n'ouvre pas.

---

## 0. Sanity check final (1h)

- [ ] `main` build vert sur Netlify (dernier deploy < 24h)
- [ ] API VPS répond `/health/ready` 200 (Postgres + Redis OK)
- [ ] `npm run e2e` passe sur `apps/web` (smoke tests Playwright)
- [ ] `node --test tests/*.test.js` passe sur `apps/api` (522+ tests)
- [ ] Cmd+K (search) fonctionne, `/help` accessible, `QuotaChip` visible sur compte Free de test

---

## 1. Stripe LIVE + TVA (3-4h) 🔴 **BLOQUANT**

Tu m'as dit STOP avant ça — c'est toujours valable. Je marque les étapes pour mémoire mais c'est toi qui actionnes.

### 1.1 Bascule Stripe TEST → LIVE
- [ ] Dans le dashboard Stripe → **Activate account** (KYB complet : SIREN, RIB, justificatif identité, statuts de société). Délai validation Stripe : 1-3 jours.
- [ ] Une fois validé, **recréer les produits en mode LIVE** :
  - Pro 59 €/mois → noter le nouveau `price_xxx`
  - Starter 29 €/mois → noter le nouveau `price_xxx`
- [ ] **Reconfigurer le webhook LIVE** : URL `https://api.smartanalyst.io/api/v1/webhooks/stripe` + events :
  - `customer.subscription.created/updated/deleted`
  - `invoice.payment_succeeded/payment_failed`
  - `checkout.session.completed`
  - Copier le nouveau `whsec_…` LIVE.
- [ ] Sur le VPS Hostinger :
  ```bash
  ssh root@2.24.9.186
  cd /var/www/smartanalyst-api
  # Editer .env :
  STRIPE_SECRET_KEY=sk_live_…
  STRIPE_WEBHOOK_SECRET=whsec_… (LIVE, pas TEST)
  STRIPE_PRICE_PRO=price_… (LIVE)
  STRIPE_PRICE_STARTER=price_… (LIVE)
  STRIPE_PUBLISHABLE_KEY=pk_live_…   # si exposée au front
  pm2 reload smartanalyst-api
  ```
- [ ] Sur Netlify si la clé publishable est utilisée côté front : ajouter `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` et redeploy.
- [ ] **Test E2E réel** : créer un compte test avec une vraie CB (la tienne), faire un checkout Pro 59 €, vérifier que `billing_events` reçoit l'event LIVE et que le plan passe à `pro`. Puis annuler depuis le portail Stripe pour rembourser.

### 1.2 TVA (FR + UE)
- [ ] Dans Stripe → **Tax** → activer **Stripe Tax** (collecte auto TVA selon le pays du client).
- [ ] Renseigner ton **numéro TVA FR** + statut (auto-entrepreneur sans TVA vs société assujettie).
- [ ] Vérifier que les **factures auto-générées par Stripe** contiennent :
  - Ton SIREN + raison sociale + adresse
  - Numéro TVA intracommunautaire (si applicable)
  - Mention « TVA non applicable, art. 293 B du CGI » si tu es en franchise
- [ ] Tester sur 1 client UE et 1 client FR — vérifier la facture.

---

## 2. Délivrabilité email (SPF / DKIM / DMARC) (2h) 🔴 **BLOQUANT**

Sans ça, les emails d'invitation et de digest finissent en spam. Bloque l'activation des invités équipe.

### 2.1 Resend → DNS
- [ ] Dans Resend dashboard → **Domains** → ajouter `smartanalyst.io`.
- [ ] Copier les 3 enregistrements TXT (SPF, DKIM, MX optionnel) que Resend te donne.
- [ ] Chez ton registrar DNS (OVH/Cloudflare/etc.) ajouter :
  - **SPF** : `v=spf1 include:_spf.resend.com -all` (en TXT à la racine)
  - **DKIM** : `resend._domainkey` → la valeur fournie par Resend
  - Vérifier qu'aucun autre SPF existant ne casse celui-là
- [ ] **DMARC** (recommandé) : TXT à `_dmarc.smartanalyst.io` :
  ```
  v=DMARC1; p=quarantine; rua=mailto:postmaster@smartanalyst.io; ruf=mailto:postmaster@smartanalyst.io; pct=100
  ```
- [ ] Attendre propagation (15 min – 24h). Dans Resend → **Verify**, les 3 lignes doivent passer en vert.
- [ ] **Test délivrabilité** : envoyer 1 invitation team via l'app vers une Gmail et une Outlook personnelle. Doit arriver dans la inbox principale, pas dans Promotions/Spam.
- [ ] Outils : https://www.mail-tester.com (envoie un mail au lien fourni, regarde le score ; viser ≥ 9/10).

### 2.2 Sender reputation
- [ ] Configurer le **from address** dans Resend = `noreply@smartanalyst.io` (ou `hello@`) — PAS un Gmail.
- [ ] **Pré-chauffer** le domaine : ne pas envoyer 10 000 emails d'un coup le jour J. Échauffer progressivement (10 → 50 → 200 / jour sur 7 jours).
- [ ] S'inscrire à **Google Postmaster Tools** (`postmaster.google.com`) pour suivre la réputation côté Gmail.

---

## 3. Sécurité avant ouverture (4-8h) 🔴 **BLOQUANT**

### 3.1 Audit de surface
- [ ] **Variables d'environnement secrets** : vérifier qu'aucun `.env.*` n'est dans le git. `git log --all --diff-filter=A -- ".env*"` doit être vide.
- [ ] **API keys exposées** : check `https://github.com/inn-aroche/Smartanalyst.io/security/secret-scanning`. Si Anthropic/Stripe/Gemini keys ont fuité, les **rotater** maintenant.
- [ ] **CORS** : tester que `https://app.smartanalyst.io` peut appeler l'API, mais pas un domaine random (`curl -H "Origin: https://evil.com"` doit échouer).
- [ ] **Rate-limit** : le `globalLimiter` (100 req / 15 min / IP) et `askLimiter` chat (20 / min) sont en place. Test : burst 200 requêtes en 1 min sur `/api/v1/chat/stream` doit retourner 429.

### 3.2 RLS Postgres
- [ ] **Test isolation multitenant en PROD** (cf. CLAUDE.md) : créer 2 workspaces dans 2 orgs différentes, vérifier qu'un user A ne peut JAMAIS lire les données de l'org B via une requête forgée (modif query param `workspaceId`). Refus 403 attendu.
- [ ] Lancer `mcp__Supabase__get_advisors` régulièrement — corriger toutes les recommandations RLS rouges.

### 3.3 Pentest
- [ ] Option 1 (gratuit, basique) : passer https://app.smartanalyst.io dans **OWASP ZAP** mode automated scan (1h). Lire le rapport, fixer les alertes High.
- [ ] Option 2 (payant, sérieux) : commander un **mini-pentest** chez Yes We Hack / Synacktiv / Yogosha. Tarif 2-5k€ pour 3-5j de test. À faire au moins 1× avant ouverture publique.
- [ ] Mettre en place un fichier `/.well-known/security.txt` listant un email de contact (pour les white-hat).

---

## 4. Conformité juridique (1-3j) 🔴 **BLOQUANT pour B2B sérieux**

### 4.1 RGPD
- [ ] **CGU** + **Politique de confidentialité** + **Mentions légales** — déjà publiées sur `smartanalyst.io/legal/*`. Faire **relire par un avocat** spécialisé tech (ex. Cabinet Reed Smith, Olivier Itéanu). Tarif : 800-1500 € pour relecture + ajustements.
- [ ] **DPA (Data Processing Agreement)** template disponible pour les clients B2B qui le demandent. À pré-rédiger (réutiliser ceux de Mistral / Doctolib comme base).
- [ ] **Registre des traitements** (art. 30 RGPD) : doc interne listant chaque type de donnée traitée + base légale + durée de conservation. Modèle CNIL.
- [ ] **Désigner un DPO** (interne ou externe). Si moins de 250 salariés et pas de traitement à risque, optionnel mais recommandé.
- [ ] **Cookie consent** déjà implémenté (ConsentBanner.tsx) — vérifier qu'il bloque PostHog avant consentement.

### 4.2 AI Act (UE)
- [ ] SmartAnalyst utilise Gemini + Claude → on est **déployeur** d'un système d'IA général. Pour l'instant peu d'obligations (le règlement entre progressivement en vigueur 2025-2027). À surveiller :
  - Obligation de **transparence** : indiquer clairement que les insights sont générés par IA (déjà le cas dans la copy).
  - Obligation de **documentation** : tenir une fiche technique du système (modèles utilisés, finalité, données entrées). À rédiger 1 page.

### 4.3 Cadre fiscal/social
- [ ] Si tu factures > 36 800 € HT/an en auto-entrepreneur, tu sors du seuil franchise TVA → bascule TVA + comptable.
- [ ] Souscrire une **RC Pro tech** (Hiscox, AIG…) — 500-1500 €/an pour 1M€ de couverture. Demandé par 80% des clients B2B sérieux.

---

## 5. Opérations / monitoring (3-4h)

### 5.1 Monitoring
- [ ] **Sentry** configuré (déjà fait, vérifier la quota du free tier suffit).
- [ ] **Uptime monitoring** externe : UptimeRobot ou BetterStack pour pinguer `/health` toutes les 60s. Alerte SMS si down.
- [ ] **Métriques Postgres** : Supabase dashboard → vérifier qu'on n'approche pas les quotas du plan (rows, storage, egress).
- [ ] **Métriques Redis** (BullMQ queues) : `pm2 logs` régulièrement sur le VPS. Pas de jobs en DLQ qui s'accumulent.
- [ ] **PostHog funnel** : créer 1 funnel "Activation" avec `signup` → `connector_connect_succeeded` → `chat_message_sent` → `chat_action_taken`. Mesurable dès le 1er user bêta.

### 5.2 Backup / DR
- [ ] **Supabase backup** : vérifier que les backups quotidiens sont activés (Settings → Database). Plan Pro Supabase recommandé pour les PITR (Point-In-Time Recovery 7j).
- [ ] **VPS Hostinger** : configurer un snapshot quotidien (Hostinger Cloud Backups, ~5 €/mois).
- [ ] **Plan DR** : écrire une procédure de 1 page "Si la prod tombe, je restore depuis Supabase backup X et je redéploie l'API via PM2 — voici les étapes". Tester en sandbox au moins 1× avant ouverture.

### 5.3 Support
- [ ] Créer la mailbox `support@smartanalyst.io` (via Resend ou Google Workspace).
- [ ] **SLA réponse bêta** : définir et publier sur `/help` (24h en jours ouvrés).
- [ ] Outil : Crisp ou Front pour gérer le pipe. Pour la bêta, un Gmail label suffit.
- [ ] Préparer 3-4 **macros réponse** pour les questions fréquentes (connecter GA4, oublier MDP, upgrade Pro).

---

## 6. Marketing / communication (3-4h)

- [ ] **Marketing site** (`smartanalyst.io`) à jour avec :
  - Pricing aligné (Free / Starter 29 € / Pro 59 €) — déjà fait via PR #128
  - Page `/use-cases` testimonials beta — au moins 2-3 avant ouverture
  - **Status page** publique : créer un `status.smartanalyst.io` (BetterStack Status Page, free tier)
- [ ] **OG image** sur chaque page (LinkedIn / Twitter preview correct).
- [ ] **Sitemap.xml** + `robots.txt` à jour (vérifier qu'on n'a pas oublié les nouvelles pages).
- [ ] **Google Search Console** + **Bing Webmaster Tools** : claim ownership + submit sitemap.
- [ ] **Plan de lancement** : annoncer sur quels canaux et quand (Indie Hackers, ProductHunt, LinkedIn perso, newsletters spécialisées marketing data).

---

## 7. Test final E2E manuel (2h) 🔴 avant ouverture publique

À faire toi-même la veille du lancement, avec une CB réelle :

1. [ ] Inscription depuis le marketing site → email de confirmation reçu (vérifier inbox + spam)
2. [ ] Login → BriefHome → barre activation visible
3. [ ] Connecter GA4 (OAuth réel) → premier insight apparaît < 5 min
4. [ ] Aller sur chat → quick-cards visibles → cliquer "Compare canaux" → réponse + chart inline
5. [ ] Cliquer 📌 Pin sur un KPI → upgrade prompt visible (plan Free)
6. [ ] Upgrade vers Pro (Stripe LIVE 59 €) → checkout réel → retour app → plan = Pro
7. [ ] Re-cliquer Pin → widget apparaît sur BriefHome
8. [ ] Générer un rapport → email reçu, lien fonctionne
9. [ ] Inviter un membre par email → email reçu sur 2e compte → accept → membership créé
10. [ ] Annuler abo depuis Stripe Customer Portal → plan revient à Free → quotas reviennent

Si une de ces 10 étapes échoue, **ne pas ouvrir** tant que ce n'est pas fix.

---

## 8. Communication go-live (J-1 → J+7)

- [ ] J-7 : envoyer un mail aux inscrits waitlist annonçant la date d'ouverture
- [ ] J-1 : status page publique en mode "ready"
- [ ] J : post LinkedIn personnel + post ProductHunt (timing 00h01 PST = 9h Paris)
- [ ] J+1 : monitorer Sentry + PostHog activation funnel toutes les 2h
- [ ] J+3 : envoyer un mail "comment ça se passe ?" aux 10 premiers signups
- [ ] J+7 : rétrospective interne — quels insights collectés ? Qu'est-ce qu'on a appris ?

---

## Annexe — Ce qui est DÉJÀ en place (rappel)

Pour info, voici ce qui est shippé et qui ne demande PLUS d'action :

- Cahier Lots 0/1/2/3/4 (cahier original) complet
- Cahier 22b V2.1/V2.2/V2.3 (chat copilote Julius-level) complet
- 522 tests API + Playwright smoke E2E
- Bundle splitting (−47% initial gzip)
- 100% des emails sortants migrés vers `email-template` (cohérence brand)
- Pricing aligné avec entitlements (anti-fuite revenus Starter)
- QuotaChip Topbar + toast 80%
- Onboarding 5-steps (OnboardingFlow) + barre activation 3-steps
- Page `/help` complète
- Migrations Supabase 001 → 037 appliquées en prod

---

**Dernière mise à jour :** `2026-06-23` (next-steps D+E+F livrés).
