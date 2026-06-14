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
]

// Exécution. Reçoit { name, args } + workspaceId fixe. Retourne un objet JSON
// simple (sérialisable) que la couche chat re-passe au model comme functionResponse.
async function execute({ name, args }, { workspaceId }) {
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
