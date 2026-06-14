# SmartAnalyst V2 — État des features par rapport au brief

> Référence : `smartanalystfeaturesredesign.md` (brief de redesign V2).
> Ce document fait le pont entre le brief stratégique et l'état réel du code,
> pour que Claude Design sache ce qu'il peut consommer et que nous sachions
> ce qu'il reste à construire.

---

## Légende
- ✅ **Backend prêt** : API + DB existants, n'attendent que le visuel
- 🟡 **Partiel** : socle posé, manque l'expérience finale
- ❌ **Pas commencé** : à construire

---

## Feature × État

### 3.0 — Onboarding (activation, premier insight en < 10 min)
- ✅ Signup email/password + Google OAuth (`/login`, `/signup`)
- ✅ Scrape URL → profil business (`onboarding.service`, table `business_profiles`)
- ✅ Détection outils & secteur (`business-profile-detector.service`)
- 🟡 Checklist on-Home **3 étapes** (PR #81) — couvre le "guide", pas le wizard plein écran du brief
- ❌ Profil détecté affiché en step "magie" + correction inline
- ❌ Recommandation du 1er connecteur selon le profil
- ❌ Premier "wow" (3 insights + 1 graphique) en moins de 10 min

### 3.1 — Accueil / Dashboard ("coup d'œil 3s")
- ✅ Brief du jour = liste d'insights ouverts (`BriefDuJourBlock`)
- ✅ Santé du tracking (`TrackingHealthBlock`, endpoint `/smarttag/health`)
- ✅ Mini-graphes par insight (`InsightChart`, PR #80)
- ✅ Tiles KPI adaptatives par source connectée
- ❌ **Score de santé 0-100 global** + breakdown (paid/organic/conversion/revenus)
- ❌ Badges benchmark sur les KPI (« top 30% de ton secteur »)
- ❌ Section "Tâches du jour" sur la Home

### 3.2 — Chat — agent IA multimodal
- ✅ Chat texte (`/chat`) avec contexte canonical_metrics
- ✅ Citations sources cliquables (Perplexity-style)
- ✅ Suggestions adaptatives aux sources connectées
- ❌ **Pièces jointes** (image / PDF / CSV) — Gemini supporte, frontend pas câblé
- ❌ Référencement d'un fichier de la **librairie** dans une question
- ❌ Function-calling structuré (réponse = evidence + chart + action depuis le chat)
- ❌ Historique de conversation persistant
- ❌ Action "ajouter aux tâches" depuis une réponse

### 3.3 — Veille & insights proactifs
- ✅ Génération post-sync via Gemini Structured Output (#66)
- ✅ JSON Schema strict (preuves + limites + confiance + action)
- ✅ Dedup par `dedup_key`, statut `open/snoozed/resolved/dismissed`
- ✅ Niveaux `low/medium/high/critical`
- ❌ **Notifications in-app** (toaster + bell badge)
- ❌ **Notifications email** sur seuil critique
- ❌ **Résumé hebdomadaire** (lundi 8h) — service à créer
- ❌ Anti-doublon sémantique (au-delà du dedup_key)

### 3.4 — Tâches / "À faire" *(nouveau brief V2)*
**État actuel** : table `action_cards` existante, **adaptée** au cycle V2 dans cette PR :

- ✅ Cycle `proposed → todo → done | archived` (migration `023`)
- ✅ Insight engine pose les recommandations en **`proposed`** (curation par l'user)
- ✅ Buckets de lecture : `active` / `inbox` (proposed) / `today` (todo)
- ✅ **Envoi brief par email** (Resend) — `POST /insights/actions/:id/email-brief`
  - HTML/text composés avec priorité/impact/effort/confiance
  - Note perso optionnelle + signature
  - Audit log automatique
- ❌ Page dédiée `/tasks` (frontend)
- ❌ Ajout manuel d'une tâche depuis le chat
- ❌ Push vers outils externes (Asana, Trello, Slack, Notion, Zapier) — Phase ultérieure du brief

### 3.5 — Benchmark sectoriel
- ❌ Pas commencé. Le profil business contient le secteur — il faudra des données publiques (CRO industries IAB, ANA, etc.) ou un proxy.

### 3.6 — Rapports
- ✅ Tables `reports` + `report_data` (schéma)
- 🟡 Job cron mensuel (`reports.handler`) — actuellement un stub
- ❌ Génération PDF avec graphiques (Chart.js + Puppeteer)
- ❌ Prévisualisation
- ❌ Personnalisation visuelle (logo, couleurs)
- ❌ Commentaire exécutif IA adapté au destinataire

### 3.7 — Sources de données
**A. Connecteurs live**
- ✅ Catalogue dynamique (`integration_providers`)
- ✅ Stripe (apikey), GA4 (OAuth), Meta Ads (OAuth, code prêt), Shopify (code prêt)
- ✅ Auto-sync post-OAuth + bouton "Sync now" (#60)
- ✅ Refresh OAuth proactif (cron 4h)
- ✅ Logos officiels per-connecteur
- ❌ Google Ads, Search Console (P1 du brief)
- ❌ Page renommée "Sources de données"

**B. Librairie de fichiers** *(nouveau brief V2)*
- ❌ Pas commencé. À faire : table `files` + Supabase Storage bucket + endpoints upload/list/delete + référencement dans chat.

### 3.8 — Profil business
- ✅ Table `business_profiles` + détection à l'onboarding
- 🟡 Editable via API (UPDATE row) — pas d'UI dédiée

### 3.9 — Compte, plans, RGPD
- ✅ Settings : profil + langue + tracking + sécurité
- ✅ **Export RGPD** + **Suppression compte** (#74)
- ✅ Beta lockdown (whitelist email)
- ✅ Reset password (#72)
- ❌ Mode **multi-business / multi-marque** (optionnel)
- ❌ Plans + facturation Stripe (Lot 2 billing)
- ❌ Réglages notifications & seuils d'alerte

---

## Stack technique posée vs brief

| Brief V2 attend | On a |
|---|---|
| Chart.js (cohérence dashboard ↔ PDF) | SVG fait main (`InsightChart`). À remplacer par Chart.js quand le PDF arrive. |
| Multimodal Anthropic API | Gemini 2.5 Flash (multimodal natif aussi). Pas de migration nécessaire pour le V2 — on garde Gemini. |
| Email transactionnel | Resend ✅ |
| Storage fichiers | Supabase Storage (bucket à créer) |
| Notifications | Pas posé. À choisir : Resend (email), Web Push API (PWA), ou les deux. |
| PDF | Pas posé. Stack à choisir : Puppeteer + Chart.js. |

---

## Priorités d'attaque suggérées (en attendant le design)

1. **Score de santé 0-100** (Home §3.1) — calcul depuis canonical_metrics, table d'historique, endpoint. Plug visuel quand le design arrive.
2. **Librairie de fichiers** (Sources §3.7B) — table + Storage + endpoints. Chat multimodal viendra après.
3. **Résumé hebdomadaire email** (Veille §3.3) — réutilise insights engine + Resend, cron lundi 8h.
4. **Chat multimodal** (§3.2) — pièces jointes images/PDF côté backend (Gemini accepte déjà).
5. **Notifications email sur insight critique** (§3.3) — cron qui scanne les `severity:'critical'` nouveaux.

---

## Décisions structurelles assumées

- **`action_cards` reste le nom de table** (la migration changerait beaucoup de code pour zéro gain). En API et UX on parle de **"tâches"**.
- **Statut `dismissed` renommé `archived`** dans le brief V2 → fait dans migration `023`.
- **Pas de table `tasks`** séparée : `action_cards` couvre le cas. Si on autorise un jour "ajouter une tâche manuelle non liée à un insight", on relâchera la FK `insight_id` (déjà nullable).
- **`SmartTag` reste** (validé par toi) — son intégration UI est ouverte. Côté backend, il alimente `TrackingHealthBlock` + l'agrégateur d'insights.
