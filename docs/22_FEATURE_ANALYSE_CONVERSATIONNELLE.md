# 22 — Feature : Analyse conversationnelle (chat copilote)

> **État V1 :** livré (Lot 1+2). Chat texte + streaming SSE + highlights basiques + 7 tools + 2 modes (Rapide/Approfondi).
> **État V2 cible :** voir `22b_FEATURE_CHAT_COPILOT_VISION.md` (niveau Julius.ai).

---

## V1 actuelle (livrée)

### Interface

- Input plein écran en bas, sticky pendant scroll.
- Mode toggle `⚡ Rapide` / `🧠 Approfondi` (jamais "Gemini"/"Claude" en UI — cf. CLAUDE.md).
- Multimodal : upload fichiers (PDF, image, CSV) attachés à la question.
- Sortie : texte streamé + 0-3 highlights (`kpi` / `callout` / `chart`).
- Historique conversations persistées par workspace, recherche globale Cmd+K.

### Backend

- Endpoint `POST /api/v1/chat/stream` (SSE) — voir `17_SERVICE_IA_CHAT.md`.
- 7 tools : `get_health_score`, `list_top_insights`, `list_pending_actions`, `get_metric_series`, `get_traffic_sources`, `create_action_card`, `create_watch`.
- Provider abstraction : Gemini 2.5 Flash (Rapide) / Claude Sonnet (Approfondi).

### Rate limiting

- Free : `deep_chat` 3 / mois, Rapide illimité.
- Pro : `deep_chat` illimité.

---

## V2 cible — niveau Julius.ai

Le chat actuel résout le problème "trouver une info", mais reste **conversationnel** (texte + highlights). Julius.ai a posé un nouveau standard : le chat est **génératif** — chaque réponse produit un artefact (chart, table, slide, export…) cliquable et réutilisable.

**Lire en priorité :** [`22b_FEATURE_CHAT_COPILOT_VISION.md`](./22b_FEATURE_CHAT_COPILOT_VISION.md) — vision complète, UI/UX patterns, nouveaux blocs, catalogue d'outputs, roadmap par lot (V2.1 → V2.3).

### Synthèse en 3 mouvements

1. **Empty state riche** (lot V2.1) — quick-cards de démarrage à la Julius, placeholder rotatif, toolbar input pro (📎 + 🎯 sources + mode toggle + ↑).
2. **Canvas multi-blocs** (lot V2.2) — réponse = composition de blocs typés (`text`, `kpi`, `chart`, `table`, `compare`, `funnel`, `cohort`, `dashboard`, `callout`).
3. **Action shelf** (lot V2.1+) — chaque réponse expose `📥 Excel · 📌 Épingler · 📑 → Rapport · 🎴 → Slide deck · ⚠ → Veille`. C'est le moat : Julius n'a pas la boucle vers l'action SmartAnalyst.

### Gating V2 (cf. ADR-02 + CLAUDE.md)

| Capability                       | Free            | Pro          |
| -------------------------------- | --------------- | ------------ |
| Action shelf : Excel/CSV/Copier  | ✅              | ✅           |
| Action shelf : Épingler dashboard | ❌             | ✅           |
| Action shelf : → Rapport         | ❌              | ✅           |
| Action shelf : → Slide deck      | ❌              | ✅           |

---

## Hors scope (Julius le fait, nous non)

- ❌ Génération d'images / Stock Analysis : off-persona annonceur final marketing.
- ❌ Tracker générique : on a déjà la Veille (`/veille`), c'est plus contextualisé.

---
