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
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Lot V2.3 — blocs funnel + dashboard preview (cahier 22b §3.3 + §4.1)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    name: 'compute_funnel',
    description:
      "Calcule un FUNNEL de conversion : chaque etape = somme d'une metrique sur la fenetre, retention % vs etape precedente. À utiliser pour 'funnel e-commerce', 'sessions → ajout panier → commande', etc. Entre 2 et 6 etapes.",
    parameters: {
      type: 'OBJECT',
      properties: {
        steps: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            "Liste ordonnée de metric_keys, du sommet du funnel vers le bas. Ex: ['sessions_all','add_to_cart','orders_count'].",
        },
        days: {
          type: 'INTEGER',
          description: 'Fenêtre en jours (1 à 90). Défaut 30.',
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'build_dashboard_preview',
    description:
      "Renvoie un APERCU DASHBOARD de 4 a 6 KPIs (carte chiffre + delta vs N-1) cote a cote. À utiliser pour 'sante globale', 'vue d'ensemble', 'tableau de bord'. L'user peut ensuite epingler chaque carte au vrai dashboard.",
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_keys: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            "4 a 6 metric_keys representatives. Ex: ['revenue_ecommerce','sessions_all','orders_count','conversions_total'].",
        },
        days: {
          type: 'INTEGER',
          description: 'Fenêtre en jours (1 à 90). Défaut 30.',
        },
      },
      required: ['metric_keys'],
    },
  },
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Cahier 22c — verdict response format. Tool unique pour les questions
  // "qui performe le mieux / le moins" sur campagnes/créas/produits. Produit
  // une réponse structurée (winner + tableau proportionnel + actions) qui
  // sera rendue sous forme de VerdictHighlight côté UI.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    name: 'analyze_performance',
    description:
      "Produit une REPONSE ANALYSTE COMPLETE (gagnant + tableau proportionnel + actions) pour les questions de performance par source : 'quel canal performe le mieux', 'top campagnes', 'meilleurs produits', 'créa qui marche le mieux'. Groupé par source (ga4, meta_ads, google_ads, stripe…). Le frontend rend automatiquement un bloc visuel structuré — n'écris PAS un tableau en texte par-dessus, contente-toi d'un commentaire court.",
    parameters: {
      type: 'OBJECT',
      properties: {
        pattern: {
          type: 'STRING',
          description:
            "Type de question : 'campaigns' (canaux/campagnes payantes), 'creatives' (créatives/ads), 'products' (produits/SKU). Défaut 'campaigns'.",
        },
        metric_keys: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            "1 à 3 métriques canoniques. La 1ère est la métrique principale (utilisée pour le ranking + barre proportionnelle). Ex: ['revenue_ecommerce','sessions_all','conversions_total'].",
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
    name: 'analyze_journey',
    description:
      "Produit une REPONSE ANALYSTE FUNNEL (étapes + % rétention + verdict + actions sur le drop-off le plus fort) pour les questions de parcours utilisateur : 'mon funnel e-commerce', 'taux de conversion sessions → commande', 'où je perds mes users'. Le frontend rend un FunnelBar coloré (drop-off rouge > 45%) sous ta réponse — ne réécris PAS les % en texte, contente-toi d'un commentaire court.",
    parameters: {
      type: 'OBJECT',
      properties: {
        steps: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            "2 à 6 metric_keys ordonnés du HAUT vers le BAS du funnel. Ex: ['sessions_all','add_to_cart','orders_count'].",
        },
        days: {
          type: 'INTEGER',
          description: 'Fenêtre en jours (1 à 90). Défaut 30.',
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'analyze_benchmark',
    description:
      "Positionne UNE valeur user vs un benchmark externe (P25/médiane/P75 du secteur). À utiliser pour 'mon ROAS est bon ?', 'comment je me situe vs le marché', 'benchmark CPL e-commerce'. Tu fournis les bornes p25/p50/p75 d'après ta connaissance du secteur + cite la source (étude, rapport). Le frontend rend un Spectrum + Sources sous ta réponse — n'écris PAS les chiffres du benchmark en texte. IMPORTANT : marque clairement la source ; si tu n'as pas de référence fiable pour ce secteur/métrique, dis-le plutôt que d'inventer.",
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_key: {
          type: 'STRING',
          description: "Clé canonique de la metric user. Ex: 'return_on_investment_paid'.",
        },
        sector: {
          type: 'STRING',
          description:
            "Secteur de comparaison court (ex: 'E-commerce mode', 'SaaS B2B', 'Lead gen'). Affiché dans le header.",
        },
        benchmark_p25: {
          type: 'NUMBER',
          description: '25e percentile du benchmark (mauvais quartile).',
        },
        benchmark_p50: { type: 'NUMBER', description: 'Médiane du benchmark.' },
        benchmark_p75: {
          type: 'NUMBER',
          description: '75e percentile du benchmark (top quartile).',
        },
        direction: {
          type: 'STRING',
          description:
            "'higher_better' (ROAS, CVR…) ou 'lower_better' (CPL, churn, CAC). Défaut 'higher_better'.",
        },
        source_name: {
          type: 'STRING',
          description:
            "Nom court de la source benchmark, ex: 'WordStream Benchmark 2024', 'Klaviyo Benchmark e-commerce'.",
        },
        source_url: {
          type: 'STRING',
          description: 'URL externe de la source (optionnel).',
        },
        days: {
          type: 'INTEGER',
          description: 'Fenêtre user en jours (1 à 90, défaut 30). Sert à agréger la metric user.',
        },
      },
      required: [
        'metric_key',
        'sector',
        'benchmark_p25',
        'benchmark_p50',
        'benchmark_p75',
        'source_name',
      ],
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

    if (name === 'compute_funnel') {
      const steps = Array.isArray(args?.steps)
        ? args.steps
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 6)
        : []
      if (steps.length < 2) return { error: 'funnel_needs_2_to_6_steps' }
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      const rows = await canonicalMetrics.query({
        workspaceId,
        metricKey: steps,
        startDate: fmt(start),
        endDate: fmt(end),
        limit: 5000,
      })
      // Somme par metric_key sur la fenetre. Pas de breakdown par source ici :
      // le funnel cross-source est plus utile que par-canal en general.
      const totals = new Map()
      for (const r of rows) {
        totals.set(r.metric_key, (totals.get(r.metric_key) || 0) + Number(r.metric_value))
      }
      const funnelSteps = steps.map((mk, i) => {
        const value = Math.round((totals.get(mk) || 0) * 100) / 100
        const prevValue = i === 0 ? null : Math.round((totals.get(steps[i - 1]) || 0) * 100) / 100
        const retentionPct =
          i === 0 || prevValue == null || prevValue === 0
            ? null
            : Math.round((value / prevValue) * 1000) / 10
        return { label: mk, value, retentionPct }
      })
      return {
        kind: 'funnel',
        days,
        steps: funnelSteps,
      }
    }

    if (name === 'build_dashboard_preview') {
      const metricKeys = Array.isArray(args?.metric_keys)
        ? args.metric_keys
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 6)
        : []
      if (metricKeys.length === 0) return { error: 'metric_keys_required' }
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400_000)
      const prevEnd = new Date(start.getTime() - 1)
      const prevStart = new Date(prevEnd.getTime() - days * 86400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      // 2 fenetres pour calculer le delta vs periode precedente.
      const [curRows, prevRows] = await Promise.all([
        canonicalMetrics.query({
          workspaceId,
          metricKey: metricKeys,
          startDate: fmt(start),
          endDate: fmt(end),
          limit: 5000,
        }),
        canonicalMetrics.query({
          workspaceId,
          metricKey: metricKeys,
          startDate: fmt(prevStart),
          endDate: fmt(prevEnd),
          limit: 5000,
        }),
      ])
      const sum = (arr) => {
        const acc = new Map()
        for (const r of arr) {
          acc.set(r.metric_key, (acc.get(r.metric_key) || 0) + Number(r.metric_value))
        }
        return acc
      }
      const cur = sum(curRows)
      const prev = sum(prevRows)
      const cards = metricKeys.map((mk) => {
        const value = Math.round((cur.get(mk) || 0) * 100) / 100
        const pv = prev.get(mk) || 0
        const deltaPct = pv === 0 ? null : Math.round(((value - pv) / Math.abs(pv)) * 1000) / 10
        return {
          metricKey: mk,
          value,
          previousValue: Math.round(pv * 100) / 100,
          deltaPct,
        }
      })
      return {
        kind: 'dashboard',
        days,
        cards,
      }
    }

    if (name === 'analyze_performance') {
      const metricKeys = Array.isArray(args?.metric_keys)
        ? args.metric_keys
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 3)
        : []
      if (metricKeys.length === 0) return { error: 'metric_keys_required' }
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const pattern = ['campaigns', 'creatives', 'products'].includes(args?.pattern)
        ? args.pattern
        : 'campaigns'
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
      if (rows.length === 0) {
        // Pas de data sur la fenetre : on signale unavailable au frontend.
        return buildUnavailableVerdict(pattern, metricKeys, days)
      }
      const spec = buildAnalyzePerformanceVerdict({
        pattern,
        metricKeys,
        days,
        rows,
      })
      return spec
    }

    if (name === 'analyze_benchmark') {
      const metricKey = String(args?.metric_key || '').trim()
      const sector = String(args?.sector || '').trim()
      const sourceName = String(args?.source_name || '').trim()
      const p25 = Number(args?.benchmark_p25)
      const p50 = Number(args?.benchmark_p50)
      const p75 = Number(args?.benchmark_p75)
      if (
        !metricKey ||
        !sector ||
        !sourceName ||
        !Number.isFinite(p25) ||
        !Number.isFinite(p50) ||
        !Number.isFinite(p75)
      ) {
        return { error: 'benchmark_args_required' }
      }
      const direction = args?.direction === 'lower_better' ? 'lower_better' : 'higher_better'
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      const rows = await canonicalMetrics.query({
        workspaceId,
        metricKey,
        startDate: fmt(start),
        endDate: fmt(end),
        limit: 1000,
      })
      if (rows.length === 0) {
        return buildUnavailableVerdict('benchmark', [metricKey], days)
      }
      // Aggregation : moyenne pour metriques "ratio" (ROAS, CVR), somme sinon.
      const unit = METRIC_UNIT[metricKey] || 'count'
      const numbers = rows.map((r) => Number(r.metric_value)).filter((n) => Number.isFinite(n))
      let userValue
      if (unit === 'ratio') {
        userValue = numbers.reduce((s, v) => s + v, 0) / Math.max(numbers.length, 1)
      } else {
        userValue = numbers.reduce((s, v) => s + v, 0)
      }
      userValue = Math.round(userValue * 100) / 100
      return buildAnalyzeBenchmarkVerdict({
        metricKey,
        sector,
        userValue,
        p25,
        p50,
        p75,
        direction,
        sourceName,
        sourceUrl: args?.source_url ? String(args.source_url).trim() : null,
        days,
      })
    }

    if (name === 'analyze_journey') {
      const steps = Array.isArray(args?.steps)
        ? args.steps
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 6)
        : []
      if (steps.length < 2) return { error: 'journey_needs_2_to_6_steps' }
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 90)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400_000)
      const fmt = (d) => d.toISOString().slice(0, 10)
      const rows = await canonicalMetrics.query({
        workspaceId,
        metricKey: steps,
        startDate: fmt(start),
        endDate: fmt(end),
        limit: 5000,
      })
      const totals = new Map()
      for (const r of rows) {
        totals.set(r.metric_key, (totals.get(r.metric_key) || 0) + Number(r.metric_value))
      }
      if (steps.every((s) => !(totals.get(s) > 0))) {
        return buildUnavailableVerdict('journey', steps, days)
      }
      return buildAnalyzeJourneyVerdict({ steps, days, totals })
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

// ─── Helpers cahier 22c — analyze_performance ─────────────────────────────
// Labels FR par metric_key (court, lisible dans le badge "Vue d'ensemble").
// Inconnu = on rend la metric_key brute, c'est mieux qu'un fallback générique.
const METRIC_LABEL_FR = {
  revenue_ecommerce: 'CA',
  revenue_recurring_monthly: 'MRR',
  revenue_annual_recurring: 'ARR',
  sessions_all: 'Sessions',
  users_active: 'Utilisateurs actifs',
  users_new: 'Nouveaux utilisateurs',
  conversions_total: 'Conversions',
  orders_count: 'Commandes',
  bounce_rate_all: 'Taux de rebond',
  spend_paid_social: 'Dépense paid social',
  spend_paid_search: 'Dépense paid search',
  clicks_paid_social: 'Clics paid social',
  clicks_paid_search: 'Clics paid search',
  return_on_investment_paid: 'ROAS',
  click_through_rate_paid: 'CTR',
  customers_active: 'Clients actifs',
  customers_new: 'Nouveaux clients',
}

// Unite par metric_key pour formater value/secondary correctement.
const METRIC_UNIT = {
  revenue_ecommerce: 'eur',
  revenue_recurring_monthly: 'eur',
  revenue_annual_recurring: 'eur',
  spend_paid_social: 'eur',
  spend_paid_search: 'eur',
  bounce_rate_all: 'ratio',
  return_on_investment_paid: 'ratio',
  click_through_rate_paid: 'ratio',
}

// Labels FR par source (sinon on rend tel quel).
const SOURCE_LABEL_FR = {
  ga4: 'GA4',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  stripe: 'Stripe',
  search_console: 'Search Console',
}

function labelForMetric(key) {
  return METRIC_LABEL_FR[key] || key
}

function labelForSource(src) {
  return SOURCE_LABEL_FR[src] || src
}

function formatMetricValue(value, unit) {
  if (!Number.isFinite(value)) return String(value)
  if (unit === 'eur') {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value)
  }
  if (unit === 'ratio') {
    const pct = value <= 1 ? value * 100 : value
    return `${pct.toFixed(1)}%`
  }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)
}

// Statuts par quartiles. Pour N <= 3, on simplifie : 1er = TOP, dernier = FAIBLE
// (sauf si N=1 → TOP), milieu = BON. Pour N >= 4, quartile classique.
// idx = position dans le tri DESC (0 = meilleur).
function statusForRank(idx, total) {
  if (total <= 1) return 'TOP'
  if (total === 2) return idx === 0 ? 'TOP' : 'BON'
  if (total === 3) return idx === 0 ? 'TOP' : idx === 1 ? 'BON' : 'MOYEN'
  const ratio = (idx + 1) / total
  if (ratio <= 0.25) return 'TOP'
  if (ratio <= 0.5) return 'BON'
  if (ratio <= 0.75) return 'MOYEN'
  return 'FAIBLE'
}

const PATTERN_LABELS = {
  campaigns: { context: 'Canaux', titleFR: 'Performance par canal', noun: 'canal' },
  creatives: { context: 'Créatives', titleFR: 'Performance par créative', noun: 'créative' },
  products: { context: 'Produits', titleFR: 'Performance par produit', noun: 'produit' },
  journey: { context: 'Funnel', titleFR: 'Parcours utilisateur', noun: 'étape' },
  benchmark: { context: 'Benchmark', titleFR: 'Positionnement vs marché', noun: 'metric' },
}

function buildUnavailableVerdict(pattern, metricKeys, days) {
  const ctx = PATTERN_LABELS[pattern] || PATTERN_LABELS.campaigns
  const mainLabel = labelForMetric(metricKeys[0])
  const verdict =
    pattern === 'journey'
      ? `Pas assez de données pour reconstituer le funnel sur les ${days} derniers jours. Vérifie que les ${metricKeys.length} étapes sont bien trackées (event GA4, conversion, etc.).`
      : `Pas de données ${mainLabel.toLowerCase()} sur les ${days} derniers jours. Connecte une source ou élargis la fenêtre pour obtenir un classement par ${ctx.noun}.`
  return {
    pattern: 'unavailable',
    header: {
      context: `${ctx.context} · ${days}j`,
      title: 'Données insuffisantes',
    },
    verdict,
    actions: [{ text: 'Vérifier les connecteurs actifs depuis Sources' }],
    winner: null,
    rows: null,
  }
}

// Agrege les rows canoniques par source → { source: { metricKey: somme } }.
function aggregateBySource(rows) {
  const agg = new Map()
  for (const r of rows) {
    const src = r.source || 'unknown'
    if (!agg.has(src)) agg.set(src, new Map())
    const inner = agg.get(src)
    inner.set(r.metric_key, (inner.get(r.metric_key) || 0) + Number(r.metric_value))
  }
  return agg
}

// Construit l'integralite du VerdictSpec a partir des rows canoniques.
// Exporte pour permettre de tester la logique sans toucher Supabase.
function buildAnalyzePerformanceVerdict({ pattern, metricKeys, days, rows }) {
  const ctx = PATTERN_LABELS[pattern] || PATTERN_LABELS.campaigns
  const mainKey = metricKeys[0]
  const mainUnit = METRIC_UNIT[mainKey] || 'count'
  const mainLabel = labelForMetric(mainKey)

  const agg = aggregateBySource(rows)
  // Construit la liste source → totaux par metric. Tri desc sur la metric principale.
  const sourceRows = Array.from(agg.entries()).map(([source, inner]) => {
    const totals = {}
    for (const mk of metricKeys) {
      totals[mk] = Math.round((inner.get(mk) || 0) * 100) / 100
    }
    return { source, totals }
  })
  sourceRows.sort((a, b) => (b.totals[mainKey] || 0) - (a.totals[mainKey] || 0))
  const capped = sourceRows.slice(0, 7)
  const totalMain = sourceRows.reduce((s, r) => s + (r.totals[mainKey] || 0), 0)

  // Statut par quartile sur l'ordre du tri.
  const withStatus = capped.map((r, i) => ({
    ...r,
    status: statusForRank(i, capped.length),
  }))

  // Winner = 1er. Si totalMain = 0 → pas de gagnant signifiant.
  const top = withStatus[0]
  let winner = null
  if (top && top.totals[mainKey] > 0) {
    const sharePct = totalMain > 0 ? Math.round((top.totals[mainKey] / totalMain) * 1000) / 10 : 0
    const winnerMetrics = metricKeys.map((mk, idx) => ({
      label: labelForMetric(mk),
      value: formatMetricValue(top.totals[mk] || 0, METRIC_UNIT[mk] || 'count'),
      sub: idx === 0 && sharePct > 0 ? `${sharePct.toString().replace('.', ',')}% du total` : null,
      highlight: idx === 0,
    }))
    winner = {
      name: labelForSource(top.source),
      status: 'TOP',
      metrics: winnerMetrics,
      insight: `${labelForSource(top.source)} concentre ${sharePct.toString().replace('.', ',')}% du ${mainLabel.toLowerCase()} sur la fenêtre — c'est le ${ctx.noun} le plus rentable à pousser en priorité.`,
    }
  }

  // Rows pour la table proportionnelle (max 7).
  const rowsOut = withStatus.map((r) => {
    const secondaryKey = metricKeys[1]
    const secondary =
      secondaryKey && r.totals[secondaryKey] > 0
        ? `${labelForMetric(secondaryKey)} : ${formatMetricValue(r.totals[secondaryKey], METRIC_UNIT[secondaryKey] || 'count')}`
        : null
    return {
      id: r.source,
      name: labelForSource(r.source),
      status: r.status,
      value: r.totals[mainKey] || 0,
      valueLabel: formatMetricValue(r.totals[mainKey] || 0, mainUnit),
      secondary,
      metrics: metricKeys.map((mk) => ({
        label: labelForMetric(mk),
        value: formatMetricValue(r.totals[mk] || 0, METRIC_UNIT[mk] || 'count'),
      })),
    }
  })

  // Actions auto-générées : 1 sur le gagnant, 1 sur les faibles si présents.
  const actions = []
  if (winner) {
    actions.push({
      text: `Allouer plus de budget à ${winner.name} (${winner.metrics[0].value} sur ${days}j)`,
    })
  }
  const weak = withStatus.filter((r) => r.status === 'FAIBLE' || r.status === 'MOYEN')
  if (weak.length > 0) {
    const names = weak
      .map((r) => labelForSource(r.source))
      .slice(0, 2)
      .join(' et ')
    actions.push({
      text: `Auditer ${names} avant d'arbitrer une baisse de budget`,
    })
  }
  if (actions.length === 0) {
    actions.push({ text: `Élargir la fenêtre au-delà de ${days}j pour confirmer la tendance` })
  }

  // Verdict 1-ligne factuel.
  let verdict
  if (winner) {
    const second = withStatus[1]
    if (second && second.totals[mainKey] > 0) {
      const gap = Math.round((top.totals[mainKey] / Math.max(second.totals[mainKey], 1)) * 10) / 10
      verdict = `${winner.name} domine sur ${mainLabel.toLowerCase()} (×${gap.toString().replace('.', ',')} vs ${labelForSource(second.source)}) sur les ${days} derniers jours.`
    } else {
      verdict = `${winner.name} est la seule source ayant généré du ${mainLabel.toLowerCase()} sur les ${days} derniers jours.`
    }
  } else {
    verdict = `Aucune source n'a généré de ${mainLabel.toLowerCase()} significatif sur les ${days} derniers jours.`
  }

  return {
    pattern,
    header: {
      context: `${ctx.context} · ${days}j`,
      title: ctx.titleFR,
    },
    verdict,
    winner,
    rows: rowsOut,
    actions,
  }
}

// Statut d'une etape funnel pilote par sa retention vs etape precedente.
// 1ere etape = TOP par defaut (rien a comparer).
function statusForRetention(retentionPct) {
  if (retentionPct == null) return 'TOP'
  if (retentionPct >= 60) return 'TOP'
  if (retentionPct >= 35) return 'BON'
  if (retentionPct >= 15) return 'MOYEN'
  return 'FAIBLE'
}

// Construit un VerdictSpec pattern='journey' a partir des totaux par metric_key.
// Exporte pour tester sans toucher Supabase.
function buildAnalyzeJourneyVerdict({ steps, days, totals }) {
  const stepsOut = steps.map((mk, i) => {
    const value = Math.round((totals.get(mk) || 0) * 100) / 100
    const prev = i === 0 ? null : Math.round((totals.get(steps[i - 1]) || 0) * 100) / 100
    const retentionPct =
      i === 0 || prev == null || prev === 0 ? null : Math.round((value / prev) * 1000) / 10
    return {
      label: labelForMetric(mk),
      value,
      valueLabel: formatMetricValue(value, METRIC_UNIT[mk] || 'count'),
      retentionPct,
      status: statusForRetention(retentionPct),
    }
  })

  // Drop-off = max(1 - retention). On cible l'etape avec la plus grosse fuite
  // (la pire transition) pour l'action prioritaire.
  let worstIdx = -1
  let worstLoss = -1
  for (let i = 1; i < stepsOut.length; i++) {
    const r = stepsOut[i].retentionPct
    if (r == null) continue
    const loss = 100 - r
    if (loss > worstLoss) {
      worstLoss = loss
      worstIdx = i
    }
  }

  const first = stepsOut[0]
  const last = stepsOut[stepsOut.length - 1]
  const globalConv = first.value > 0 ? Math.round((last.value / first.value) * 1000) / 10 : null

  let verdict
  if (globalConv == null) {
    verdict = `Pas assez de signal en haut de funnel sur les ${days} derniers jours pour mesurer la conversion globale.`
  } else if (worstIdx > 0) {
    const w = stepsOut[worstIdx]
    const prev = stepsOut[worstIdx - 1]
    verdict = `${globalConv.toString().replace('.', ',')}% de conversion globale sur ${days}j — la fuite la plus forte est entre ${prev.label.toLowerCase()} et ${w.label.toLowerCase()} (${Math.round(worstLoss)}% perdus).`
  } else {
    verdict = `${globalConv.toString().replace('.', ',')}% de conversion globale sur les ${days} derniers jours.`
  }

  const actions = []
  if (worstIdx > 0 && worstLoss >= 45) {
    const w = stepsOut[worstIdx]
    const prev = stepsOut[worstIdx - 1]
    actions.push({
      text: `Auditer la transition ${prev.label.toLowerCase()} → ${w.label.toLowerCase()} (${Math.round(worstLoss)}% de perte)`,
    })
  } else if (worstIdx > 0) {
    const w = stepsOut[worstIdx]
    actions.push({
      text: `Tester une amélioration sur l'étape ${w.label.toLowerCase()} pour grappiller du taux de conversion`,
    })
  }
  if (globalConv != null && globalConv < 1) {
    actions.push({
      text: `Vérifier la qualité du trafic en entrée — la conversion globale est sous 1%`,
    })
  }
  if (actions.length === 0) {
    actions.push({
      text: `Élargir la fenêtre au-delà de ${days}j pour confirmer la tendance`,
    })
  }

  return {
    pattern: 'journey',
    header: {
      context: `Funnel · ${days}j`,
      title: 'Parcours utilisateur',
    },
    verdict,
    journey: { steps: stepsOut },
    actions,
  }
}

// Place une valeur user sur l'axe p25-p75 (0..100). En lower_better, l'axe
// est inverse : une valeur basse arrive a 100, une valeur haute a 0.
function spectrumPosition({ userValue, p25, p75, direction }) {
  if (!Number.isFinite(p25) || !Number.isFinite(p75) || p25 === p75) return 50
  const span = p75 - p25
  let pct = ((userValue - p25) / span) * 100
  if (direction === 'lower_better') pct = 100 - pct
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10))
}

// Statut benchmark : positionPct >= 75 → TOP, >= 50 → BON, >= 25 → MOYEN, sinon FAIBLE.
function statusForBenchmarkPosition(positionPct) {
  if (positionPct >= 75) return 'TOP'
  if (positionPct >= 50) return 'BON'
  if (positionPct >= 25) return 'MOYEN'
  return 'FAIBLE'
}

// Construit un VerdictSpec pattern='benchmark' a partir de la valeur user et
// du triplet de reference. Exporte pour tests.
function buildAnalyzeBenchmarkVerdict({
  metricKey,
  sector,
  userValue,
  p25,
  p50,
  p75,
  direction,
  sourceName,
  sourceUrl,
  days,
}) {
  const unit = METRIC_UNIT[metricKey] || 'count'
  const positionPct = spectrumPosition({ userValue, p25, p75, direction })
  const status = statusForBenchmarkPosition(positionPct)
  const metricLabel = labelForMetric(metricKey)
  const userValueLabel = formatMetricValue(userValue, unit)
  const fmt = (n) => formatMetricValue(n, unit)

  // Verdict 1-ligne contextualisé selon le quartile occupé.
  let verdict
  if (direction === 'higher_better') {
    if (userValue >= p75) {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — top quartile du secteur ${sector} (médiane à ${fmt(p50)}).`
    } else if (userValue >= p50) {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — au-dessus de la médiane ${sector} (${fmt(p50)}), il reste de la marge vers ${fmt(p75)}.`
    } else if (userValue >= p25) {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — sous la médiane ${sector} (${fmt(p50)}), il y a du potentiel à débloquer.`
    } else {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — dans le quartile bas du secteur ${sector} (P25 à ${fmt(p25)}), priorité d'amélioration.`
    }
  } else {
    if (userValue <= p25) {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — top quartile du secteur ${sector} (médiane à ${fmt(p50)}, plus c'est bas mieux c'est).`
    } else if (userValue <= p50) {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — sous la médiane ${sector} (${fmt(p50)}), bon positionnement.`
    } else if (userValue <= p75) {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — au-dessus de la médiane ${sector} (${fmt(p50)}), il y a du gras à raboter.`
    } else {
      verdict = `${metricLabel} à ${userValueLabel} sur ${days}j — dans le quartile haut du secteur ${sector} (P75 à ${fmt(p75)}), priorité d'optimisation.`
    }
  }

  // Actions auto-generees selon le quartile.
  const actions = []
  if (status === 'FAIBLE' || status === 'MOYEN') {
    actions.push({
      text: `Identifier les 2-3 leviers les plus prometteurs sur ${metricLabel.toLowerCase()} et les tester sur les 30 prochains jours`,
    })
  } else if (status === 'BON') {
    actions.push({
      text: `Documenter ce qui fait que ${metricLabel.toLowerCase()} est au-dessus de la médiane — c'est ce qu'il faut protéger`,
    })
  } else {
    actions.push({
      text: `Maintenir l'écart : audit trimestriel sur ${metricLabel.toLowerCase()} pour ne pas glisser`,
    })
  }
  actions.push({
    text: `Recouper avec ${sourceName} avant d'arbitrer une décision majeure (benchmarks indicatifs)`,
  })

  return {
    pattern: 'benchmark',
    header: {
      context: `Benchmark · ${sector} · ${days}j`,
      title: 'Positionnement vs marché',
    },
    verdict,
    benchmark: {
      metricLabel,
      userValueLabel,
      userValue,
      p25,
      p50,
      p75,
      p25Label: fmt(p25),
      p50Label: fmt(p50),
      p75Label: fmt(p75),
      positionPct,
      status,
      direction,
    },
    actions,
    sources: [{ name: sourceName, url: sourceUrl || null }],
  }
}

module.exports = {
  DECLARATIONS,
  execute,
  // Exposed for tests (Phase 2 cahier 22c).
  buildAnalyzePerformanceVerdict,
  buildAnalyzeJourneyVerdict,
  buildAnalyzeBenchmarkVerdict,
  buildUnavailableVerdict,
  statusForRank,
  statusForRetention,
  statusForBenchmarkPosition,
  spectrumPosition,
}
