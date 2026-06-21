# 22b — Chat Copilote IA · Vision V2 (niveau Julius.ai)

> **Status :** Cahier des charges fonctionnel + UI/UX. Pas encore implémenté.
> **À lire avant :** `00_BRIEF_EXECUTIF.md` (vision produit), `17_SERVICE_IA_CHAT.md` (backend actuel), `22_FEATURE_ANALYSE_CONVERSATIONNELLE.md` (feature actuelle).
> **Persona cible :** annonceur final (mono-business, freelance/PME) — pas agence.

---

## 1. Vision en une phrase

> **Le chat de SmartAnalyst n'est pas un chatbot, c'est un copilote génératif :
> chaque réponse produit un artefact réutilisable (chart, table, dashboard, slide, export), pas juste du texte.**

Julius.ai a posé le standard : un input invitant, des quick-actions visibles, et des outputs riches (Image, Stock Analysis, Excel, Slides, Dashboard, Tracker, Report). On vise le même niveau d'exigence — adapté au persona marketing.

### Les 3 piliers

| Pilier                | Avant (V1)                                    | Après (V2)                                                                         |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Génératif**         | Texte + 3 highlights (KPI/callout/chart)      | Canvas multi-blocs : texte + N charts + tables + actions, chaque bloc exportable.  |
| **Affordance pro**    | Input vide + "?" — l'user doit deviner        | Empty state riche : cartes quick-start, placeholder rotatif, toolbar pro.          |
| **Chaque output agit** | Réponse statique, l'user copie-colle ailleurs | Action shelf sur chaque réponse : Exporter Excel · Épingler dashboard · → Rapport. |

---

## 2. Avant / Après en une image mentale

**V1 actuel** (ce qu'on a) :

```
┌─────────────────────────────────────────┐
│ Quelle est mon meilleur canal ?         │ ← input vide
└─────────────────────────────────────────┘

[réponse texte de 4 lignes]
[KPI card · 1×]
[callout · 1×]
```

**V2 cible** (Julius-level) :

```
┌─────────────────────────────────────────┐
│ Comment puis-je t'aider aujourd'hui ?   │ ← placeholder rotatif
│                                         │
│ "Compare GA4 et Meta sur 30 jours…"    │
│                                         │
│ ┌──┐ ┌─────────┐ ┌──────────┐ Approfondi│
│ │📎│ │🎯 GA4+1│ │⚡ Rapide │ ↑ Envoi  │
│ └──┘ └─────────┘ └──────────┘            │
└─────────────────────────────────────────┘

┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│📊 Compa-│ │📈 Évolu-│ │📑 Rap-  │ │📋 Cohort│
│rer cana-│ │tion CA  │ │port mois│ │e-comm   │
│ux       │ │30j      │ │         │ │         │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
┌─────────┐ ┌─────────┐ ┌─────────┐
│⚠ Aler-  │ │📊 Funnel│ │🎯 Pareto│
│tes auto │ │conversion│ │budget   │
└─────────┘ └─────────┘ └─────────┘

[Réponse — Canvas]
┌─────────────────────────────────────────┐
│ Voici la comparaison sur 30j.          │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ [Chart pleine largeur : GA4 vs Meta]│ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ [Table compacte : 5 lignes top]     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ • Meta domine sur conv. (+23%)         │
│ • GA4 reste meilleur sur ROAS          │
│                                         │
│ ┌──────────────────────────────────┐    │
│ │ 📥 Excel  📌 Épingler  📑 Rapport │ ← action shelf
│ └──────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## 3. UI / UX — composants à livrer

### 3.1 Empty state (état neuf, conversation vide)

**Anatomie :**

- **Titre chaleureux** centré, gros : « Comment puis-je t'aider aujourd'hui ? » (rotation : « Que veux-tu analyser ? » / « Une question sur tes campagnes ? »).
- **Input principal** carte centrée, max 720 px, ombre douce, placeholder qui cycle toutes les 4 s sur 5-6 exemples (« Compare mes campagnes Meta et Google sur 30 jours » → « Pourquoi mon ROAS baisse cette semaine ? » → « Génère mon rapport mensuel »…).
- **Toolbar de l'input** (rangée sous le textarea) :
  - `📎` Attacher fichier (déjà branché — multimodal Gemini).
  - `🎯` Filtre sources actives : chip qui ouvre un picker (« GA4 · Meta · Stripe » → l'user coche).
  - `⚡ Rapide` / `🧠 Approfondi` toggle (NE PAS exposer "Gemini" / "Claude" cf. CLAUDE.md).
  - `↑` Bouton envoi rond, désactivé tant que vide.
- **Grille de 6-8 quick-cards** sous l'input (3 colonnes desktop, 2 mobile) :
  - Chaque carte = `{ icon, titre court (3-4 mots), description sous-titre (1 ligne), prompt pré-rempli au clic }`.
  - Hover : élévation légère + bord brand-cyan.
  - Cartes par défaut **dynamiques** selon connecteurs actifs : si pas de Meta, on cache « Comparer Meta×Google ».

**Catalogue initial des quick-cards (8 max) :**

| Icône | Titre               | Prompt injecté                                                          |
| ----- | ------------------- | ----------------------------------------------------------------------- |
| 📊    | Comparer canaux     | « Compare mes canaux d'acquisition sur les 30 derniers jours. »         |
| 📈    | Évolution du CA     | « Trace l'évolution de mon chiffre d'affaires par jour cette semaine. » |
| 📑    | Rapport mensuel     | « Génère mon rapport du mois en cours, template exécutif. »             |
| 📋    | Funnel e-commerce   | « Affiche le funnel conversion : sessions → ajout panier → commande. »  |
| 🎯    | Pareto budget       | « Quelles 20% de mes campagnes font 80% du ROAS ? »                     |
| ⚠     | Alertes auto        | « Quelles métriques chutent anormalement cette semaine ? »              |
| 🆚    | Vs. période N-1     | « Compare ce mois au précédent — KPIs principaux, deltas. »             |
| 💡    | Que faire cette sem | « Donne-moi 3 actions concrètes prioritaires basées sur mes données. »  |

### 3.2 Toolbar input — version "active conversation"

Quand une conversation est ouverte, l'input passe en bas de la zone scroll (sticky) :

- Hauteur compacte (60 px), borders subtils.
- Conserve les 4 boutons toolbar (`📎`, `🎯`, mode toggle, `↑`).
- Badge model discret à droite de l'envoi : « Approfondi · 2.5K tokens » (rappelle que le mode chargé peut être long).
- Si l'user a sélectionné un filtre sources, **chip persistante** au-dessus de l'input : `GA4 ✕`, `Meta ✕`. L'API reçoit `sources=[ga4,meta_ads]` et filtre `canonical_metrics`.

### 3.3 Réponse = canvas multi-blocs

Une réponse assistant n'est plus une chaîne de prose : c'est un **canvas** composé de blocs typés.

**Types de blocs** (ordre libre, le LLM décide via tool calls) :

| Type        | Rendu                                                                                   | Quand                                                             |
| ----------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `text`      | Markdown (déjà existant).                                                               | Toujours présent.                                                 |
| `kpi`       | Carte chiffre + delta + sparkline (existant).                                           | Question portant sur une métrique unique.                         |
| `chart`     | Histogramme/courbe pleine largeur (existant).                                           | Série temporelle.                                                 |
| `table`     | **Nouveau** — table compacte triée, max 10 lignes, header sticky.                       | Comparaison N items (canaux, campagnes, produits).                |
| `compare`   | **Nouveau** — 2 charts côte-à-côte (panel split).                                       | « Compare A vs B ».                                               |
| `funnel`    | **Nouveau** — barres décroissantes avec % rétention entre étapes.                       | Conversion multi-étapes.                                          |
| `cohort`    | **Nouveau** — heatmap N×M (semaines × cohorte).                                         | Rétention / churn / lifecycle.                                    |
| `dashboard` | **Nouveau** — grid de 4-6 mini-cartes KPI (preview "ce que tu pourrais épingler").      | Question large type « santé globale ».                            |
| `callout`   | Carte conseil avec ton (good/mid/bad) + CTA optionnel (existant).                       | Recommandation actionnable.                                       |

Chaque bloc est rendu dans son propre composant React (`<TableHighlight>`, `<CompareHighlight>`, etc.) — mêmes conventions que `HighlightStack.tsx` actuel.

### 3.4 Action shelf — chaque réponse agit

Sous chaque réponse assistant (après le dernier bloc), une **shelf horizontale** d'actions :

| Bouton            | Effet                                                                                          | Plan requis |
| ----------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| `📥 Excel`        | Télécharge `.xlsx` : toutes les tables/séries de la réponse, 1 feuille par bloc.               | Free        |
| `📊 CSV`          | Télécharge `.csv` : version brute de la dernière table.                                        | Free        |
| `📌 Épingler`     | Ouvre un picker « ajouter au Dashboard » + crée un widget figé à partir d'un bloc chart/kpi.   | Pro         |
| `📑 → Rapport`    | Ouvre `ReportGenModal` pré-rempli avec template `executive` + analyst note = synthèse réponse. | Pro         |
| `⚠ → Veille`      | Ouvre `WatchModal` pré-rempli si la réponse mentionne une métrique chiffrée.                   | Free        |
| `🎴 → Slide deck` | Génère un .pptx 1-page récap (titre, 1 chart, 3 bullets).                                      | Pro         |
| `🔁 Reformuler`   | Re-run la même question avec le mode opposé (Rapide ↔ Approfondi) pour comparer.               | Free        |
| `📋 Copier`       | Copie le markdown brut.                                                                        | Free        |

**UX :** boutons icon-only avec tooltip ; sur mobile, menu `…` qui regroupe.

### 3.5 Affordance "Generative" — feedback temps réel

Pendant le streaming SSE :

1. **Skeleton intelligent** : si un tool call retourne une série (`get_metric_series`), on affiche **immédiatement** un placeholder chart skeleton (zone grise pulsante de la bonne forme) — l'user voit que ça vient.
2. **Tool badge inline** dans la prose : quand le LLM appelle `get_traffic_sources`, on affiche un petit chip animé `🔌 Lecture GA4…` qui disparaît quand le résultat arrive. Renforce le sentiment "il travaille pour moi".
3. **Annulation** : bouton `⏹ Arrêter` à la place de `↑` pendant la génération.

### 3.6 Historique conversations — niveau pro

Sidebar gauche (toggle desktop, drawer mobile) :

- Groupement par période (Aujourd'hui · Hier · Cette semaine · Plus tôt).
- Chaque conversation : titre auto-généré (2e passe Gemini sur le 1er échange) + 1 ligne preview.
- Recherche dans l'historique (déjà branché via GlobalSearch).
- Actions par conv au hover : `📌 Épingler` (favoris en haut) · `🗑 Supprimer` · `✏ Renommer`.
- Bouton primary en haut : « + Nouvelle conversation ».

---

## 4. Catalogue d'outputs génératifs — spec backend

### 4.1 Nouveaux tools (étendre `chat-tools.js`)

| Tool                     | Signature                                                                                | Output type    |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------- |
| `compare_metrics`        | `(metricKey, sourceA, sourceB, dateRange)` → 2 séries                                    | bloc `compare` |
| `compute_funnel`         | `(steps: [metricKey])` → array `{step, value, retentionPct}`                             | bloc `funnel`  |
| `compute_cohort`         | `(cohortDim, retentionMetric, periods)` → matrice                                        | bloc `cohort`  |
| `build_dashboard_preview` | `(workspaceId, kpiKeys[])` → 4-6 mini-cartes                                            | bloc `dashboard` |
| `export_xlsx`            | `(blocks: [type, data])` → URL signée d'un fichier dans Supabase Storage                 | retourne URL   |
| `generate_slide_deck`    | `(title, slides: [{heading, chart?, bullets[]}])` → URL signée d'un `.pptx`              | retourne URL   |
| `pin_to_dashboard`       | `(workspaceId, blockSpec)` → widget créé                                                 | retourne id    |

**Convention :** les tools "side-effect" (export, pin) ne sont déclenchés que si l'user clique sur l'action shelf — pas dans le flow autonome du LLM (sinon il génère des fichiers à chaque réponse).

### 4.2 Schéma réponse étendu

Le JSON streamé par `/chat/stream` actuel renvoie `{ text, highlights: [...] }`. On étend :

```ts
type AssistantResponse = {
  text: string                    // markdown
  blocks: Block[]                 // remplace progressivement `highlights`
  toolCalls: ToolCall[]           // pour le badge "🔌 Lecture GA4…"
  actions: ActionSpec[]           // shelf disponible (filtrée par plan côté backend)
  meta: { mode: 'fast'|'deep', tokensIn, tokensOut, durationMs }
}

type Block =
  | { type: 'text', markdown: string }
  | { type: 'kpi', ... }                     // existant
  | { type: 'chart', ... }                   // existant
  | { type: 'table', columns, rows, sortable: boolean }
  | { type: 'compare', left: ChartSpec, right: ChartSpec }
  | { type: 'funnel', steps: [{ label, value, retentionPct }] }
  | { type: 'cohort', matrix: number[][], rowLabels, colLabels }
  | { type: 'dashboard', cards: KpiCard[] }
  | { type: 'callout', ... }                 // existant
```

**Compat :** on garde `highlights[]` pendant 1 lot pour ne pas casser l'historique existant, puis migration douce → `blocks[]`.

### 4.3 Génération XLSX

- Lib : `exceljs` (zéro dépendance natifs, MIT, ~200 Ko gzip).
- Stockage : bucket Supabase Storage `chat-exports/`, fichiers privés, signature 1 h.
- Nommage : `chat-export-{conv_id}-{message_id}.xlsx`.
- Chaque bloc → 1 onglet (« Tableau », « Série CA », « Funnel »…).
- Cap : 50K cellules max (sinon refus + suggestion d'affiner la période).

### 4.4 Génération slide deck (.pptx)

- Lib : `pptxgenjs` (génère .pptx sans Office, MIT, ~500 Ko gzip).
- 1 slide par bloc significatif (chart + bullets).
- Template = thème workspace (`brand_color` du white-label).
- Cap : 10 slides max par output.

---

## 5. Gating & quotas (cohérent ADR-02 pricing)

| Capability                       | Free            | Pro          |
| -------------------------------- | --------------- | ------------ |
| Chat mode Rapide                 | ✅              | ✅           |
| Chat mode Approfondi             | 3 / mois        | Illimité     |
| Quick-cards empty state          | 4 cartes        | 8 cartes     |
| Action shelf : Excel/CSV/Copier  | ✅              | ✅           |
| Action shelf : Épingler dashboard | ❌             | ✅           |
| Action shelf : → Rapport         | ❌              | ✅           |
| Action shelf : → Slide deck      | ❌              | ✅           |
| Filtre sources actives           | ✅              | ✅           |
| Historique conversations         | 30 jours        | Illimité     |
| Multi-fichiers attachés (>1)     | ❌              | ✅           |

**Wiring :** la `shelf.actions[]` retournée par le backend filtre selon le plan ; le frontend affiche les actions désactivées avec un cadenas et un `UpgradePrompt` au clic.

---

## 6. Roadmap par lot

### Lot V2.1 — Fondations UI (2-3 jours)

- ✅ Empty state riche : titre rotatif + 8 quick-cards + toolbar input (📎 + 🎯 + mode toggle + ↑).
- ✅ Action shelf basique : Excel · CSV · Copier · Reformuler · Épingler (Pro gated).
- ✅ Sticky input en conversation active + chip sources persistante.
- ✅ Tool badge animé pendant streaming (« 🔌 Lecture GA4… »).
- ✅ Bouton `⏹ Arrêter` pendant streaming.
- **DoD :** tous les states UI, a11y AA, mobile fluide, event `chat_quickcard_clicked` posé.

### Lot V2.2 — Nouveaux blocs (3-4 jours)

- ✅ Bloc `table` (composant React + tool `compute_table_from_metrics`).
- ✅ Bloc `compare` (split-view 2 charts).
- ✅ Export XLSX réel (exceljs + Storage).
- ✅ Skeleton intelligent pendant tool calls retournant des séries.
- **DoD :** prompts test couvrent les 3 cas, tests E2E backend sur compute_table, perf < 3 s pour table 10 lignes.

### Lot V2.3 — Génératif avancé (1 semaine)

- ✅ Bloc `funnel` + tool `compute_funnel`.
- ✅ Bloc `cohort` + tool `compute_cohort`.
- ✅ Bloc `dashboard` (preview) + action « 📌 Épingler » qui crée un widget dans Audit/BriefHome.
- ✅ Génération slide deck `.pptx` (action shelf Pro).
- **DoD :** chaque tool a 2+ tests, slide deck valide ouvert dans Keynote/PowerPoint sans warning.

### Lot V3 (post-bêta — backlog)

- Multi-conversations parallèles (onglets).
- Voice input (Whisper) + voice output (TTS).
- "Genmoji marketing" — illustrations contextuelles auto (hero des rapports).
- Computer use / form filling (créer un audience Meta depuis le chat).

---

## 7. Definition of Done (universelle pour chaque lot)

- ✅ Validation serveur sur chaque nouvel input (Joi/express-validator).
- ✅ États UI : vide / chargement skeleton / erreur (retry) / succès / quota dépassé (UpgradePrompt).
- ✅ Idempotence sur les écritures (pin_to_dashboard, export → dedup_key).
- ✅ Tests : unitaires sur chaque nouveau tool + 1 test E2E chat → bloc rendu.
- ✅ a11y AA : focus visible, labels ARIA sur tools, contraste 4.5:1.
- ✅ Events tracking : `chat_quickcard_clicked`, `chat_action_taken{kind}`, `chat_export_generated{format}`.
- ✅ Consent Mode v2 respecté (export = bucket eu-west-3).
- ✅ i18n FR/EN sur tous les libellés UI.
- ✅ Mode `deep_chat` gated via `requireFeature('deep_chat')` + fallback transparent sur Rapide pour plan Free.

---

## 8. Garde-fous (ne PAS faire)

- ❌ Ne pas exposer le nom du modèle (« Gemini »/« Claude ») à l'user. Toggle UI = `⚡ Rapide` / `🧠 Approfondi` seulement.
- ❌ Ne pas générer d'images (off-persona pour annonceur final marketing).
- ❌ Ne pas faire de Stock Analysis (off-persona).
- ❌ Ne pas auto-exporter à chaque réponse — l'export coûte (compute + storage). Seulement sur action user.
- ❌ Ne pas lancer un slide deck pour des plans non-Pro — refus côté backend + UpgradePrompt côté UI.
- ❌ Ne pas remplacer le ChatGPT/Claude générique. La valeur unique = **les crochets d'action** (« → Rapport », « 📌 Épingler »…). Cf. CLAUDE.md « Garde-fou produit ».

---

## 9. Avantages concurrentiels après V2

Vs. Julius.ai :

- ✅ **Connecteurs marketing déjà câblés** (GA4, Meta, Google Ads, Stripe, SmartTag…) — Julius part de fichiers, nous partons des API live.
- ✅ **Action shelf** = boucle vers l'action (Rapport, Veille, Dashboard) que Julius n'a pas — c'est notre moat (cf. CLAUDE.md « copilote qui agit »).
- ✅ **Gouvernance EU** (hébergement Hostinger Paris + Supabase eu-west-3) — Julius est US.

Vs. ChatGPT/Claude générique :

- ✅ Contexte business pré-chargé (insights ouverts, top KPIs, profil sectoriel).
- ✅ Outputs structurés (chart, table) au lieu de prose pure.
- ✅ Outputs cliquables qui ne sortent pas du produit.

---

## 10. Références implémentation actuelle

- Backend : `apps/api/src/services/ai/chat.service.js` (askStream) + `chat-tools.js` (7 tools).
- Backend highlights : `apps/api/src/services/ai/chat-highlights.service.js` (extraction 2e passe Gemini).
- Frontend canvas : `apps/web/src/components/chat/HighlightStack.tsx` (types `kpi` / `callout` / `chart`).
- Frontend page : `apps/web/src/pages/Chat.tsx`.
- Streaming SSE : `apps/api/src/routes/chat.routes.js` POST `/chat/stream` + `apps/web/src/lib/api.ts` parser.
- Mode gating : `apps/api/src/services/billing/entitlements.service.js` (`canUseFeature('deep_chat')`).

---
