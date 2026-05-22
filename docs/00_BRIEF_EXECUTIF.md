# 00_BRIEF_EXECUTIF.md

## Vue d'ensemble

Ce document verrouille la **vision produit** de SmartAnalyst en une page. C'est la référence absolue pour tous les développeurs, designers, et partenaires. Chaque décision (technique, design, pricing) doit pouvoir se tracer jusqu'à une ligne de ce brief.

**Pour qui :** PDG, investisseur, Product Manager, tous les LLM développeurs.

**À lire avant :** Rien. C'est le point de départ.

---

## La promesse

> **L'analyste marketing dont tu as besoin au quotidien.**
> 
> Branche tes outils une fois. Pose tes questions en français. Reçois des insights contextualisés avec recommandations concrètes. Tes rapports clients partent tout seuls le 1er du mois.

**Ce que SmartAnalyst n'est PAS :**
- Un tableau de bord statique (type Looker Studio)
- Un outil de reporting classique (type AgencyAnalytics)
- Un Data Warehouse (type Supabase, BigQuery)
- Une alternative à ChatGPT (type Claude vanilla)

**Ce que SmartAnalyst EST :**
- Un analyste IA conversationnel connecté en live à tes données
- Une plateforme qui détecte les anomalies avant que tu les voies
- Un rapport automatisé que tu envoies aux clients sans toucher à un chiffre
- Un contexte business intelligent (qui sait que tu es en e-commerce, pas SaaS)

---

## Les 8 features (par ordre d'importance)

### 1. **Analyse conversationnelle** ← FEATURE PRINCIPALE

L'utilisateur pose une question en français naturel :
- "Quelle est ma campagne Meta la plus rentable ce mois ?"
- "Mon budget Google Ads est-il bien alloué ?"
- "Quel article de blog ramène le plus de conversions ?"

**Réponse :** Données sourcées, contextualisées, avec recommandation concrète. C'est l'interface qu'on ouvre tous les jours.

**Métrique :** Activation J1 (premier message < 10 minutes après signup).

---

### 2. **Dashboard**

Vue synthétique en temps réel à chaque ouverture.

**Composants :**
- Score de santé global (0-100) + variation semaine précédente
- 4-6 KPIs clés avec sparklines 30 jours glissants
- Alertes actives visibles (🔴 rouge, 🟡 amber, 🔵 bleu)
- Bouton "Générer rapport" (CTA prominent)

**Objectif :** Répondre à "est-ce que ça va ?" en 3 secondes sans poser de question.

---

### 3. **Insights proactifs automatiques**

Sans action de l'utilisateur, le système :
- Détecte les anomalies avant que l'utilisateur les voit
- Génère 3-5 insights par semaine avec recommandations
- Envoie des alertes temps réel si seuil critique franchi

**Exemple :** Lundi 8am, email : "Ta ROAS Meta a baissé de 18% cette semaine. Les conversions baissent mais le spend reste stable. Test réduction budget ou pivot audience ce week-end."

---

### 4. **Benchmark concurrentiel**

Comparaison des performances vs le secteur d'activité détecté à l'onboarding.

**Exemple :** "Votre ROAS Meta de 3.2× est dans le top 30% des boutiques mode en mai 2025."

**Deux couches :**
- **MVP (Phase 1)** : Données publiques (WordStream, Meta, Google, Semrush). Trimestriel.
- **V2 (Mois 4-6)** : Données agrégées anonymisées des utilisateurs SmartAnalyst. Temps réel. Fossé concurrentiel majeur.

---

### 5. **Score de santé global**

Un score 0-100 mis à jour hebdomadairement (chaque lundi minuit).

**Breakdown :**
- Paid performance (0-100) : Meta, Google Ads, etc.
- Organic performance (0-100) : GA4, Search Console
- Conversion (0-100) : Events, CMC, taux conversion
- Revenue (0-100) : Stripe, MRR, churn

**Historisé sur 12 mois.** Alert si chute > 15 points en 7 jours.

---

### 6. **Rapports automatiques**

Le 1er du mois (jour configurable par client), les rapports PDF partent automatiquement.

**Characteristics :**
- White-label (logo, couleurs, footer agence)
- Commentaire exécutif IA (200-350 mots)
- Données + insights du mois
- Benchmark vs secteur
- Pas de manuel, pas de clic

**Règle :** Un rapport/mois max (idempotence). Si déjà généré ce mois, pas de regénération auto.

---

### 7. **Connecteurs multi-sources**

Toutes les données normalisées et comparables entre elles.

**P1 MVP :**
- GA4 (sessions, conversions, revenue, pages)
- Meta Ads (spend, impressions, ROAS, CPA)
- Google Ads (spend, clicks, conversions, ROAS)
- Stripe (MRR, churn, LTV, failed payments)
- Search Console (queries, clicks, impressions, CTR)

**Fondation architecturale :** Canonical Metrics (un schéma universel pour toutes les sources).

---

### 8. **Profil business intelligent**

Analyse automatique du site web à l'onboarding.

**Détecte :**
- Secteur (ecommerce, SaaS, agency, local_business, media, professional_services)
- Marché (B2B, B2C, B2B2C)
- Outils détectés (Shopify, WooCommerce, GA4, Meta Pixel, GTM, CMS)
- Mots-clés de marque (pour contextualiser l'IA)

**Tous les insights sont contextualisés** à ce profil. Jamais génériques.

---

## Hiérarchie d'usage

1. **Analyse conversationnelle** ← usage quotidien (feature principale)
2. **Dashboard** ← vue d'ensemble à chaque connexion
3. **Insights proactifs** ← usage hebdomadaire passif
4. **Benchmark** ← usage mensuel (décision budget)
5. **Score de santé** ← KPI de synthèse
6. **Rapports auto** ← livrable client mensuel
7. **Connecteurs** ← fondation de tout
8. **Profil business** ← contexte de tout

---

## Les 4 plans

| Plan | Prix | Clients | Connecteurs | Insights/mois | White-label | Rapports |
|------|------|---------|-------------|---|---|---|
| **Free** | 0€ | 1 | 1 | 3 | Non | Non |
| **Starter** | 99€ | 5 | 3 | 100 | Logo seul | Auto-send |
| **Pro** | 199€ | 20 | Tous P1 | 500 | Logo + couleurs | Auto-send |
| **Agency** | 399€ | Illimité | Tous | Illimité | Complet | Auto-send |

**Trial :** 14 jours gratuit, toutes les features, pas de CB requise.

**IA incluse dans tous les plans.** C'est le cœur du produit, pas une feature premium.

---

## Les 4 personas

### 📊 L'agence marketing (plan Pro — 199€)

**Profil :** 5-50 clients, gérant ou account manager.

**Douleur :** 4-8h par client par mois en reporting manuel.

**Gain :** Zéro temps passé, rapports plus complets qu'avant, valeur agence renforcée.

**Cas d'usage principal :** "Générer rapport client sans lever le doigt."

---

### 🎯 Le freelance (plan Starter — 99€)

**Profil :** 2-8 clients, consultant indépendant.

**Douleur :** Le rapport pro justifie son TJM mais prend du temps.

**Gain :** Aspect pro supérieur aux agences 10× plus grandes, facturation "suivi mensuel".

**Cas d'usage principal :** "Rapport aux clients plus professionnel, moins de temps."

---

### 🚀 La startup (plan Starter — 99€)

**Profil :** Fondateur qui prépare son investor update mensuellement.

**Douleur :** Données dispersées (Stripe, GA4, CRM). Synthèse manuelle = 3h/mois.

**Gain :** Investor update automatique, focus business pas reporting.

**Cas d'usage principal :** "Synthèse chiffres pour les investisseurs en 10 clics."

---

### 🏪 La TPE (plan Free ou Starter — 49€ ou 99€)

**Profil :** Gérant qui fait lui-même son marketing.

**Douleur :** Ne comprend pas ses données, budget pub potentiellement gaspillé.

**Gain :** Rapport en français simple, alertes si budget mal alloué.

**Cas d'usage principal :** "Suis-je sur le bon chemin ? Dois-je augmenter la pub ?"

---

## Flux onboarding idéal

```
Step 0: Landing → CTA "Démarrer gratuitement"
        ↓
Step 1: Sign up (email + password, no credit card)
        ↓
Step 2: Saisie URL site web
        ↓
Step 3: Scraping automatique (Playwright, 15s max)
        Fallback: Si échoue, form manuel (secteur, marché)
        ↓
Step 4: Affichage profil détecté
        "Nous avons détecté : E-commerce mode B2C · Shopify · Meta Pixel · GA4"
        ↓
Step 5: Confirmation ou correction par l'utilisateur
        ↓
Step 6: Connecteur recommandé (basé sur profil)
        "Nous recommandons de connecter d'abord GA4"
        ↓
Step 7: OAuth redirect (1 clic)
        ↓
Step 8: En parallèle : pull données 7 derniers jours
        ↓
Step 9: Génération premiers insights (Claude Haiku)
        ↓
Step 10: Dashboard avec 3 insights visibles
         + Chat conversationnel actif
         + Score santé calculé

TIMING BUDGET:
0:00 - Sign up
0:30 - URL entered, scraping starts
1:15 - Profile detected
2:00 - User confirms
2:30 - OAuth callback
3:00 - Data pull starts
3:45 - Data pull complète, insights generating
4:15 - First insights visible
4:30 - Dashboard live

RÈGLE CARDINALE: Premier insight IA visible < 3 minutes après signup.
```

---

## Règles produit non-négociables

1. **Chaque insight = 3 éléments :** Fait (chiffre précis) + Contexte (cause probable) + Recommandation (action + timing).
2. **Pas d'insight si données < 7 jours :** Message "pas encore assez de données, reviens demain".
3. **Rapport idempotent :** Un rapport déjà généré ce mois ne se regénère pas auto.
4. **Alerte si token expiré :** Rapport généré sans ce bloc + notification agence.
5. **Plan inactif = lecture seule :** Pas de suppression des données, accès 7 jours après expiration.
6. **White-label à partir de Starter :** Free = "Propulsé par SmartAnalyst" visible. Starter+ = customizable.
7. **Prévisualisation avant premier envoi :** Obligatoire pour chaque nouveau client.
8. **Canonical Metrics = source de vérité :** L'IA parle toujours au schéma universel, jamais aux sources brutes.
9. **Anomaly Detection baked-in :** Sessions dropped 80%+? Conversions à zéro ? L'IA le détecte comme du broken tracking, pas du vrai problème business.
10. **Cache invalidation explicite :** Quand un sync API finit, tous les caches dépendants sont Clear immédiatement (pas TTL).
11. **Graceful degradation :** Si API tierce plante, show stale data + badge transparent ("Meta données du 14 mai").
12. **Timezone au niveau workspace :** Chaque workspace a son fuseau (France, NY, Sydney). Tous les rapports dans le fuseau local.
13. **Rate limits transparents :** User voit "API usage: 42% of allowance" en settings.
14. **Feature flags from day 1 :** Toute feature nouvelle est derrière un flag (safe to deploy daily).
15. **Observability obligatoire :** Logs structurés JSON, metrics (latency, error rate), alertes ops (Slack).

---

## Metrics de succès

| Métrique | Target |
|---|---|
| **Activation J1** | Premier insight < 3 min après signup |
| **Rétention J7** | > 60% sans email de relance |
| **Conversion trial → payant** | > 35% |
| **Churn mensuel** | < 3% |
| **NRR (Net Revenue Retention)** | > 110% |
| **Connecteurs par compte actif** | > 2.5 |
| **Ouverture email hebdo** | > 45% |
| **Comptes avec auto-send activé** | > 80% |

---

## Coûts de base (burn mensuel)

| Item | Coût |
|---|---|
| VPS Hostinger (2vCPU, 4GB RAM) | 12€ |
| Supabase (100GB, RLS, Vault) | 25€ |
| Redis (BullMQ + cache) | 5€ |
| Resend (email transactionnel) | 20€ |
| Domaine (.io) | 10€ |
| Anthropic API (Haiku + Sonnet) | ~15€ (scalable) |
| Stripe (2.9% + 0.30€ par transaction) | Variable |
| **Total fixe** | **~87€** |

**Break-even :** 1 client Pro (199€) couvre 2.3× les frais fixes.

**Objectif J60 :** 1 000€ MRR (6 clients Pro ou 10 clients Starter).

---

## Avantages concurrentiels

| Concurrent | Leur approche | Notre avantage |
|---|---|---|
| **AgencyAnalytics** ($50M ARR) | Reporting statique, anglais | IA en français, proactive, recommandations |
| **DashThis** ($10M ARR) | Dashboards visuels, no IA | Analyse conversationnelle, insights actionnels |
| **Google Looker Studio** | Trop technique, no PDF auto | Simple, automatisé, pas de compétences data |
| **ChatGPT + exports manuels** | Travail manuel, pas connecté live | Connecté temps réel, automatique, récurrent |
| **Julius AI** | Chiffres + IA en anglais | Explication du "pourquoi" + contexte métier |

**Angle principal :** L'IA en français qui comprend ton contexte (secteur, marché) et te dit pas juste les chiffres, mais quoi faire.

---

## Prochaine étape

Lire **01_CONVENTIONS_GLOBALES.md** (conventions de code et data).

---

*Dernière mise à jour : Mai 2025*
*Validé par : Aurélien (Founder)*
