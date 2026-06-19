# SmartAnalyst — Cahier des charges (chantier d'optimisation)

> **Pour : Claude Code.** Objectif : faire passer la V1 de « fonctionnelle » à **crédible, pro et accro**.
> **Mode : Audit & Optimisation d'un existant** (on ne réécrit pas, on durcit et on complète lot par lot).
> **Périmètre :** l'application produit. Le site marketing (Astro) est traité séparément (skill `saas-site-spec`).

---

## 0. Comment lire ce document

### Légendes

**Statut composant / item :** `✅ en place` · `⚠️ partiel` · `❌ manquant` · `🔧 à retravailler (dette)`

**Priorité :** `🔴 P0 Critique` (sans ça, pas crédible/utilisable) · `🟠 P1 Important` (le « pro » + la monétisation) · `🟢 P2 Confort` (polish, power-user)

**Effort indicatif :** `S` (≤ 1 j) · `M` (2–4 j) · `L` (≥ 1 semaine)

### DoD universelle (s'applique à CHAQUE composant livré)

Aucun composant n'est « fini » s'il ne coche pas :

1. **Validation serveur systématique** (zéro confiance client).
2. **Tous les états UI présents** : `vide`, `chargement (skeleton)`, `erreur`, `succès`, `permission refusée`.
3. **Idempotence** sur toute écriture sensible (paiement, webhook, retry, génération de rapport).
4. **Tests** unitaires + intégration sur les parcours à risque (verts).
5. **A11y AA** : contraste, navigation clavier, focus, ARIA (obligation légale — EAA juin 2025 + RGAA).
6. **Event de tracking** posé selon le measurement plan (§7).
7. **Consentement respecté** (pas de tracking avant consentement ; Consent Mode v2).
8. **i18n-ready** (FR/EN, pas de texte en dur).

> Une feature sans état d'erreur, sans event de tracking ou sans test a11y **n'est pas finie**. C'est la règle qui sépare un SaaS amateur d'un leader.

### Disciplines transverses (jamais reportées)

Sécurité · A11y · Tracking & consentement · Observabilité · ADR · Performance. Elles se vérifient à chaque lot, pas en fin de chantier.

### Ce qui requiert TON environnement / une validation humaine (je le signale, je ne le présume pas)

- Tests d'isolation multitenant réels sur la base de prod.
- Configuration délivrabilité email (SPF/DKIM/DMARC) sur ton domaine.
- Passage Stripe en live + validation TVA/Stripe Tax.
- Validation juridique RGPD/AI Act.
- Pentest humain.

---

## 1. Décisions à trancher AVANT le build (verrous de cadrage)

Ces décisions conditionnent l'architecture. **Rien ne se construit proprement tant qu'elles ne sont pas posées.** Chacune = un ADR à écrire et figer.

| ADR | Décision | Recommandation | Impact si non tranché |
|---|---|---|---|
| **ADR-01** | Persona lead unique | **Annonceur final** (fondateur/PME mono-business). Marché plus large, douleur plus aiguë, pas de bataille frontale avec AgencyAnalytics. | Chaque écran = compromis tiède agence↔annonceur. Modèle data, pricing, copy, onboarding tirés dans deux directions. |
| **ADR-02** | Axe de pricing | Remplacer « nombre de clients » (vide de sens pour un mono-business) par **workspaces × features** (ou usage IA/connecteurs). | Le pricing ne mappe pas la persona ; les plans n'ont pas de sens. |
| **ADR-03** | Positionnement / moat | Le moat n'est **plus** « l'IA conversationnelle » (commodité en 2026 : AgencyAnalytics, Supermetrics, Dataslayer l'ont tous). Le moat = **IA incluse partout** (vs gatée chez les autres) **+ français/RGPD/EU + boucle vers l'action**. | Tu vends comme avantage ce que tout le monde a. Mort à la naissance. |
| **ADR-04** | Stack frontend & IA à confirmer | **Conflit dans les specs** : front *vanilla HTML/JS* (doc ReportFlow) vs *React 18 + Vite + Tailwind* (doc SmartAnalyst). IA : *Claude* (ReportFlow) vs *Gemini 2.5 Flash* (SmartAnalyst). → Trancher en ADR. *Reco : React pour une app à état riche (chat streaming, notifications, brief) ; IA hybride (Gemini Flash par défaut pour le coût, Claude pour l'analyse complexe) avec un provider abstrait.* | Claude Code ne peut pas livrer sans savoir le framework cible ni le provider IA. |
| **ADR-05** | Modèle de sources de données | **API/OAuth (ingestion principale) + tag first-party + bibliothèque de fichiers (contexte chat) ; MCP en *sortie* uniquement, post-beta.** Détail §2. | Risque de croire que « MCP » résout les connecteurs (faux), ou de polluer la couche canonique avec des fichiers. |
| **ADR-06** | Méthode PDF rapports | **Conflit** : *Puppeteer/Chromium server-side* (ReportFlow) vs *`window.print()` zéro-dépendance* (SmartAnalyst). *Reco : `window.print()` pour l'annonceur final (coût/maintenance), Puppeteer si white-label agence pixel-perfect redevient prioritaire.* | Choix structurant pour le service rapports. |

> **Action Claude Code :** ouvrir un dossier `docs/adr/` et créer un fichier par ADR ci-dessus. Ne pas commencer le Lot 1 tant qu'ADR-01 à 06 ne sont pas figés.

---

## 2. Sources de données — architecture (réponse à « API et/ou MCP ? »)

### Principe : séparer INGESTION et DISTRIBUTION

| | **Ingestion** (remplit `canonical_metrics`) | **Distribution** (accès à l'intelligence) |
|---|---|---|
| **But** | Donnée normalisée, historisée, stable qui nourrit brief, score, veille, rapports | Laisser l'utilisateur interroger SA donnée depuis ses outils |
| **Contrainte clé** | Précomputé & stable (PAS du live) | Live/à la demande, lecture seule |

### Mécanismes d'ingestion (par ordre de priorité)

| Mécanisme | Verdict | Pourquoi | Priorité |
|---|---|---|---|
| **API / OAuth** (`BaseConnector`) | ✅ **Principal** | Seul moyen d'avoir une donnée normalisée/historisée qu'on contrôle. Tes features sont précomputées. | 🔴 P0 (existe, à fiabiliser) |
| **Tag first-party** (`rf.js`) | ✅ **Complémentaire** | Donnée du site de l'utilisateur indisponible via API tierce. Différenciateur RGPD (first-party, EU). | 🟠 P1 |
| **Bibliothèque de fichiers** (CSV/PDF) | ✅ **Complémentaire, cadré** | Longue traîne sans connecteur. **Nourrit le contexte chat, ne remplit PAS les KPI structurés.** | 🟠 P1 |
| **MCP en entrée** (consommer Supermetrics MCP…) | ❌ **Non (pour l'instant)** | Donne du live non historisé, hors couche canonique, dépendance à un concurrent. | — |

### Distribution

| Mécanisme | Verdict | Pourquoi | Priorité |
|---|---|---|---|
| **Serveur MCP exposé** (au-dessus de `canonical_metrics`) | ✅ **Oui, post-beta** | Devient un standard (AgencyAnalytics/Supermetrics/Dataslayer le shippent). Colle à l'annonceur final qui vit dans Claude/ChatGPT. Canal d'accès en plus, **pas** un canal d'ingestion. | 🟢 P2 |

**À retenir :** tes connecteurs restent du **code API**. MCP en entrée ne sert pas ; MCP en sortie est un canal d'accès supplémentaire à séquencer plus tard. La page « Sources » doit donc gérer : connecteurs OAuth + santé/fraîcheur + bibliothèque de fichiers (+ réglage MCP-sortie en P2).

---

## 3. Le chantier priorisé — par lots

Ordre = dépendances d'abord. **Chaque lot passe la DoD universelle (§0) avant le suivant.**

### 🔴 Lot 0 — Fondations de confiance & de mesure (P0)

*Sans ça, le produit n'est ni crédible ni pilotable. À faire avant tout le reste.*

- [ ] **Instrumenter le funnel d'onboarding** (PostHog/équivalent) — events à chaque étape (§7). *Ironie à corriger : un produit d'analytics qui ne mesure pas son propre funnel.* (M)
- [ ] **Règle « jamais de chiffre nu suspect »** — l'IA n'affiche jamais un « 0 € » sec : soit elle explique la cause (source non connectée / pas de données / sync KO), soit elle se tait. (M)
- [ ] **Seuil de signifiance avant insight** — pas d'insight si volume/durée insuffisants (ex. < 7 j de données). Évite de crier au loup et de perdre toute autorité. (M)
- [ ] **Onboarding honnête** — supprimer le faux loading 15 s : progression réelle ou message honnête (« on importe tes 30 derniers jours, ~1 min »). (S)
- [ ] **Santé & fraîcheur des connecteurs** — détecter et signaler un connecteur qui échoue silencieusement (pré-requis du Lot 1 et de la page Sources). (M)
- [ ] **Gérer chaque chemin d'échec de l'activation** — compte vide, OAuth KO, scope insuffisant, < 7 j de données : un état dédié pour chacun (pas un happy-path optimiste). (M)

### 🔴 Lot 1 — La boucle « accro » (P0/P1)

*Un dashboard se consulte par devoir ; une boucle rend accro. Cible : Brief matin → alerte quand ça bouge → tâche proposée → je coche → score qui progresse → je reviens.*

- [ ] **Brief en home** (`BriefHome`) comme écran d'entrée, dashboard détaillé relégué en sous-écran. (M) — *l'instinct V2 est correct, l'assembler en boucle.*
- [ ] **Centre de notifications** (`NotificationCenter` : cloche + badge + toast + dropdown) — **seul vrai levier de retour** ; aujourd'hui l'alerte in-app « n'est qu'un insight créé ». 🔴 P0. (M)
- [ ] **Feature « À faire » finie** — le ferme-boucle et le différenciateur (personne ne le fait), aujourd'hui maillon faible. Inverser la priorité analyse↔tâches. (L)
- [ ] **Streaming du chat** — meilleur ratio effort/perception qui existe : transforme « lent/cheap » en « moderne ». 🟠 P1. (M)
- [ ] **Crochets d'action dans le chat** — créer une tâche / un rapport / une veille depuis une réponse. C'est ce qui rend ton assistant unique vs Claude (≠ chat générique). (M)

### 🟠 Lot 2 — Le « pro » (finition) (P1)

*80 % du delta indé→pro est ici.*

- [ ] **Design-system d'états uniformes** — composants uniques `EmptyState` / `LoadingSkeleton` / `ErrorState` / `PermissionDenied`, réutilisés partout. Aujourd'hui chaque page gère le vide/erreur à sa façon. (M)
- [ ] **Fraîcheur de données visible** sur l'app (« dernière sync il y a 2 h ») + bouton « re-sync ». (S)
- [ ] **Mobile responsive réellement testé** sur chaque écran (matrice device). (M)
- [ ] **Recherche globale** (conversations / insights / rapports). (M)
- [ ] **Affordances chat modernes** — copier/régénérer/éditer/stop, mode « Rapide/Approfondi », prompts suggérés, copier-en-image, feedback ↑/↓. Le niveau « vrai assistant ». (M)

### 🟠 Lot 3 — Monétisation & droits (P1)

*Nécessaire pour encaisser. Billing = P0 pour le revenu, P1 pour l'expérience.*

- [ ] **Axe de pricing** implémenté (ADR-02) + **gating par plan**. (M)
- [ ] **Billing UI** — Stripe Checkout + Customer Portal câblés (présents dans le stack, pas dans l'UI). (M)
- [ ] **Entitlements anti-drift** — l'accès reflète toujours le plan facturé ; webhooks Stripe **idempotents** ; **dunning** actif. (M)

### 🟢 Lot 4 — Confort & power-user (P2)

- [ ] **Cmd+K** (command palette). (M)
- [ ] **Édition de veille** + **snooze** + **historique des déclenchements** (aujourd'hui juste toggle/delete). (M)
- [ ] **Rapports** : scheduling récurrent custom + liste de destinataires + templates (Executive/Détail/Agency) + « Mot de l'analyste » généré par l'IA (aujourd'hui fallback). (L)
- [ ] **Team management** (invitations, rôles, retrait), **API keys**, **white-label par workspace**, **branding emails**. (L)
- [ ] **Serveur MCP exposé** (distribution, §2). (M)
- [ ] **Benchmark** — *délibérément déprioritisé* : MVP = données publiques googlables (pas un moat) ; propriétaire = œuf/poule (besoin d'échelle). Garder en vision, pas en argument de lancement. (L)

---

## 4. Spécification par feature / onglet (avec composants)

> Pour chaque onglet : objectif, **liste des composants** (avec statut & priorité), états requis, données/dépendances, events, et critères d'acceptation. Les composants `❌` sont à créer, `⚠️` à compléter, `🔧` à retravailler.
>
> **Principe de musculation :** chaque écran vise le niveau d'un produit grand public moderne (affordances, raccourcis, partage, voix). Mais la différenciation reste les **crochets d'action**, jamais la course aux features de chat générique — ce terrain est perdu (ADR-03). On muscle la forme partout ; on différencie par l'action.

---

### 4.1 — Onboarding (5 étapes)

**Objectif :** signup → vraie data visible en < 10 min (sinon churn). C'est l'activation, la métrique n°1.

**Composants :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `StepProgress` | Stepper 1→5 | ✅ | — |
| `UrlInputCard` | Saisie URL + bouton analyser + validation inline | ✅ | — |
| `DetectedProfileCard` | Secteur/marché/outils en chips + confirmer | ⚠️ honnêteté à revoir | 🔴 |
| `ProfileEditForm` | Correction du profil détecté | ✅ | — |
| `ConnectorRecommendationCard` | Source recommandée + bouton OAuth | ✅ | — |
| `OAuthCallbackHandler` | Reprise après redirect OAuth (persistance sessionStorage) | ✅ | — |
| `OnboardingProgress` | Barre + 4 paliers — **version honnête (progression réelle)** | 🔧 (faux loading) | 🔴 |
| `FirstWowPanel` | `ScoreRing` + 3 `InsightCard` sur vraie data | ✅ | — |
| `WorkspaceNotReadyState` | Étape 5 si workspace pas prêt | ⚠️ (bannière) | 🔴 |
| `UrlAnalyzerFallback` | Mode dégradé si analyzer échoue | ✅ | — |
| `EmptyDataState` (onboarding) | Compte connecté mais < 7 j de données → message clair, pas « 0 € » | ❌ | 🔴 |
| `OAuthErrorState` | OAuth KO / scope insuffisant | ❌ | 🔴 |

**États requis :** chargement (réel), succès (wow), **chaque mode d'échec** (URL KO, OAuth KO, scope insuffisant, data insuffisante, workspace pas prêt).
**Données :** `business_profiles`, premier connecteur, premiers `insights`.
**Events :** `onboarding_step_viewed` (step), `url_submitted`, `profile_confirmed/corrected`, `connector_connect_started/succeeded/failed`, `first_insight_shown`, `onboarding_completed`, `onboarding_dropped` (step).
**Acceptation :** time-to-first-insight mesuré ; aucun écran ne montre un chiffre nu suspect ; chaque échec a son état.

---

### 4.2 — BriefHome (« Mon point du jour »)

**Objectif :** la home. En 30 s : ce qui s'est passé hier + quoi faire aujourd'hui. Remplace le dashboard.

**Composants :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `Greeting` | « Salut {prénom} » + date | ✅ | — |
| `ScoreRing` (128px) | Santé 0–100 + delta vs hier, gradient | ✅ | — |
| `NarrativeParagraph` | Résumé du jour généré par l'IA | ✅ | — |
| `InsightCard` ×3 | Sévérité + titre + cause + reco | ✅ | — |
| `ActionCard` ×2–3 | Tâches proposées (→ feature À faire) | ✅ | — |
| `KpiCard` ×3 | Label + valeur + delta + sparkline | ✅ | — |
| `KpiPicker` | Choisir/ordonner ses 3 KPI | ❌ (pas customizable) | 🟢 |
| `AskBar` | Bandeau dégradé → ouvre le chat | ✅ | — |
| `FirstRunState` | Workspace vide (pas de skeleton fade) | ✅ | — |
| `NotificationBell` | Cloche + badge (cross-cutting, §4.9) | ❌ | 🔴 |
| `DataFreshnessChip` | « Dernière sync il y a 2 h » | ❌ | 🟠 |
| `InsightCardActions` | Sur chaque carte : « Transformer en tâche », « Snooze », « Demander des détails » (ouvre le chat pré-rempli avec le contexte) | ❌ | 🟠 |
| `CopyKpiAsImage` | Copier un KPI/sparkline en image (Slack, slides) | ❌ | 🟢 |

**États requis :** chargement, first-run (vide), erreur (score/data indisponible).
**Données :** `canonical_metrics` (score, 3 KPI), `insights` (top 3), `action_cards` (top 2–3).
**Events :** `brief_viewed`, `brief_insight_clicked`, `brief_action_clicked`, `brief_card_action_used` (task/snooze/ask), `ask_bar_clicked`.
**Acceptation :** est l'écran d'entrée par défaut ; score + narratif cohérents avec la data ; ouvre le chat en 1 clic.

---

### 4.3 — Assistant / Chat IA

**Objectif :** l'analyste conversationnel. Le chat générique est une commodité — donc deux exigences distinctes : (1) les **affordances modernes** attendues d'un vrai assistant (sinon ça fait « cheap ») ; (2) les **crochets d'action** que Claude/ChatGPT n'ont pas, qui sont TA différenciation : agir depuis la conversation.

> **Garde-fou produit :** ne pas chercher à battre Claude sur le chat générique (terrain perdu, ADR-03). La valeur unique de ton chat = **créer une tâche, générer un rapport, poser une veille** sans quitter la conversation.

**Composants :**

| Zone | Composant | Rôle | Statut | Prio |
|---|---|---|---|---|
| Composer | `ChatComposer` | Textarea auto-grow + envoi + `Cmd/Ctrl+Enter` | ✅ | — |
| Composer | `AttachmentDropzone` | Glisser-déposer + **coller** (presse-papier, images incluses) + multi-formats (image/PDF/CSV) + barre de progression | ⚠️ (attach simple) | 🟠 |
| Composer | `FileAttachmentChip` | Fichier joint (4 max) avec aperçu | ✅ | — |
| Composer | `ResponseModeToggle` | **« Rapide / Approfondi »** (route Gemini Flash ↔ Claude sous le capot) — PAS un sélecteur de modèle brut | ❌ | 🟠 |
| Composer | `SlashCommandMenu` | `/` → actions rapides : créer une tâche, générer un rapport, poser une veille, comparer une période — **crochet d'action** | ❌ | 🟠 |
| Composer | `SuggestedPrompts` | Prompts de démarrage contextualisés (empty state + nouvelle conv) — aide l'annonceur non-expert à savoir quoi demander (lié activation) | ❌ | 🟠 |
| Composer | `StopGenerationButton` | Interrompre le streaming en cours | ❌ | 🟠 |
| Message | `StreamingText` | Affichage token-par-token | ❌ | 🟠 |
| Message | `MessageBubble` | Renderer markdown (gras/listes/**tableaux**/code) + citations | ✅ | — |
| Message | `MessageActions` | Au survol : **copier**, **régénérer**, **éditer & renvoyer**, lire à voix haute (TTS, opt.) | ❌ | 🟠 |
| Message | `MessageActionHooks` | Sur une réponse : « Transformer en tâche / Générer un rapport / Créer une veille » — **le différenciateur vs Claude** | ❌ | 🟠 |
| Message | `MessageFeedback` | Pouce ↑/↓ → alimente l'eval IA + signal d'hallucination | ❌ | 🟠 |
| Message | `CitationPill` `[N]` | Lien chiffre → source (scroll vers la pilule) | ✅ | — |
| Message | `HighlightCards` | 0–3 KPI cards/callouts après la prose (2ᵉ passe) | ✅ | — |
| Message | `CopyAsImage` | Copier une highlight card / un graphe en image (Slack, slides) | ❌ | 🟠 |
| Message | `ScrollToBottomButton` | Revenir en bas pendant le streaming | ❌ | 🟢 |
| Conversation | `ConversationSidebar` | Liste 50 convs, active highlight, « + Nouvelle », drawer mobile | ✅ | — |
| Conversation | `ConversationListItem` | + **renommer / supprimer / épingler** | ⚠️ (ni rename ni delete) | 🟠 |
| Conversation | `ConversationSearch` | Recherche dans les conversations | ❌ | 🟢 |
| Conversation | `ShareConversation` | Export / lien partageable | ❌ | 🟢 |
| Garde-fous | `EmptyWorkspaceShortCircuit` | Pas d'appel LLM si workspace vide → « branche une source » | ✅ | — |
| Garde-fous | `NoNakedNumberGuard` | Empêche « 0 € » sec sans explication (Lot 0) | ❌ | 🔴 |
| Garde-fous | `ChatErrorState` | Classification erreurs LLM (429/504/503) + retry | ✅ | — |
| Garde-fous | `TokenBudgetGuard` | Hard-stop budget mensuel/workspace | ✅ | — |

> **Décision à acter — « sélection de modèle » :** pour l'annonceur final (Camille, pas un data analyst), exposer « Gemini vs Claude » = charge cognitive + fuite d'implémentation. Reco : un toggle **bénéfice** « Rapide / Approfondi » (qui route le bon modèle dessous) ; le nom brut des modèles seulement en réglages avancés/power-user si vraiment nécessaire. À intégrer dans l'ADR-04.

**États requis :** vide (workspace), chargement/streaming, génération interrompue, erreur (classifiée), budget dépassé.
**Données :** `chat_conversations`, `chat_messages` (cap 20 msg/LLM), function calling sur `canonical_metrics`/insights/score ; provider abstrait (Gemini par défaut, Claude pour « Approfondi »).
**Events :** `chat_message_sent` · `chat_response_streamed` · `chat_generation_stopped` · `chat_mode_selected` (rapide/approfondi) · `chat_slash_command_used` (command) · `chat_message_copied` · `chat_response_regenerated` · `chat_message_feedback` (up/down) · `chat_action_hook_used` (task/report/watch) · `chat_citation_clicked` · `chat_file_attached` · `chat_error_shown` (type) · `chat_budget_blocked`.
**Acceptation :** réponse streamée + interruptible ; au moins un crochet d'action utilisable depuis une réponse ; chaque chiffre cité a une source ; jamais de chiffre nu suspect ; erreurs lisibles en FR/EN.

---

### 4.4 — Veille (Insights + Mes veilles)

**Objectif :** « préviens-moi avant que ça fasse mal ». L'utilisateur n'a pas à regarder le dashboard chaque jour.

**Composants (onglet Insights) :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `TabSwitcher` | Insights ↔ Mes veilles | ✅ | — |
| `InsightFilterChips` | Tous / Critiques / À surveiller / Opportunités / Traités | ✅ | — |
| `InsightCard` | Titre + sévérité + cause + reco + « résoudre » | ✅ | — |
| `InsightEmptyState` | Aucun insight | ⚠️ | 🟠 |
| `InsightToTaskButton` | « Transformer en tâche » depuis un insight — crochet vers la boucle | ❌ | 🟠 |
| `BulkInsightActions` | Sélection multiple : résoudre / snooze en lot | ❌ | 🟢 |
| `ShareInsight` | Partager un insight (lien / export) | ❌ | 🟢 |

**Composants (onglet Mes veilles) :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `WatchCreatorNL` | Création en langage naturel → validator Gemini → `{metric_key, operator, threshold}` (whitelist 14 métriques) | ✅ | — |
| `WatchList` | Liste des veilles | ✅ | — |
| `WatchListItem` | Toggle on/off + suppression (confirm) + compteur déclenchements | ✅ | — |
| `WatchEditModal` | **Éditer** une veille existante | ❌ | 🟠 |
| `SnoozeControl` | Mute 24 h / 7 j | ❌ | 🟢 |
| `WatchTriggerHistory` | Historique des déclenchements par veille | ❌ | 🟢 |

**États requis :** vide, chargement, erreur (validator NL échoue → message + reformulation).
**Données :** `insights`, `watches` ; évaluateur cron horaire (jitter 0–5 min, debounce 24 h).
**Events :** `insight_resolved`, `insight_filter_changed`, `insight_converted_to_task`, `insight_shared`, `watch_created` (via NL), `watch_toggled`, `watch_triggered`, `watch_edited`.
**Acceptation :** un déclenchement crée une **vraie notification** (toast/badge via §4.9), pas seulement un insight ; une veille est éditable.

---

### 4.5 — À faire (Tasks) ⭐ priorité stratégique

**Objectif :** transformer un insight en action accomplie. **Le ferme-boucle** (personne ne le fait) **et** le moteur d'accoutumance (le plaisir de cocher). Aujourd'hui le maillon faible — c'est ici qu'il faut investir.

**Composants :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `TaskList` | Vue des `action_cards` proposées | ⚠️ minimal | 🟠 |
| `TaskCard` | Carte tâche + transitions de statut | ⚠️ | 🟠 |
| `TaskStatusBadge` | `proposed → to_do → done → archived` | ⚠️ | 🟠 |
| `TaskActions` | Valider / refuser / archiver | ❌ | 🟠 |
| `TaskDetailDrawer` | Insight source + action recommandée + timing | ❌ | 🟠 |
| `ProposedByAIBadge` | Lien retour vers l'insight d'origine | ❌ | 🟠 |
| `PriorityFilter` | Tri impact × effort | ✅ | — |
| `CompletionFeedback` | **Le dopamine** : animation de complétion + impact sur le score | ❌ | 🟠 |
| `TasksEmptyState` | First-run | ❌ | 🟠 |
| `EmailBriefSender` | Phase 1 : brief des tâches via Resend | ⚠️ | 🟠 |
| `ExternalPushStub` | Phase 2 : Asana/Trello/Monday/Slack/Notion via Zapier/webhook (flag « bientôt ») | ❌ | 🟢 |
| `QuickAddTask` | Ajouter une tâche manuelle (pas seulement les proposées par l'IA) | ❌ | 🟠 |
| `TaskReorder` | Glisser pour réordonner / re-prioriser | ❌ | 🟢 |
| `TaskKeyboardShortcuts` | Cocher / archiver au clavier | ❌ | 🟢 |

**États requis :** vide (first-run), chargement, erreur, succès (tâche cochée + feedback).
**Données :** `action_cards` (lien `insight_id`), statut, priorité (impact×effort).
**Events :** `task_proposed_viewed`, `task_accepted`, `task_dismissed`, `task_completed`, `task_manually_added`, `task_reordered`, `task_brief_emailed`.
**Acceptation :** chaque tâche remonte à son insight ; cocher déclenche un feedback visible et un effet sur le score ; brief email fonctionnel.

---

### 4.6 — Rapports

**Objectif :** livrable de synthèse (pour soi / board / client). « Le PDF du mois, en mieux. »

**Composants :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `ReportListEmptyState` | First-run : « Génère ton premier rapport » | ✅ | — |
| `ReportCard` | Période + statut + actions | ✅ | — |
| `CreateReportModal` | Période + type (mensuel/trim./custom) + white-label + chips multi-sources + comparaison période | ✅ | — |
| `ReportPreviewIframe` | Rendu HTML en `<iframe srcdoc>` | ✅ | — |
| `ReportCover` | Cover gradient brand + période | ✅ | — |
| `ReportAnalystWord` | « Mot de l'analyste » — **généré par l'IA** | 🔧 (fallback textuel) | 🟢 |
| `ReportKpiGrid` | 6 KPI + sparkline revenue + breakdown par source | ✅ | — |
| `ReportTopInsights` | « Ce qui a compté » = top 5 insights | ✅ | — |
| `PrintToPdfButton` | `window.print()` (ADR-06) | ✅ | — |
| `AutoSendConfig` | `report_day` + destinataire (timezone-aware) | ⚠️ (1 destinataire) | 🟢 |
| `RecipientListManager` | Plusieurs destinataires | ❌ | 🟢 |
| `RecurringScheduleConfig` | Récurrence custom (pas que le 1er du mois) | ❌ | 🟢 |
| `ReportTemplatePicker` | Executive / Détail / Agency | ❌ | 🟢 |
| `ShareReport` | Lien partageable + export (PDF/PNG) en plus de l'impression | ❌ | 🟢 |
| `ReportAnnotations` | Commentaires / annotations sur le rapport | ❌ | 🟢 |

**États requis :** vide (first-run), génération en cours, erreur (génération/sync), prêt, envoyé.
**Données :** `reports` (schéma à jour), snapshot data, top insights de la période. **Génération idempotente** (un rapport déjà produit ce mois ne se regénère pas).
**Events :** `report_create_opened`, `report_generated`, `report_downloaded`, `report_auto_sent`.
**Acceptation :** génération idempotente ; comparaison période correcte (heuristique lower-is-better pour churn/bounce) ; « Mot de l'analyste » IA (P2) cohérent avec la data.

---

### 4.7 — Sources (Connecteurs)

**Objectif :** la porte d'entrée des données. Voir §2 pour l'architecture.

**Composants :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `SourcesList` | Liste des sources connectées | ✅ | — |
| `SourceCard` | Provider + statut (active/expired/error/disconnected) | ✅ | — |
| `AddSourceButton` + `SourcePicker` | Ajouter une source (providers OAuth) | ✅ | — |
| `OAuthConnectFlow` | Connexion OAuth générique (table `integration_providers`) | ✅ | — |
| `ScopeMismatchWarning` | Avertir si le provider accorde moins que demandé | ✅ | — |
| `DataFreshnessIndicator` | « Dernière sync il y a 2 h » | ❌ | 🟠 |
| `ResyncButton` | « Re-sync maintenant » | ❌ | 🟠 |
| `SourceHealthBadge` | Signaler un connecteur qui foire silencieusement | ❌ | 🔴 |
| `FileLibrary` | Bibliothèque de fichiers (CSV/PDF) — **nourrit le chat, pas les KPI** | ❌ | 🟠 |
| `FileLibraryItem` | Fichier uploadé + statut d'indexation | ❌ | 🟠 |
| `ComingSoonConnectorRow` | Roadmap visible (Shopify, HubSpot, Klaviyo…) | ❌ | 🟢 |
| `McpServerSettings` | Exposer la donnée à Claude/ChatGPT (distribution, §2) | ❌ | 🟢 |

**Réalité à corriger :** seul **GA4** est probablement validé end-to-end. Les 4 autres (Meta, Google Ads, Stripe, Search Console) sont **à confirmer source par source** — sans ça, le « wow » d'activation est aléatoire selon la source connectée.
**États requis :** vide (aucune source), connexion en cours, erreur (OAuth/scope/sync), expiré (refresh).
**Données :** `connectors` (tokens chiffrés Vault), `integration_providers`, refresh cron 4 h, sync quotidien 3 h UTC.
**Events :** `source_connect_started/succeeded/failed`, `source_resynced`, `file_uploaded`, `source_health_alert`.
**Acceptation :** chaque connecteur P1 validé end-to-end ; fraîcheur visible ; échec jamais silencieux (remonte en home via §4.9).

---

### 4.8 — Settings

**Objectif :** couvrir les bases + débloquer la monétisation et la collaboration.

**Composants :**

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `ProfileSettings` | Nom, email, ID workspace | ✅ | — |
| `WorkspaceSettings` | Nom, ID, rôle | ✅ | — |
| `TrackingSettings` | Write key + snippet SmartTag | ✅ | — |
| `LanguageToggle` | FR / EN | ✅ | — |
| `PrivacyPreferences` | Préférences consentement | ✅ | — |
| `AiUsageMeter` | Compteur tokens + budget (bloque le chat si dépassé) | ✅ | — |
| `NotificationPreferences` | Digest + alertes critiques | ✅ | — |
| `PasswordSettings` | Changement de mot de passe | 🔧 (disabled « bientôt ») | 🟠 |
| `SessionLogout` | Déconnexion | ✅ | — |
| `GdprExport` + `DeleteAccountFlow` | Export JSON + suppression (purge + invalidation token) | ✅ | — |
| `BillingSettings` | Stripe Checkout + Customer Portal | ❌ (stack présent, UI absente) | 🟠 |
| `TeamMembers` | Invitations, rôles, retrait | ❌ | 🟢 |
| `ApiKeysSettings` | Clés d'API (scopes, rotation, révocation) | ❌ | 🟢 |
| `WhiteLabelSettings` | Logo + couleurs par workspace | ❌ | 🟢 |
| `EmailBrandingSettings` | Branding des emails | ❌ | 🟢 |

**États requis :** chargement, succès (save), erreur (save/billing), permission refusée (selon rôle).
**Données :** `agencies`/workspace, `subscriptions`, entitlements.
**Events :** `settings_saved` (section), `billing_portal_opened`, `team_member_invited`, `gdpr_export_requested`, `account_deleted`.
**Acceptation :** changement de mot de passe actif ; export RGPD réel (procédure technique, pas que promise) ; billing câblé (P1).

---

### 4.9 — Composants transverses (à construire une fois, réutiliser partout)

Ce ne sont pas des onglets, mais des briques qui conditionnent « pro » et « accro ».

| Composant | Rôle | Statut | Prio |
|---|---|---|---|
| `NotificationCenter` | Cloche + badge + dropdown + **toasts** — le moteur de retour | ❌ | 🔴 |
| `ToastSystem` | Feedback transitoire global | ❌ | 🔴 |
| `EmptyState` (générique) | État vide uniforme | ❌ | 🟠 |
| `LoadingSkeleton` (générique) | Chargement uniforme | ❌ | 🟠 |
| `ErrorState` (générique) | Erreur uniforme + retry | ❌ | 🟠 |
| `PermissionDeniedState` | Accès refusé uniforme (selon rôle/plan) | ❌ | 🟠 |
| `CommandPalette` | Cmd+K | ❌ | 🟢 |
| `GlobalSearch` | Conversations / insights / rapports | ❌ | 🟢 |
| `StreamingText` | Renderer token-par-token (partagé chat) | ❌ | 🟠 |
| `UpgradePrompt` | Gating : inciter à l'upgrade quand une limite est atteinte | ❌ | 🟠 |
| `CopyAsImage` (utilitaire) | Exporter n'importe quelle carte/graphe en image (partage Slack/slides) | ❌ | 🟠 |
| `SuggestedPromptsProvider` | Banque de prompts contextualisés réutilisable (chat, brief) | ❌ | 🟠 |
| `KeyboardShortcutsLayer` | Raccourcis globaux + cheatsheet (`?`) | ❌ | 🟢 |

> **Remarque architecture frontend :** ces composants d'état uniformes sont *le* levier « pro ». Les implémenter d'abord (Lot 2), puis migrer chaque écran dessus, élimine d'un coup l'effet bricolage. L'implémentation visuelle réelle devra suivre le skill `frontend-design` (design tokens, typographie, états).

---

### 4.10 — Site marketing (Astro) — hors périmètre principal

Traité par le skill `saas-site-spec`. Point d'attention unique ici : il doit **refléter la V2** (direction « Brief », annonceur final) et le moat reformulé (ADR-03), pas l'ancien pitch agence/« on a l'IF, eux non ». À aligner après ADR-01/03.

---

## 5. Mapping diagnostic ↔ arbre de compétences (angles morts à durcir)

Points de l'arbre `saas-creator-os` qui touchent directement ce produit et qui sont à vérifier au durcissement :

- **Isolation multitenant *testée*** (pas seulement la RLS) — test automatisé prouvant qu'un workspace ne voit jamais la donnée d'un autre. Cauchemar n°1.
- **Idempotence** partout où il y a de l'argent ou un retry — webhooks Stripe + génération de rapports.
- **Replay & ordering des webhooks** Stripe — supposer désordre/duplication/retard.
- **Anti-explosion des coûts IA** — rate limiting + quotas sur les endpoints LLM (déjà : hard-stop budget ; à compléter par du rate limiting).
- **Effacement RGPD implémenté** (procédure technique réelle) — pas seulement l'export.
- **Délivrabilité email** (SPF/DKIM/DMARC) — des transactionnels en spam tuent l'activation silencieusement.
- **Eval des features IA** — mesurer la qualité des insights/chat, pas se fier à l'impression.
- **Observabilité instrumentée AVANT** d'aller plus loin — Sentry + request-id existent ; étendre aux events produit.
- **Feature flags / kill switch** — couper une feature défaillante (ex. streaming) sans redéployer.

---

## 6. Measurement plan — events clés (Lot 0, P0)

*Un produit data qui ne se mesure pas n'améliore pas son activation. Priorité absolue.*

| Domaine | Events (nom · propriétés) |
|---|---|
| **Activation (funnel)** | `onboarding_step_viewed` (step) · `url_submitted` · `profile_confirmed`/`profile_corrected` · `connector_connect_started`/`_succeeded`/`_failed` (source) · `first_insight_shown` (latency_ms) · `onboarding_completed` · `onboarding_dropped` (step) |
| **Engagement (boucle)** | `brief_viewed` · `chat_message_sent` · `insight_resolved` · `watch_created` · `watch_triggered` · `task_accepted` · `task_completed` · `notification_clicked` |
| **Rétention** | `dau`/`wau` dérivés · `connectors_per_workspace` · `return_after_alert` (proxy de la boucle) |
| **Monétisation** | `upgrade_prompt_shown` (limit) · `billing_portal_opened` · `plan_changed` · `payment_failed` · `dunning_recovered` |
| **Qualité IA** | `chat_error_shown` (type) · `chat_budget_blocked` · `insight_dismissed_as_wrong` (signal d'hallucination) |

Nommage : `snake_case`, verbe au passé, propriété `workspace_id` systématique. Pas d'event avant consentement (Consent Mode v2).

---

## 7. Ordre d'exécution recommandé pour Claude Code

1. **Figer ADR-01 → 06** (`docs/adr/`). Surtout : persona, axe de pricing, stack front/IA, modèle de sources. *Bloquant.*
2. **Lot 0** (confiance & mesure) — instrumentation funnel + règles de confiance + santé connecteurs + états d'échec d'activation.
3. **Lot 1** (boucle accro) — Brief-home + NotificationCenter + Tasks finie + streaming chat.
4. **Lot 2** (pro) — design-system d'états + fraîcheur + mobile + recherche.
5. **Lot 3** (monétisation) — pricing/gating + billing UI + entitlements.
6. **Lot 4** (confort) — Cmd+K, édition veille, templates rapports, team/API keys/white-label, MCP-sortie, benchmark.

**Verrou avant chaque lot :** auto-audit explicite (✅/⚠️/❌) ; un lot n'est `VERT` que sans `❌` critique. Re-diagnostiquer en fin de chantier pour montrer ce qui est passé de ❌/🔧 à ✅.

---

*Fil rouge : la V1 a sur-investi le terrain devenu commodité (le chat IA) et sous-investi ses vrais différenciateurs (localisation/inclusion + boucle vers l'action + confiance). Corriger cette allocation rend le produit crédible, pro et accro — par cohérence, pas par magie.*
