# 22c — Verdict response format (Phase 1 → 3)

> **Status** : Phase 1 livrée (primitives + types). Phase 2/3 en backlog.
> **Référence** : doc utilisateur "SMARTANALYST — RESPONSE FORMAT SYSTEM" reçu le 2026-06-23.
> **Lire avant** : `22b_FEATURE_CHAT_COPILOT_VISION.md` (vision globale chat V2).

---

## Philosophie

SmartAnalyst n'est pas un chatbot qui répond en prose. C'est un analyste senior
qui rend des **verdicts visuels, priorisés et actionnables**.

Chaque réponse "performance" suit cette logique stricte :

1. **Verdict** immédiat (1 ligne, avant tout)
2. **Données visuelles** (WinnerCard + tableau proportionnel + détails)
3. **Explication** concise du "pourquoi"
4. **Actions** priorisées et numérotées (toujours en bas, fond sombre)

### Règles absolues

- Pas d'emojis dans le contenu généré IA
- Pas de paragraphes introductifs longs
- Pas de reformulation de la question
- **Jamais** un problème sans action associée
- Les benchmarks externes citent toujours leurs sources

---

## Statuts (badge color system)

Quatre statuts pour qualifier un élément (campagne / produit / créa / canal) :

| Status   | Sens                                    | Tailwind                          |
| -------- | --------------------------------------- | --------------------------------- |
| `TOP`    | Meilleur de la liste, à scaler          | `bg-emerald-100 text-emerald-700` |
| `BON`    | Performant, à maintenir                 | `bg-blue-100 text-blue-700`       |
| `MOYEN`  | Potentiel, à optimiser                  | `bg-amber-100 text-amber-700`     |
| `FAIBLE` | Sous-performant, à stopper ou refondre  | `bg-red-100 text-red-700`         |

---

## Structure d'une réponse "verdict"

```
┌─ HEADER (contexte source + titre court)
├─ WINNER CARD (badge + métriques grid + insight 2-3 lignes)
├─ TABLEAU (5-7 lignes max, barre proportionnelle + statut)
├─ DETAIL PANEL (au clic sur une ligne — Phase 3)
└─ ACTIONS (fond gray-900, 3 actions numérotées) ← TOUJOURS PRÉSENT
```

---

## Patterns supportés (par type de question)

| Pattern         | Composants                                       | Métriques clés                          |
| --------------- | ------------------------------------------------ | --------------------------------------- |
| `campaigns`     | Winner + Tableau + Actions                       | Leads, CPL, CTR, ROAS                   |
| `creatives`     | Winner + Tableau (vidéo/carrousel/image) + Detail | CTR, CPL, Hook Rate, Completion        |
| `products`      | Winner + Tableau (double barre CVR+CPO) + Detail | CVR, CPO, AOV, Volume                   |
| `journey`       | InsightCard + MiniMapList + Funnel + Toggle      | CVR par parcours, drop-off              |
| `benchmark`     | ToggleSecteur + SpectrumBar + Distribution       | CVR vs marché + sources obligatoires    |
| `unavailable`   | Court — préciser ce qui manque                   | (rien)                                  |

---

## Phase 1 (livrée) — primitives + type Highlight étendu

Composants créés sous `apps/web/src/components/chat/verdict/` :

- `types.ts`              — `VerdictSpec`, `Status`, `Row`, `Action`, etc.
- `StatusBadge.tsx`       — badge coloré 4 tons
- `MetricCard.tsx`        — carte métrique (label / value / sub)
- `ProportionalBar.tsx`   — barre proportionnelle colorée par statut
- `WinnerCard.tsx`        — carte gagnant (header status + grid + insight)
- `ProportionalTable.tsx` — tableau interactif compact
- `ActionBlock.tsx`       — bloc actions fond gray-900 numéroté
- `VerdictHighlight.tsx`  — composant dispatcher

Type `Highlight` étendu (`HighlightStack.tsx`) avec `type: 'verdict'`.

## Phase 2 (à venir) — backend tool

- Nouveau tool `analyze_performance(pattern, metric_keys, segment_by)` dans
  `chat-tools.js` qui retourne un `verdict` structuré.
- Auto-injection cote `chat.service.js` (mêmes guards que table/compare).
- Prompt FR/EN enrichi : "pour les questions perf/créa/produit, préfère
  analyze_performance à un texte libre".

## Phase 3 (à venir) — interactivité

- DetailPanel cliquable
- ToggleGroup (canal / secteur / tri)
- FunnelBar avec drop-off rouge
- MiniMap customer journey

---
