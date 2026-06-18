// Chat business logic. Takes a user message, pulls the workspace's latest
// canonical metrics, injects them as context, asks Gemini, records an
// audit log (best-effort), returns the text.

const { generateOnce } = require('./gemini.service')
const aiUsage = require('./ai-usage.service')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const canonicalMetrics = require('../metrics/canonical-metrics.service')
const filesService = require('../files/files.service')
const chatTools = require('./chat-tools')

// Thrown when the workspace has hit its monthly AI token budget. The route
// catches this and maps it to a 402 Payment Required for the client.
class AiBudgetExceededError extends Error {
  constructor({ used, limit }) {
    super('AI monthly token budget exceeded')
    this.code = 'AI_BUDGET_EXCEEDED'
    this.used = used
    this.limit = limit
  }
}

const SYSTEM_PROMPT_FR = `Tu es SmartAnalyst, un analyste marketing IA pour PME et agences.
Tu réponds en français, de manière structurée et concise.
Format de réponse :
- Une phrase de TL;DR au début
- 2-3 points clés en bullets si pertinent
- Suggestion d'action concrète à la fin si la question le permet

CITATIONS — TRÈS IMPORTANT :
Chaque ligne de la section "Métriques du workspace" est préfixée par un marqueur [N] (ex: [1], [2], [3]).
Quand tu cites un chiffre issu de ces métriques, AJOUTE le marqueur [N] correspondant juste après le chiffre, sans crochet d'ouverture supplémentaire.
Exemple : "Ton MRR atteint 12 500 € [1], en hausse de 8% vs le mois précédent."
Ne fabrique JAMAIS un marqueur qui ne correspond pas à une métrique de la liste.

Si la question demande des chiffres spécifiques (CTR, MRR, CAC…) et que tu n'as pas accès aux données du user, dis-le clairement et propose-lui de connecter les sources concernées (GA4, Meta Ads, Google Ads, Stripe, Search Console).

Reste honnête : si tu n'as pas l'info, dis-le. Ne fabrique pas de chiffres.`

const SYSTEM_PROMPT_EN = `You are SmartAnalyst, an AI marketing analyst for SMBs and agencies.
You answer in English, in a structured and concise manner.
Response format:
- One-sentence TL;DR at the top
- 2-3 key bullets if relevant
- A concrete next-action suggestion at the end if the question allows for one

CITATIONS — VERY IMPORTANT:
Each line of the "User's workspace metrics" section is prefixed with a marker [N] (e.g. [1], [2], [3]).
When you cite a number from these metrics, APPEND the corresponding [N] marker right after the number.
Example: "Your MRR is at €12,500 [1], up 8% from last month."
Never fabricate a marker that doesn't correspond to a metric in the list.

If the question asks for specific numbers (CTR, MRR, CAC…) and you don't have access to the user's data, say so clearly and suggest they connect the relevant sources (GA4, Meta Ads, Google Ads, Stripe, Search Console).

Be honest: if you don't know, say so. Don't make up numbers.`

function pickSystemPrompt(locale) {
  return locale === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_FR
}

// Map of canonical metric_key → { fr, en, unit }. Unknown keys fall back to
// the raw key with no unit so the model still sees the value.
const METRIC_LABELS = {
  revenue_recurring_monthly: { fr: 'MRR', en: 'MRR', unit: 'eur' },
  revenue_annual_recurring: { fr: 'ARR', en: 'ARR', unit: 'eur' },
  customers_active: { fr: 'Clients actifs', en: 'Active customers', unit: 'count' },
  customers_new: { fr: 'Nouveaux clients', en: 'New customers', unit: 'count' },
  failed_payments_month: { fr: 'Paiements échoués', en: 'Failed payments', unit: 'count' },
  churn_rate_subscription: { fr: 'Taux de churn', en: 'Churn rate', unit: 'ratio' },
  lifetime_value_customer: { fr: 'LTV moyenne', en: 'Average LTV', unit: 'eur' },
  sessions_all: { fr: 'Sessions', en: 'Sessions', unit: 'count' },
  users_active: { fr: 'Utilisateurs actifs', en: 'Active users', unit: 'count' },
  users_new: { fr: 'Nouveaux utilisateurs', en: 'New users', unit: 'count' },
  conversions_total: { fr: 'Conversions', en: 'Conversions', unit: 'count' },
  bounce_rate_all: { fr: 'Taux de rebond', en: 'Bounce rate', unit: 'ratio' },
  spend_paid_social: { fr: 'Dépense paid social', en: 'Paid social spend', unit: 'eur' },
  spend_paid_search: { fr: 'Dépense paid search', en: 'Paid search spend', unit: 'eur' },
  clicks_paid_social: { fr: 'Clics paid social', en: 'Paid social clicks', unit: 'count' },
  clicks_paid_search: { fr: 'Clics paid search', en: 'Paid search clicks', unit: 'count' },
  return_on_investment_paid: { fr: 'ROAS paid social', en: 'Paid social ROAS', unit: 'ratio' },
  click_through_rate_paid: { fr: 'CTR paid search', en: 'Paid search CTR', unit: 'ratio' },
}

const SNAPSHOT_METRICS = new Set([
  'revenue_recurring_monthly',
  'revenue_annual_recurring',
  'customers_active',
  'lifetime_value_customer',
  'churn_rate_subscription',
  'bounce_rate_all',
  'click_through_rate_paid',
  'return_on_investment_paid',
])

function formatValue(value, unit, locale) {
  if (!Number.isFinite(value)) return String(value)
  if (unit === 'eur') {
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value)
  }
  if (unit === 'ratio') {
    const pct = value <= 1 ? value * 100 : value
    return `${pct.toFixed(1)}%`
  }
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Reduce per-day rows to one line per metric: snapshot metrics use the most
 * recent value, flow metrics (sessions, spend…) get summed over the window.
 *
 * Retourne aussi un tableau `sources[]` parallèle aux lignes : index N-1 dans
 * sources correspond au marqueur [N] dans la ligne. Ces sources sont renvoyées
 * au frontend pour afficher les citations cliquables sous la réponse.
 */
function summarize(rows, locale) {
  const byKey = new Map()
  for (const r of rows) {
    if (!byKey.has(r.metric_key)) byKey.set(r.metric_key, [])
    byKey.get(r.metric_key).push(r)
  }

  const lines = []
  const sources = []
  let citationId = 0
  for (const [key, entries] of byKey) {
    entries.sort((a, b) => (a.date < b.date ? 1 : -1)) // desc
    const label = METRIC_LABELS[key] ?? { fr: key, en: key, unit: 'count' }
    const localized = locale === 'en' ? label.en : label.fr
    const providerSources = Array.from(new Set(entries.map((e) => e.source)))
    const sourcesStr = providerSources.join(', ')

    let value
    let suffix
    let kind
    let dateRef
    if (SNAPSHOT_METRICS.has(key)) {
      kind = 'snapshot'
      value = Number(entries[0].metric_value)
      dateRef = entries[0].date
      suffix =
        locale === 'en'
          ? `(snapshot ${dateRef}, ${sourcesStr})`
          : `(snapshot ${dateRef}, ${sourcesStr})`
    } else {
      kind = 'sum'
      value = entries.reduce((s, e) => s + Number(e.metric_value), 0)
      dateRef = `${entries[entries.length - 1].date}→${entries[0].date}`
      const span = entries.length === 1 ? '1d' : `${entries.length}d`
      suffix =
        locale === 'en'
          ? `(sum last ${span}, ${sourcesStr})`
          : `(somme ${span} glissants, ${sourcesStr})`
    }

    citationId++
    const formattedValue = formatValue(value, label.unit, locale)
    lines.push(`[${citationId}] ${localized}: ${formattedValue} ${suffix}`)
    sources.push({
      id: citationId,
      metricKey: key,
      label: localized,
      providers: providerSources,
      value,
      formattedValue,
      unit: label.unit,
      kind,
      dateRef,
      rowCount: entries.length,
    })
  }
  return { lines, sources }
}

/**
 * Build a "here is the user's data" block for the prompt. Returns null when
 * the workspace has no metrics yet — the caller then leaves the prompt clean
 * and the model defers to its existing "connect a source" guidance.
 *
 * Retourne { contextStr, sources } : sources est la liste structurée des
 * métriques utilisées (mêmes IDs [N] que dans contextStr), passée au
 * frontend pour render les citations cliquables.
 */
async function buildMetricsContext(workspaceId, locale) {
  if (!workspaceId) return null
  const today = new Date()
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fmt = (d) => d.toISOString().slice(0, 10)

  let rows = []
  try {
    rows = await canonicalMetrics.query({
      workspaceId,
      startDate: fmt(monthAgo),
      endDate: fmt(today),
      limit: 500,
    })
  } catch (err) {
    logger.warn(
      { event: 'chat_metrics_context_failed', workspaceId, error: err.message },
      'Could not load metrics context for chat',
    )
    return null
  }

  if (rows.length === 0) return null

  const { lines, sources } = summarize(rows, locale)
  const header =
    locale === 'en'
      ? `User's workspace metrics (last 30 days). Base your answer on these numbers when relevant. Each line is prefixed with a citation marker [N] — when you cite a number, append the matching [N] right after it.`
      : `Métriques du workspace de l'utilisateur (30 derniers jours). Quand pertinent, base ta réponse sur ces chiffres. Chaque ligne est préfixée par un marqueur de citation [N] — quand tu cites un chiffre, ajoute le [N] correspondant juste après.`
  const footer =
    locale === 'en'
      ? `If the question mentions a metric not listed above, say it isn't connected yet and suggest which source to connect.`
      : `Si la question porte sur une métrique non listée ci-dessus, dis qu'elle n'est pas encore connectée et suggère la source à brancher.`

  return {
    contextStr: `${header}\n${lines.join('\n')}\n${footer}`,
    sources,
  }
}

/**
 * Ask SmartAnalyst a question.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.workspaceId
 * @param {string} params.message
 * @param {string} [params.locale='fr']
 * @returns {Promise<{ answer: string, model: string }>}
 */
async function ask({ userId, workspaceId, message, locale = 'fr', fileIds = [] }) {
  // Hard-stop budget : si le workspace a déjà dépassé son quota mensuel de
  // tokens IA, on refuse l'appel avant même de toucher Gemini. Le bloc usage
  // côté Settings reflète déjà la conso ; le client doit gérer l'erreur.
  // checkBudget est fail-open (laisse passer en cas d'erreur Supabase) pour
  // ne pas bloquer le chat si la base de tracking est down.
  const budget = await aiUsage.checkBudget(workspaceId)
  if (!budget.allowed) {
    throw new AiBudgetExceededError({ used: budget.used, limit: budget.limit })
  }

  const basePrompt = pickSystemPrompt(locale)

  // Multimodal (brief V2 §3.2) : résout les fichiers de la librairie référencés
  // en pièces jointes inline pour Gemini. Best-effort : un fichier illisible
  // est ignoré, pas bloquant.
  const attachments = []
  if (Array.isArray(fileIds) && fileIds.length > 0 && workspaceId) {
    for (const fileId of fileIds.slice(0, 4)) {
      try {
        const content = await filesService.getFileContent(workspaceId, fileId)
        attachments.push({ mimeType: content.mimeType, data: content.base64 })
      } catch (err) {
        logger.warn(
          { event: 'chat_attachment_load_failed', workspaceId, fileId, error: err.message },
          'Could not load chat attachment',
        )
      }
    }
  }

  const metricsContext = await buildMetricsContext(workspaceId, locale)
  let systemPrompt = metricsContext ? `${basePrompt}\n\n${metricsContext.contextStr}` : basePrompt

  // Multimodal (brief V2 §3.2) : si des pièces jointes accompagnent le message,
  // on indique au modèle qu'il doit aussi les analyser.
  if (attachments.length > 0) {
    systemPrompt +=
      locale === 'en'
        ? `\n\nThe user attached ${attachments.length} file(s). Analyse them alongside the connected data. Cite the file (e.g. "Source: your file") when you use it.`
        : `\n\nL'utilisateur a joint ${attachments.length} fichier(s). Analyse-les en plus des données connectées. Cite le fichier (ex : « Source : ton fichier ») quand tu t'en sers.`
  }

  const t0 = Date.now()
  // Function-calling loop (brief V2 §3.5). On envoie les tool declarations
  // au model ; tant qu'il demande à appeler un tool, on exécute et on
  // re-soumet l'historique enrichi du functionResponse. Max 3 tours pour
  // éviter les loops infinies (en pratique 1-2 suffisent).
  const initialParts = [{ text: message }]
  for (const att of attachments) {
    if (att && att.data && att.mimeType) {
      initialParts.push({ inlineData: { mimeType: att.mimeType, data: att.data } })
    }
  }
  const history = [{ role: 'user', parts: initialParts }]

  const MAX_TOOL_ROUNDS = 3
  const toolsUsed = []
  let finalText = ''
  let modelName = ''
  for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
    const out = await generateOnce({
      systemPrompt,
      contents: history,
      tools: chatTools.DECLARATIONS,
      temperature: 0.4,
    })
    modelName = out.modelName

    // Tracking d'usage IA : chaque tour de la boucle function-calling compte.
    // Fire-and-forget (recordUsage est best-effort, ne throw jamais).
    void aiUsage.recordUsage({
      workspaceId,
      userId,
      model: out.usage?.model || out.modelName,
      requestType: 'chat',
      inputTokens: out.usage?.inputTokens || 0,
      outputTokens: out.usage?.outputTokens || 0,
      durationMs: out.usage?.durationMs,
    })

    if (out.functionCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
      finalText = out.text
      break
    }

    // On enregistre la sortie model (parts contenant functionCall) dans l'historique
    // pour que le model ait le contexte du tour précédent.
    history.push({ role: 'model', parts: out.candidate.content.parts })

    // Exécute chaque tool en parallèle (best-effort).
    const responses = await Promise.all(
      out.functionCalls.map(async (call) => {
        const res = await chatTools.execute(
          { name: call.name, args: call.args || {} },
          { workspaceId },
        )
        toolsUsed.push(call.name)
        return { functionResponse: { name: call.name, response: { result: res } } }
      }),
    )
    history.push({ role: 'user', parts: responses })
  }

  const text = finalText
  const durationMs = Date.now() - t0

  // Filtre les sources réellement citées dans la réponse — pas la peine
  // d'afficher en pied de message les 30 métriques du contexte si le modèle
  // n'en a référencé que 2. Pattern [N] strict (lettre/chiffre derrière le
  // crochet exclu pour éviter de matcher des [N] dans du code).
  const fullSources = metricsContext?.sources || []
  const citedIds = new Set()
  if (typeof text === 'string') {
    const re = /\[(\d+)\](?!\w)/g
    let m
    while ((m = re.exec(text)) !== null) {
      citedIds.add(Number(m[1]))
    }
  }
  const usedSources = fullSources.filter((s) => citedIds.has(s.id))

  logger.info(
    {
      event: 'chat_answered',
      userId,
      workspaceId,
      model: modelName,
      durationMs,
      msgLen: message.length,
      hasMetricsContext: Boolean(metricsContext),
      sourcesAvailable: fullSources.length,
      sourcesCited: usedSources.length,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    },
    'Chat answered',
  )

  // Best-effort audit log. We never block the response on the audit write.
  const service = getServiceRoleClient()
  service
    .from('audit_logs')
    .insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      action: 'chat_ask',
      changes: { message_length: message.length, model: modelName, duration_ms: durationMs },
    })
    .then(({ error }) => {
      if (error) logger.warn({ event: 'chat_audit_failed', error: error.message })
    })

  return { answer: text, model: modelName, sources: usedSources }
}

module.exports = { ask, AiBudgetExceededError }
