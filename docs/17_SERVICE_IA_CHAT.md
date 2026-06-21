# 17 — Service IA Chat (backend)

> **État V1 :** livré. Streaming SSE + function calling Gemini/Claude + 7 tools.
> **État V2 cible :** voir `22b_FEATURE_CHAT_COPILOT_VISION.md` §4 (nouveaux tools + schéma réponse étendu).

---

## V1 actuelle (livrée)

### Endpoint principal

```
POST /api/v1/chat/stream
Body: {
  workspaceId: uuid,
  message: string,
  conversationId?: uuid,         // null = nouvelle conv
  mode: 'fast' | 'deep',         // UI: Rapide / Approfondi
  attachments?: [{ fileId }],    // multimodal (Gemini)
}
Response: text/event-stream (SSE), événements:
  - data: {"type":"chunk","text":"…"}                    // tokens texte
  - data: {"type":"tool_call","name":"…"}                // tool en cours
  - data: {"type":"tool_result","name":"…","data":…}     // tool retourné
  - data: {"type":"highlight","highlight":{…}}           // 2e passe extraction
  - data: {"type":"done","conversationId":"…"}           // fin
```

### Provider abstraction

- `apps/api/src/services/ai/chat.service.js` — orchestrateur (mode router, tool dispatch, persistance).
- `apps/api/src/services/ai/gemini.service.js` — generateStream + generateStructured.
- `apps/api/src/services/ai/claude.service.js` — wrapper Anthropic avec convertit Gemini tools → input_schema.
- Mode `deep` gated via `entitlements.canUseFeature('deep_chat')` — fallback transparent sur `fast` pour plan Free.

### Tools (V1)

| Tool                   | Effet                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `get_health_score`     | Score 0-100 du workspace + delta vs période précédente.                              |
| `list_top_insights`    | Top N insights ouverts (severity desc).                                              |
| `list_pending_actions` | Tâches non terminées (action_cards).                                                 |
| `get_metric_series`    | Série temporelle d'une `metric_key` sur une plage de dates, multi-sources possible.  |
| `get_traffic_sources`  | Breakdown GA4 live par canal (dimension `sessionDefaultChannelGroup`).               |
| `create_action_card`   | Crée une tâche (side-effect — confirme avant exécution si possible).                 |
| `create_watch`         | Crée une veille custom sur métrique × opérateur × seuil.                             |

### Highlights extraction (V1)

2e passe Gemini structurée sur la prose finale → renvoie 0-3 highlights typés `kpi`/`callout`/`chart`. Voir `chat-highlights.service.js`. Auto-injection d'un `chart` quand un tool retourne une série temporelle.

### Prompts système

- Contexte workspace pré-chargé : profil business, top 5 insights ouverts, KPIs principaux 30j.
- Convention multi-sources : si pas de `source` filtrée, sommer tous les connecteurs actifs.
- Style : factuel, FR, max 6 lignes de prose ; les détails passent par les highlights.

### Persistance

- `chat_conversations` (workspace_id, title auto-généré 2e passe sur 1er échange).
- `chat_messages` (role: user/assistant/tool, content jsonb, attachments, tool_calls jsonb).
- RLS workspace-scoped.

### Quotas

- Voir `entitlements.service.js`. Plan Free : 3 deep_chat / mois (cf. 22b §5).

---

## V2 cible — nouveaux tools + schéma réponse étendu

**Lire :** [`22b_FEATURE_CHAT_COPILOT_VISION.md`](./22b_FEATURE_CHAT_COPILOT_VISION.md) §4.

### Nouveaux tools à livrer (V2.2 + V2.3)

| Tool                       | Output bloc          | Lot   |
| -------------------------- | -------------------- | ----- |
| `compute_table_from_metrics` | `table`             | V2.2  |
| `compare_metrics`          | `compare` (2 charts) | V2.2  |
| `compute_funnel`           | `funnel`             | V2.3  |
| `compute_cohort`           | `cohort` (heatmap)   | V2.3  |
| `build_dashboard_preview`  | `dashboard` (4-6 KPI cards) | V2.3 |
| `export_xlsx`              | URL signée Storage   | V2.1  |
| `generate_slide_deck`      | URL signée .pptx     | V2.3  |
| `pin_to_dashboard`         | widget id            | V2.3  |

### Schéma réponse étendu (V2)

Passe progressivement de `{ text, highlights[] }` à `{ text, blocks[], toolCalls[], actions[], meta }`. Voir 22b §4.2 pour la TypeScript exacte. Compat `highlights[]` maintenue pendant 1 lot pour ne pas casser l'historique.

### Side-effect tools — règle de déclenchement

Les tools "side-effect" (`export_xlsx`, `pin_to_dashboard`, `generate_slide_deck`) **ne sont jamais déclenchés en autonome** par le LLM. Ils sont exécutés uniquement quand l'user clique sur l'action shelf du frontend (qui appelle l'endpoint correspondant avec le `messageId` source).

Sinon le LLM générerait un .xlsx à chaque réponse — coût storage + UX bruyante.

---

## Conventions

- Code en anglais, commentaires en français (cf. CLAUDE.md).
- Jamais exposer le nom du modèle (« Gemini »/« Claude ») dans une réponse ou un log destiné à l'user.
- Try/catch sur chaque appel provider, fail-open avec message FR/EN générique si fail.
- Logger structuré : `event: chat_*`, `requestId`, `workspaceId`, `mode`, `tokensIn`, `tokensOut`, `durationMs`.

---
