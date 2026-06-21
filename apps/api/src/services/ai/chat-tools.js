// Tool declarations + executors pour le chat function-calling (brief V2 §3.5).
//
// Pourquoi : avant, le chat ne pouvait répondre qu'avec les ~30 métriques
// pré-chargées dans le system prompt. Si l'user demandait "et mes tâches en
// attente ?", "mon score de santé ?", ou un chiffre précis sur une fenêtre
// spécifique, le model ne pouvait que dire "je n'ai pas accès". Function
// calling débloque ça : le model décide tout seul d'appeler un tool.
//
// Boucle côté chat.service : appel Gemini → si functionCalls → exécute →
// renvoie au model → boucle. Max 3 iterations pour éviter les loops.
//
// SÉCURITÉ : workspaceId est injecté côté serveur (jamais lu depuis les args
// du tool, même si le modèle hallucinait un autre id). Les executors sont
// best-effort : une erreur de tool n'est pas fatale, on remonte une string
// "Erreur : …" au model qui adapte sa réponse.

const canonicalMetrics = require('../metrics/canonical-metrics.service')
const insightsService = require('../insights/insights.service')
const healthScore = require('../health/health-score.service')
const watchesService = require('../watches/watches.service')
const ga4Live = require('../ga4/ga4-live.service')
const { logger } = require('../../lib/logger')

// Format Gemini function declarations (FunctionDeclaration[]).
// Limité à 4 tools pour rester ciblé — chaque ajout doit prouver sa
// valeur en usage réel.
const DECLARATIONS = [
  {
    name: 'get_health_score',
    description:
      "Récupère le score de santé global du workspace (0-100) avec breakdown par dimension (revenue, paid, organic, conversion, tracking). À utiliser quand l'user demande comment va son business globalement.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_top_insights',
    description:
      "Liste les insights actifs (status=open) du workspace, triés par sévérité. À utiliser quand l'user demande ce qui ne va pas, quels problèmes ont été détectés, ou veut un résumé des alertes.",
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'INTEGER',
          description: "Nombre max d'insights à retourner (défaut 5, max 10).",
        },
      },
    },
  },
  {
    name: 'list_pending_actions',
    description:
      "Liste les tâches actives du workspace (proposed = suggérées par l'IA à curer, todo = à faire aujourd'hui). À utiliser quand l'user demande ce qu'il doit faire, sa to-do, ses prochaines actions.",
    parameters: {
      type: 'OBJECT',
      properties: {
        bucket: {
          type: 'STRING',
          description:
            "'inbox' (tâches à valider), 'today' (tâches actives), ou 'active' (toutes en cours). Défaut 'active'.",
        },
      },
    },
  },
  {
    name: 'get_metric_series',
    description:
      "Récupère la série journalière d'une métrique canonique sur une fenêtre. À utiliser pour répondre à des questions précises sur un chiffre (évolution du MRR sur 30j, sessions hier, etc.).",
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_key: {
          type: 'STRING',
          description:
            "Clé canonique exacte. Exemples : 'revenue_recurring_monthly', 'sessions_all', 'churn_rate_subscription', 'spend_paid_social'.",
        },
        days: {
          type: 'INTEGER',
          description: 'Nombre de jours en arrière (1 à 90). Défaut 30.',
        },
      },
      required: ['metric_key'],
    },
  },
  // ─── Crochets d'action (cahier §3 Lot 1) ───────────────────────────────
  // Le différenciateur unique vs ChatGPT/Claude : depuis une réponse,
  // l'assistant peut CRÉER une tâche / une veille — directement.
  {
    name: 'create_action_card',
    description:
      "Crée une tâche actionnable dans la liste 'À faire' du workspace. À utiliser quand l'user demande explicitement d'ajouter une tâche, OU quand tu recommandes une action concrète et que c'est pertinent de la matérialiser comme tâche (pas pour les conseils abstraits). Le titre doit être concret et actionnable (verbe d'action en début).",
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description:
            "Titre court et actionnable de la tâche. Commence par un verbe d'action. Ex: 'Lancer un A/B test sur la créa Meta'.",
        },
        description: {
          type: 'STRING',
          description: 'Contexte optionnel (2-3 phrases max).',
        },
        priority: {
          type: 'STRING',
          description: "Priorité : 'critical', 'high', 'medium' (défaut), 'low'.",
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_traffic_sources',
    description:
      "Récupère le breakdown du trafic GA4 par canal d'acquisition (Organic Search, Paid Social, Direct, Email, Referral…) sur une fenêtre. À utiliser quand l'user demande d'où vient son trafic, quel canal performe, ou pour expliquer un pic/chute de sessions.",
    parameters: {
      type: 'OBJECT',
      properties: {
        days: {
          type: 'INTEGER',
          description: 'Nombre de jours en arrière (1 à 90). Défaut 7.',
        },
      },
    },
  },
  {
    name: 'create_watch',
    description:
      "Crée une veille (alerte automatique) sur une métrique. À utiliser quand l'user demande à être prévenu d'un changement (ex: 'préviens-moi si le MRR baisse', 'alerte si les sessions chutent de 20%').",
    parameters: {
      type: 'OBJECT',
      properties: {
        description: {
          type: 'STRING',
          description:
            'Phrase humaine de l’alerte. Ex: "Préviens-moi si le MRR baisse de plus de 5%".',
        },
        metric_key: {
          type: 'STRING',
          description:
            "Clé canonique exacte. Exemples : 'revenue_recurring_monthly', 'sessions_all', 'spend_paid_social'.",
        },
        operator: {
          type: 'STRING',
          description:
            "'gt' (supérieur), 'lt' (inférieur), 'pct_change_gt' (variation %), 'any_change' (toute variation).",
        },
        threshold: {
          type: 'NUMBER',
          description: 'Seuil numérique. Omis si operator=any_change.',
        },
        source: {
          type: 'STRING',
          description: 'Source spécifique optionnelle (ga4, meta_ads, stripe…).',
        },
      },
      required: ['description', 'metric_key', 'operator'],
    },
  },
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Lot V2.2 — nouveaux blocs reponse (cahier 22b §3.3)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    name: 'compute_table_from_metrics',
    description:
      "Construit une TABLE compacte de comparaison (1 ligne par dimension). À utiliser quand l'user demande de comparer N items entre eux : 'compare mes canaux', 'top 5 campagnes', 'CA par source'. Retourne columns + rows triés desc. Max 10 lignes.",
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_keys: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            "Métriques à mettre en colonnes (1 à 4). Ex: ['sessions_all','conversions_total','revenue_ecommerce'].",
        },
        group_by: {
          type: 'STRING',
          description:
            "Dimension de groupement. 'source' (par connecteur) = défaut. Pas d'autre valeur supportée en V2.2.",
        },
        days: {
          type: 'INTEGER',
          description: 'Fenêtre en jours (1 à 90). Défaut 30.',
        },
      },
      required: ['metric_keys'],
    },
  },
  {
    name: 'compare_metrics',
    description:
      "Retourne 2 séries temporelles à afficher CÔTE À CÔTE pour comparer 2 sources sur la même métrique. À utiliser pour 'compare GA4 vs Meta', 'sessions organic vs paid', etc.",
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_key: {
          type: 'STRING',
          description: "Métrique commune. Ex: 'sessions_all', 'revenue_ecommerce'.",
        },
        source_a: {
          type: 'STRING',
          description: "Source A (ex: 'ga4').",
        },
        source_b: {
          type: 'STRING',
          description: "Source B (ex: 'meta_ads').",
        },
        days: {
          type: 'INTEGER',
          description: 'Fenêtre en jours (1 à 90). Défaut 30.',
        },
      },
      required: ['metric_key', 'source_a', 'source_b'],
    },
  },
]

// Exécution. Reçoit { name, args } + workspaceId fixe. Retourne un objet JSON
// simple (sérialisable) que la couche chat re-passe au model comme functionResponse.
async function execute({ name, args }, { workspaceId, userId }) {
  if (!workspaceId) return { error: 'no_workspace' }

  try {
    if (name === 'get_health_score') {
      const r = await healthScore.getScore(workspaceId)
      return {
        score: r.score,
        delta_7d: r.delta,
        breakdown: r.breakdown,
        has_data: r.has_data,
      }
    }

    if (name === 'list_top_insights') {
      const limit = Math.min(Math.max(Number(args?.limit) || 5, 1), 10)
      const rows = await insightsService.listInsights(workspaceId, { status: 'open', limit })
      return {
        count: rows.length,
        items: rows.map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
          severity: i.severity,
          created_at: i.created_at,
        })),
      }
    }

    if (name === 'list_pending_actions') {
      const bucket = ['inbox', 'today', 'active'].includes(args?.bucket) ? args.bucket : 'active'
      const rows = await insightsService.listActions(workspaceId, { bucket, limit: 20 })
      return {
        count: rows.length,
        bucket,
        items: rows.map((a) => ({
          id: a.id,
          title: a.title,
          status: a.status,
          priority: a.priority,
        })),
      }
    }

    if (name === 'get_metric_series') {
      const metricKey = String(args?.metric_key || '').trim()
      if (!metricKey) return { error: 'metric_key required' }
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      const rows = await canonicalMetrics.query({
        workspaceId,
        metricKey,
        startDate: fmt(start),
        endDate: fmt(end),
        limit: 400,
      })
      // Agrège par date (somme si plusieurs sources). Tri ASC pour le model.
      const byDate = new Map()
      const sources = new Set()
      for (const r of rows) {
        sources.add(r.source)
        byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.metric_value))
      }
      const points = Array.from(byDate.entries())
        .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
      const total = points.reduce((s, p) => s + p.value, 0)
      return {
        metric_key: metricKey,
        days,
        sources: Array.from(sources),
        point_count: points.length,
        total: Math.round(total * 100) / 100,
        first: points[0] || null,
        last: points[points.length - 1] || null,
        points,
      }
    }

    if (name === 'get_traffic_sources') {
      const days = Math.min(Math.max(Number(args?.days) || 7, 1), 90)
      const res = await ga4Live.getTrafficSources({ workspaceId, days })
      if (!res) {
        return {
          error:
            'no_ga4_connector_or_unavailable: connect GA4 or check that the OAuth token is still valid.',
        }
      }
      return {
        days,
        total_sessions: res.total,
        channel_count: res.channels.length,
        channels: res.channels,
      }
    }

    if (name === 'create_action_card') {
      const title = String(args?.title || '').trim()
      if (!title || title.length < 3) return { error: 'title_required' }
      const created = await insightsService.createAction({
        workspaceId,
        userId: userId || null,
        title,
        description: args?.description ? String(args.description).trim() : null,
        priority: ['critical', 'high', 'medium', 'low'].includes(args?.priority)
          ? args.priority
          : 'medium',
        insightId: null,
        source: 'chat',
      })
      logger.info(
        { event: 'chat_tool_created_action', workspaceId, actionId: created.id },
        'Chat created action card',
      )
      return {
        ok: true,
        id: created.id,
        title: created.title,
        url: '/tasks',
        kind: 'action_card',
      }
    }

    if (name === 'create_watch') {
      const payload = {
        description: String(args?.description || '').trim(),
        metric_key: String(args?.metric_key || '').trim(),
        operator: args?.operator,
        threshold: args?.threshold,
        source: args?.source ? String(args.source).trim() : undefined,
      }
      try {
        const created = await watchesService.createWatch(workspaceId, userId || null, payload)
        logger.info(
          { event: 'chat_tool_created_watch', workspaceId, watchId: created.id },
          'Chat created watch',
        )
        return {
          ok: true,
          id: created.id,
          description: created.description,
          url: '/veille',
          kind: 'watch',
        }
      } catch (err) {
        // Erreur de validation user-facing du watch (ex. métrique inconnue) :
        // on remonte le message au LLM pour qu'il l'explique à l'user.
        return { error: err.message || 'invalid_watch_input' }
      }
    }

    if (name === 'compute_table_from_metrics') {
      const metricKeys = Array.isArray(args?.metric_keys)
        ? args.metric_keys
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 4)
        : []
      if (metricKeys.length === 0) return { error: 'metric_keys_required' }
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      const rows = await canonicalMetrics.query({
        workspaceId,
        metricKey: metricKeys,
        startDate: fmt(start),
        endDate: fmt(end),
        limit: 5000,
      })
      // Agrege : valeur somme par (source × metric_key) sur la fenetre.
      const agg = new Map() // key: source → Map(metricKey → sum)
      for (const r of rows) {
        const src = r.source || 'unknown'
        if (!agg.has(src)) agg.set(src, new Map())
        const inner = agg.get(src)
        inner.set(r.metric_key, (inner.get(r.metric_key) || 0) + Number(r.metric_value))
      }
      // Construit le tableau de sortie. 1ere colonne = dimension (source).
      const tableRows = Array.from(agg.entries()).map(([src, inner]) => {
        const row = { source: src }
        for (const mk of metricKeys) {
          const v = inner.get(mk) || 0
          row[mk] = Math.round(v * 100) / 100
        }
        return row
      })
      // Tri desc sur la 1ere metric. Cap 10 lignes pour la lisibilite UI.
      const sortKey = metricKeys[0]
      tableRows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
      return {
        kind: 'table',
        days,
        group_by: 'source',
        columns: ['source', ...metricKeys],
        rows: tableRows.slice(0, 10),
        truncated: tableRows.length > 10,
      }
    }

    if (name === 'compare_metrics') {
      const metricKey = String(args?.metric_key || '').trim()
      const sourceA = String(args?.source_a || '').trim()
      const sourceB = String(args?.source_b || '').trim()
      if (!metricKey || !sourceA || !sourceB) {
        return { error: 'metric_key_and_two_sources_required' }
      }
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      const buildSeries = async (src) => {
        const rows = await canonicalMetrics.query({
          workspaceId,
          metricKey,
          source: [src],
          startDate: fmt(start),
          endDate: fmt(end),
          limit: 400,
        })
        const byDate = new Map()
        for (const r of rows) {
          byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.metric_value))
        }
        const points = Array.from(byDate.entries())
          .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
        const total = points.reduce((s, p) => s + p.value, 0)
        return {
          source: src,
          point_count: points.length,
          total: Math.round(total * 100) / 100,
          points,
        }
      }
      const [left, right] = await Promise.all([buildSeries(sourceA), buildSeries(sourceB)])
      return {
        kind: 'compare',
        metric_key: metricKey,
        days,
        left,
        right,
      }
    }

    return { error: `unknown_tool:${name}` }
  } catch (err) {
    logger.warn(
      { event: 'chat_tool_failed', tool: name, workspaceId, error: err.message },
      'Chat tool execution failed',
    )
    return { error: err.message || 'tool_failed' }
  }
}

module.exports = { DECLARATIONS, execute }
