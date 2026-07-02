// chat-highlights.service — 2e passe Gemini "structurée" qui extrait des
// éléments visuels (KPI cards, callouts) à partir d'une réponse prose.
//
// Pourquoi en 2 passes : la 1ère passe (function-calling + prose avec
// citations [N]) reste la source de vérité. Cette 2e passe ne change RIEN à
// la réponse, elle ne fait qu'identifier les 0-3 nombres / signaux les plus
// importants à mettre en avant visuellement. Si elle échoue, le chat
// fonctionne quand même — best-effort.

const { generateStructured } = require('./gemini.service')
const canonicalMetrics = require('../metrics/canonical-metrics.service')
const aiUsage = require('./ai-usage.service')
const { logger } = require('../../lib/logger')

// Limites volontairement basses : si on en sort trop, l'écran est chargé.
const MAX_HIGHLIGHTS = 3

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    highlights: {
      type: 'ARRAY',
      maxItems: MAX_HIGHLIGHTS,
      items: {
        type: 'OBJECT',
        properties: {
          type: {
            type: 'STRING',
            // 'chart' n'est pas exposé au LLM (auto-injecté côté serveur quand
            // un tool retourne une série) — on garde le schema strict ici.
            enum: ['kpi', 'callout'],
            description:
              'kpi = grosse valeur + delta + sparkline. callout = encart coloré "à retenir".',
          },
          title: {
            type: 'STRING',
            description: 'Libellé court 1-5 mots (ex: "MRR", "Risque de churn").',
          },
          value: {
            type: 'STRING',
            description:
              'Valeur formatée pour les kpi uniquement (ex: "12 500 €", "2,4 %"). Vide pour les callouts.',
          },
          delta: {
            type: 'STRING',
            description:
              'Variation formatée pour les kpi (ex: "+8 %", "-1 250 €"). Vide si pas pertinent.',
          },
          deltaUp: {
            type: 'BOOLEAN',
            description:
              'true si la variation va dans le bon sens (revenu qui monte / churn qui baisse).',
          },
          tone: {
            type: 'STRING',
            enum: ['good', 'mid', 'bad', 'info'],
            description: 'Tonalité visuelle. good=vert, bad=rouge, mid=ambre, info=bleu.',
          },
          icon: {
            type: 'STRING',
            enum: ['trending_up', 'trending_down', 'warning', 'check', 'info', 'lightbulb'],
          },
          summary: {
            type: 'STRING',
            description: 'Phrase courte 1 ligne max, 80 caractères max idéalement.',
          },
          metricKey: {
            type: 'STRING',
            description:
              "Clé canonique de la métrique sous-jacente si le highlight repose sur une vraie source citée (ex: 'revenue_recurring_monthly'). Vide sinon.",
          },
          sourceIds: {
            type: 'ARRAY',
            items: { type: 'INTEGER' },
            description: 'Liste des [N] cités dans la prose qui appuient ce highlight.',
          },
        },
        required: ['type', 'title', 'tone'],
      },
    },
    followUps: {
      type: 'ARRAY',
      maxItems: 3,
      items: { type: 'STRING' },
      description:
        "2-3 questions de suivi courtes (< 70 caractères) que l'utilisateur voudra probablement poser ensuite, dans SA langue, directement liées aux données discutées.",
    },
  },
  required: ['highlights'],
}

function buildPrompt(locale) {
  if (locale === 'en') {
    return `You are a helper that turns a marketing analyst's written answer into 0-3 visual highlights for a chat UI. The user has already read the prose; the highlights MUST surface the most important numbers / signals only.

Rules:
- ALWAYS generate at least 1 highlight if the answer contains ANY number, recommendation, or actionable signal — the chat UI feels empty without them.
- Generate 0 highlights ONLY if the answer is purely conversational ("hi", "thanks", definitions).
- Aim for 2-3 highlights whenever possible: one KPI + one callout (risk/opportunity) is the sweet spot for visual punch.
- "kpi" type = THE single most striking number + its delta. Title = metric name (≤ 5 words). Value = exact figure as written in the prose. Delta = variation with sign and unit. deltaUp = true if it's the desired direction (revenue up, churn down).
- "callout" type = a 1-sentence takeaway: risk, opportunity, anomaly. tone=bad for risks/drops, good for wins, mid for warnings, info for neutral.
- icon: choose what fits ("warning" for risks, "check" for wins, "lightbulb" for opportunities, "trending_up/down" for trends, "info" for context).
- summary: ONE short sentence. No emojis. No newlines.
- metricKey: only if the underlying number maps to a known canonical metric_key from the sources. Empty otherwise.
- sourceIds: the [N] citation numbers from the prose that support this highlight, if any.
- Do NOT invent numbers. Only use numbers that appear verbatim in the prose.
- If the prose has no measurable fact, return an empty highlights array.
- followUps: 2-3 short follow-up questions (< 70 chars each, in English) the user is likely to ask next — natural continuations of THIS analysis (drill-down, comparison, action). Empty array if the answer was purely conversational.`
  }
  return `Tu es un assistant qui transforme la réponse écrite d'un analyste marketing en 0 à 3 highlights visuels pour une UI de chat. L'utilisateur a déjà lu la prose ; les highlights ne doivent faire ressortir QUE les chiffres / signaux les plus importants.

Règles :
- TOUJOURS générer au moins 1 highlight si la réponse contient un chiffre, une recommandation, ou un signal actionnable — l'UI chat paraît vide sans.
- Génère 0 highlight UNIQUEMENT si la réponse est purement conversationnelle ("salut", "merci", définitions).
- Vise 2-3 highlights quand possible : un KPI + un callout (risque/opportunité) = le sweet spot visuellement.
- Type "kpi" = LE chiffre le plus marquant + son delta. Title = nom de la métrique (≤ 5 mots). Value = chiffre exact écrit dans la prose. Delta = variation avec signe et unité. deltaUp = true si c'est le sens souhaité (revenu qui monte, churn qui descend).
- Type "callout" = un takeaway en 1 phrase : risque, opportunité, anomalie. tone=bad pour les risques/chutes, good pour les wins, mid pour les warnings, info pour le contexte neutre.
- icon : choisis ce qui colle ("warning" risques, "check" wins, "lightbulb" opportunités, "trending_up/down" tendances, "info" contexte).
- summary : UNE phrase courte. Pas d'emoji. Pas de retour à la ligne.
- metricKey : uniquement si le chiffre sous-jacent matche une metric_key canonique des sources. Vide sinon.
- sourceIds : les numéros [N] de la prose qui appuient ce highlight, si présents.
- N'invente PAS de chiffres. Utilise uniquement les chiffres qui apparaissent textuellement dans la prose.
- Si la prose n'a aucun fait mesurable, renvoie un tableau highlights vide.
- followUps : 2-3 questions de suivi courtes (< 70 caractères, en français) que l'utilisateur voudra probablement poser ensuite — des continuations naturelles de CETTE analyse (creuser, comparer, agir). Tableau vide si la réponse était purement conversationnelle.`
}

function buildUserMessage({ question, answer, sources, locale }) {
  const sourcesBlock = (sources || [])
    .map(
      (s) =>
        `[${s.id}] ${s.label} = ${s.formattedValue} (${s.kind === 'snapshot' ? 'snapshot' : 'sum'} ${s.dateRef}, sources: ${(s.providers || []).join(', ')}, key: ${s.metricKey})`,
    )
    .join('\n')
  if (locale === 'en') {
    return `User question: ${question}

Analyst's written answer:
${answer}

Cited sources (the [N] numbers in the prose map to these):
${sourcesBlock || '(none)'}`
  }
  return `Question utilisateur : ${question}

Réponse rédigée par l'analyste :
${answer}

Sources citées (les numéros [N] dans la prose pointent vers ces entrées) :
${sourcesBlock || '(aucune)'}`
}

/**
 * Récupère une mini-série (14 derniers jours, somme par jour) pour un
 * metric_key donné — utilisée par les highlights KPI qui veulent une
 * sparkline. Best-effort.
 *
 * @returns {Promise<number[]|null>}
 */
async function fetchSparkline(workspaceId, metricKey) {
  if (!workspaceId || !metricKey) return null
  try {
    const end = new Date()
    const start = new Date(end.getTime() - 14 * 86_400_000)
    const fmt = (d) => d.toISOString().slice(0, 10)
    const rows = await canonicalMetrics.query({
      workspaceId,
      metricKey,
      startDate: fmt(start),
      endDate: fmt(end),
      limit: 200,
    })
    if (!rows || rows.length < 2) return null
    const byDate = new Map()
    for (const r of rows) {
      byDate.set(r.date, (byDate.get(r.date) || 0) + Number(r.metric_value))
    }
    const series = Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v)
    return series.length >= 2 ? series : null
  } catch {
    return null
  }
}

/**
 * Extrait 0-3 highlights visuels à partir d'une réponse chat.
 * Best-effort : retourne un tableau vide en cas d'erreur. Ne throw jamais.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} [params.userId]
 * @param {string} params.question
 * @param {string} params.answer
 * @param {Array}  [params.sources]
 * @param {string} [params.locale='fr']
 * @returns {Promise<{ highlights: Array, followUps: string[] }>}
 */
async function extract({ workspaceId, userId, question, answer, sources = [], locale = 'fr' }) {
  const empty = { highlights: [], followUps: [] }
  if (!answer || answer.trim().length < 20) return empty

  try {
    const { json, modelName, usage } = await generateStructured({
      systemPrompt: buildPrompt(locale),
      userMessage: buildUserMessage({ question, answer, sources, locale }),
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 600,
    })

    // Tracking d'usage : ce 2e appel doit aussi compter dans le budget.
    void aiUsage.recordUsage({
      workspaceId,
      userId,
      model: usage?.model || modelName,
      requestType: 'chat_highlights',
      inputTokens: usage?.inputTokens || 0,
      outputTokens: usage?.outputTokens || 0,
      durationMs: usage?.durationMs,
    })

    // Questions de suivi (C1) — normalisées avant retour.
    const followUps = Array.isArray(json?.followUps)
      ? json.followUps
          .filter((q) => typeof q === 'string' && q.trim().length > 0)
          .map((q) => q.trim().slice(0, 120))
          .slice(0, 3)
      : []

    const list = Array.isArray(json?.highlights) ? json.highlights.slice(0, MAX_HIGHLIGHTS) : []
    if (list.length === 0) return { highlights: [], followUps }

    // Enrichit chaque highlight KPI avec une mini-sparkline si on a la metric_key.
    const enriched = await Promise.all(
      list.map(async (h) => {
        const normalized = {
          type: h.type === 'callout' ? 'callout' : 'kpi',
          title: String(h.title || '').slice(0, 80),
          tone: ['good', 'mid', 'bad', 'info'].includes(h.tone) ? h.tone : 'info',
          icon: typeof h.icon === 'string' ? h.icon : null,
          summary: h.summary ? String(h.summary).slice(0, 200) : null,
          value: h.value ? String(h.value).slice(0, 40) : null,
          delta: h.delta ? String(h.delta).slice(0, 30) : null,
          deltaUp: typeof h.deltaUp === 'boolean' ? h.deltaUp : null,
          sourceIds: Array.isArray(h.sourceIds)
            ? h.sourceIds.filter((x) => Number.isInteger(x))
            : [],
          metricKey: typeof h.metricKey === 'string' && h.metricKey.length > 0 ? h.metricKey : null,
          sparkline: null,
        }
        if (normalized.type === 'kpi' && normalized.metricKey) {
          normalized.sparkline = await fetchSparkline(workspaceId, normalized.metricKey)
        }
        return normalized
      }),
    )
    return { highlights: enriched, followUps }
  } catch (err) {
    logger.warn(
      { event: 'chat_highlights_failed', error: err.message },
      'Highlights extraction failed — falling back to text-only response',
    )
    return empty
  }
}

module.exports = { extract }
