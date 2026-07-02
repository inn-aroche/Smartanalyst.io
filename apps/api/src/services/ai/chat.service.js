// Chat business logic. Takes a user message, pulls the workspace's latest
// canonical metrics, injects them as context, asks Gemini, records an
// audit log (best-effort), returns the text.

const { generateOnce, generateStream } = require('./gemini.service')
const claudeService = require('./claude.service')
const entitlements = require('../billing/entitlements.service')
const aiUsage = require('./ai-usage.service')
const chatHighlights = require('./chat-highlights.service')
const chatConversations = require('./chat-conversations.service')
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

// Mapping vers une erreur cliente compréhensible (429 / 504 / 502) selon ce
// que renvoie l'API Gemini. Le client distingue ainsi "réessaie dans Xs"
// d'un vrai bug. Conserve le `code` pour que le frontend pioche le bon i18n.
class ChatProviderError extends Error {
  constructor(code, message, { statusCode = 502, retryAfterSec } = {}) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.retryAfterSec = retryAfterSec
  }
}

function classifyGeminiError(err) {
  if (!err || err.code === 'AI_BUDGET_EXCEEDED') return err
  // Le SDK Google emballe parfois le status HTTP dans `.status` ou dans le
  // message ("[429 Too Many Requests]"). On essaie les deux.
  const status = err.status || err.statusCode
  const msg = String(err.message || '')
  if (status === 429 || /\b429\b|rate.?limit|quota/i.test(msg)) {
    // Best-effort : si Google a renvoyé un retryDelay (en secondes), on le
    // remonte au client pour qu'il affiche "réessaie dans Xs".
    const retryMatch = msg.match(/retry.{0,20}?(\d+)/i)
    return new ChatProviderError('AI_RATE_LIMIT', 'AI rate limit hit', {
      statusCode: 429,
      retryAfterSec: retryMatch ? Number(retryMatch[1]) : 30,
    })
  }
  if (status === 504 || /timeout|deadline.exceeded/i.test(msg)) {
    return new ChatProviderError('AI_TIMEOUT', 'AI provider timed out', { statusCode: 504 })
  }
  if (status === 503 || status === 502 || /unavailable|overloaded/i.test(msg)) {
    return new ChatProviderError('AI_PROVIDER_DOWN', 'AI provider unavailable', { statusCode: 503 })
  }
  return err
}

const SYSTEM_PROMPT_FR = `Tu es SmartAnalyst, un analyste marketing IA pour PME et agences.
Tu réponds en français comme un vrai analyste : tu ne te contentes JAMAIS de
restituer un chiffre, tu l'interprètes et tu proposes une action.

FORMAT DE RÉPONSE OBLIGATOIRE — 3 sections, dans l'ordre, séparées par une ligne vide :

**Constat** (1-2 phrases)
Le chiffre brut + ce qui saute aux yeux dans la métrique. Cite tes sources avec [N]
quand pertinent.

**Hypothèse** (2-3 phrases)
TON interprétation : pourquoi c'est comme ça à ton avis. Croise plusieurs métriques
si tu peux. Si tu n'as pas assez de signal pour une vraie hypothèse, dis-le et liste
les questions à creuser pour pouvoir en formuler une.

**Action recommandée** (1-2 actions concrètes, bullet list)
Ce que l'user devrait faire maintenant. Concret, actionnable, priorisé. Pas de
"surveille ton CTR" abstrait — du "lance un A/B test sur la créa X cette semaine".

EXCEPTIONS — Si la question est conversationnelle pure ("salut", "ok merci",
"explique-moi ce qu'est le ROAS"), tu réponds normalement sans imposer le format
3 sections.

CROCHETS D'ACTION — Tu as accès à des tools qui te permettent de CRÉER des
choses directement (action_card / watch). Utilise-les quand c'est pertinent :
- "ajoute une tâche pour…", "rappelle-moi de…" → create_action_card
- "préviens-moi si…", "alerte-moi quand…" → create_watch
Sinon, propose simplement l'action en texte et laisse l'user décider.

GRANULARITÉ TEMPORELLE — Le bloc "Métriques du workspace" ci-dessous contient
des agrégats 30 jours, pas la série journalière. Si l'user demande une vue par
jour/semaine ("évolution depuis X jours", "jour par jour", "détail quotidien",
"par semaine"), APPELLE le tool get_metric_series avec la metric_key et le bon
nombre de days — NE réponds JAMAIS que tu n'as pas accès à la granularité, tu
l'as via ce tool.

OUTPUTS GENERATIFS (cahier 22b §3.3) — Tu disposes aussi de :
- compute_table_from_metrics : utilise-le quand l'user demande de COMPARER
  N items entre eux ("compare mes canaux", "top 5 campagnes", "CA par
  source"). Le frontend rendra une vraie table compacte sous ta réponse —
  inutile d'en remettre une en texte/bullets, contente-toi du commentaire.
- compare_metrics : utilise-le pour "compare GA4 vs Meta", "sessions
  organic vs paid" — pour rendre 2 mini-charts côte à côte sous ta réponse.
- compute_funnel : utilise-le pour les conversions multi-étapes
  ("funnel e-commerce", "sessions → ajout panier → commande"). 2-6
  étapes ordonnées du haut vers le bas du funnel.
- build_dashboard_preview : utilise-le pour les questions très larges
  ("santé globale", "vue d'ensemble", "tableau de bord rapide"). 4-6 KPI
  cards avec delta vs N-1, que l'user peut épingler sur son dashboard.
Préfère ces tools à des listes a puces de chiffres : c'est PLUS LISIBLE.

REPONSE ANALYSTE STRUCTUREE (cahier 22c) — Pour les questions de PERFORMANCE
qui demandent "qui gagne / qui perd" :
- "quel canal performe le mieux", "top campagnes", "meilleure source" → APPELLE
  analyze_performance avec pattern='campaigns'.
- "quelle créa marche", "meilleure publicité", "top ads" → pattern='creatives'.
- "meilleurs produits", "top SKU", "qui vend le plus" → pattern='products'.
metric_keys = la métrique principale en 1er (ex: 'revenue_ecommerce',
'conversions_total', 'spend_paid_social'), 1 à 3 max. Le frontend rendra
automatiquement le bloc "gagnant + tableau proportionnel + actions" — NE
DUPLIQUE PAS ce contenu dans ta prose, contente-toi d'1 phrase de contexte
en intro. Ce tool remplace le format 3-sections pour ces questions.

Pour les questions de PARCOURS / FUNNEL ("mon funnel e-commerce", "où je
perds mes users", "taux de conversion sessions → commande", "drop-off
panier") → APPELLE analyze_journey avec 2-6 étapes ordonnées du HAUT vers
le BAS du funnel. Le frontend rend un FunnelBar coloré qui marque la fuite
> 45% en rouge — NE répète PAS les % en texte, juste 1 phrase de contexte.
Préfère analyze_journey à compute_funnel pour les questions analyste : le
premier donne verdict + actions, le second n'est qu'une viz.

Pour les questions de BENCHMARK / POSITIONNEMENT ("mon ROAS est bon ?",
"comment je me situe vs le marché", "benchmark CPL e-commerce") → APPELLE
analyze_benchmark. Tu fournis p25/p50/p75 d'après ta connaissance du
secteur + cite la source (rapport, étude). direction='higher_better' pour
ROAS/CVR/AOV, 'lower_better' pour CPL/churn/CAC. RÈGLE STRICTE : si tu
n'as PAS de référence fiable pour ce secteur précis, NE FABRIQUE PAS de
chiffres — dis-le et propose à l'user de fournir sa propre cible. Le
frontend rend un Spectrum + sources sous ta réponse.

CITATIONS — Chaque ligne de la section "Métriques du workspace" est préfixée par
un marqueur [N] (ex: [1], [2]). Quand tu cites un chiffre issu de ces métriques,
AJOUTE le marqueur [N] correspondant juste après le chiffre, sans crochet d'ouverture
supplémentaire. Exemple : "Ton MRR atteint 12 500 € [1], en hausse de 8% vs le mois précédent."
Ne fabrique JAMAIS un marqueur qui ne correspond pas à une métrique de la liste.

REQUÊTES LIVE — Tu peux interroger directement les APIs des sources connectées
avec des métriques et dimensions ARBITRAIRES (pas limité aux 30 jours d'agrégats
ci-dessous). Utilise ces tools quand l'user pose une question DIMENSIONNELLE
qui nécessite un breakdown que les métriques pré-chargées ne couvrent pas :
- query_ga4 : "top pages", "trafic par source sur /pricing", "sessions par
  device", "landing pages qui convertissent", "nouveaux users par pays".
- query_meta_ads : "quelle campagne dépense le plus", "CPC par tranche d'âge",
  "FB vs Instagram", "top adsets".
- query_stripe : "derniers paiements échoués", "abonnements actifs", "derniers
  refunds", "factures impayées".
- query_shopify : "dernières commandes", "top produits", "clients les plus
  dépensiers", "commandes non fulfillées".
- query_search_console : "quels mots-clés amènent le plus de clics", "position
  moyenne sur tel mot-clé", "pages avec le plus d'impressions".
IMPORTANT : ces tools font un appel API réel (cache 5 min). Préfère les
métriques pré-chargées ci-dessous quand elles suffisent. Si la source n'est
pas connectée, le tool retournera une erreur — propose alors de la connecter.

Si la question demande des chiffres que tu n'as PAS (CTR / MRR / CAC absent du
contexte), dis-le clairement et propose quelle source connecter (GA4, Meta Ads,
Google Ads, Stripe, Search Console). NE FABRIQUE PAS DE CHIFFRES.

Markdown supporté côté UI : **gras** pour insister sur les titres de section et
les valeurs critiques ; * ou - en début de ligne pour les bullets. Reste sobre.`

const SYSTEM_PROMPT_EN = `You are SmartAnalyst, an AI marketing analyst for SMBs and agencies.
You answer in English as a real analyst would: you NEVER just restate a number,
you interpret it and propose an action.

REQUIRED RESPONSE FORMAT — 3 sections, in order, separated by blank lines:

**Finding** (1-2 sentences)
The raw number + what jumps out in the metric. Cite your sources with [N] when relevant.

**Hypothesis** (2-3 sentences)
YOUR interpretation: why it looks like this. Cross multiple metrics if you can.
If you don't have enough signal for a real hypothesis, say so and list the
questions worth digging into.

**Recommended action** (1-2 concrete actions, bullet list)
What the user should do now. Concrete, actionable, prioritized. No abstract
"watch your CTR" — give "run an A/B test on creative X this week".

EXCEPTIONS — If the question is purely conversational ("hi", "ok thanks",
"explain ROAS to me"), reply normally without imposing the 3-section format.

ACTION HOOKS — You have tools that let you directly CREATE things
(action_card / watch). Use them when relevant:
- "add a task to…", "remind me to…" → create_action_card
- "alert me if…", "let me know when…" → create_watch
Otherwise, just propose the action in text and let the user decide.

TIME GRANULARITY — The "User's workspace metrics" block below contains
30-day aggregates, not daily series. If the user asks for a per-day/week
view ("evolution over X days", "day by day", "daily breakdown", "weekly"),
CALL the get_metric_series tool with the metric_key and days — NEVER answer
that you don't have the granularity, you do via this tool.

GENERATIVE OUTPUTS (cahier 22b §3.3) — You also have:
- compute_table_from_metrics: use it when the user asks to COMPARE N items
  ("compare my channels", "top 5 campaigns", "revenue by source"). The
  frontend will render a real compact table under your answer — no need
  to repeat it as bullets, just provide commentary.
- compare_metrics: use it for "compare GA4 vs Meta", "organic vs paid
  sessions" — to render 2 mini-charts side-by-side under your answer.
- compute_funnel: use it for multi-step conversions ("e-commerce funnel",
  "sessions → add-to-cart → orders"). 2-6 steps ordered top-of-funnel down.
- build_dashboard_preview: use it for very broad questions ("overall
  health", "quick overview", "dashboard"). 4-6 KPI cards with delta
  vs previous period, that the user can pin to their dashboard.
Prefer these tools over bullet lists of numbers: it's MORE READABLE.

STRUCTURED ANALYST RESPONSE (cahier 22c) — For PERFORMANCE questions
that ask "who wins / who loses":
- "which channel performs best", "top campaigns", "best source" → CALL
  analyze_performance with pattern='campaigns'.
- "best creative", "top ads", "which ad works" → pattern='creatives'.
- "best products", "top SKUs", "what sells most" → pattern='products'.
metric_keys = the main metric first (e.g. 'revenue_ecommerce',
'conversions_total', 'spend_paid_social'), 1 to 3 max. The frontend will
render the "winner + proportional table + actions" block automatically — DO
NOT duplicate this content in your prose, just give 1 line of context as
intro. This tool replaces the 3-section format for these questions.

For JOURNEY / FUNNEL questions ("my e-commerce funnel", "where do I lose
users", "sessions → order conversion", "cart drop-off") → CALL
analyze_journey with 2-6 steps ordered TOP-of-funnel DOWN. The frontend
renders a colored FunnelBar that flags > 45% drop-offs in red — DO NOT
repeat the % in text, just 1 line of context. Prefer analyze_journey over
compute_funnel for analyst questions: the former returns verdict + actions,
the latter is only a viz.

For BENCHMARK / POSITIONING questions ("is my ROAS good?", "how do I rank
vs market", "e-commerce CPL benchmark") → CALL analyze_benchmark. You
provide p25/p50/p75 from your training knowledge of the sector + cite the
source (report, study). direction='higher_better' for ROAS/CVR/AOV,
'lower_better' for CPL/churn/CAC. STRICT RULE: if you DON'T have a
reliable reference for that specific sector, DO NOT make up numbers — say
so and ask the user for their own target. The frontend renders a Spectrum
+ sources block under your reply.

CITATIONS — Each line of the "User's workspace metrics" section is prefixed
with a marker [N] (e.g. [1], [2]). When you cite a number from these metrics,
APPEND the corresponding [N] marker right after the number.
Example: "Your MRR is at €12,500 [1], up 8% from last month."
Never fabricate a marker that doesn't correspond to a metric in the list.

LIVE QUERIES — You can query connected source APIs directly with ARBITRARY
metrics and dimensions (not limited to the 30-day aggregates below). Use
these tools when the user asks a DIMENSIONAL question needing a breakdown
that the pre-loaded metrics don't cover:
- query_ga4: "top pages", "traffic by source on /pricing", "sessions by
  device", "landing pages that convert", "new users by country".
- query_meta_ads: "which campaign spends most", "CPC by age group",
  "FB vs Instagram", "top adsets".
- query_stripe: "recent failed payments", "active subscriptions", "recent
  refunds", "unpaid invoices".
- query_shopify: "recent orders", "top products", "biggest spenders",
  "unfulfilled orders".
- query_search_console: "which keywords drive the most clicks", "average
  position on keyword X", "pages with most impressions".
IMPORTANT: these tools make a real API call (cached 5 min). Prefer the
pre-loaded metrics below when they're sufficient. If the source isn't
connected, the tool will return an error — suggest connecting it.

If the question asks for numbers you DON'T HAVE (CTR/MRR/CAC missing from
context), say so clearly and suggest which source to connect (GA4, Meta Ads,
Google Ads, Stripe, Search Console). NEVER MAKE UP NUMBERS.

Markdown supported by the UI: **bold** to emphasize section titles and critical
values; * or - at line start for bullets. Stay sober.`

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
async function ask({
  userId,
  workspaceId,
  message,
  locale = 'fr',
  fileIds = [],
  conversationId = null,
}) {
  // Hard-stop budget : si le workspace a déjà dépassé son quota mensuel de
  // tokens IA, on refuse l'appel avant même de toucher Gemini. Le bloc usage
  // côté Settings reflète déjà la conso ; le client doit gérer l'erreur.
  // checkBudget est fail-open (laisse passer en cas d'erreur Supabase) pour
  // ne pas bloquer le chat si la base de tracking est down.
  const budget = await aiUsage.checkBudget(workspaceId)
  if (!budget.allowed) {
    throw new AiBudgetExceededError({ used: budget.used, limit: budget.limit })
  }

  // ─── Conversation (mémoire) ──────────────────────────────────────────
  // Si un conversationId est fourni, on vérifie qu'il appartient bien au
  // workspace, puis on charge les MAX_CONTEXT_MESSAGES derniers messages
  // pour les passer en historique au LLM.
  // Si pas de conversationId, on en crée une nouvelle, titrée d'après ce
  // 1er message. Le client la garde pour les tours suivants.
  let conversation = null
  let priorMessages = []
  if (conversationId && workspaceId) {
    conversation = await chatConversations.getConversation(conversationId, workspaceId)
    if (conversation) {
      priorMessages = await chatConversations.loadRecentMessages(conversation.id)
    }
    // Si l'ID était invalide / pas owné, on retombe sur "nouvelle conv" sans
    // crash — c'est plus indulgent que de bloquer l'user pour un ID périmé.
  }
  if (!conversation && workspaceId) {
    conversation = await chatConversations.createConversation({
      workspaceId,
      userId,
      firstMessage: message,
    })
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

  // Empty workspace short-circuit : pas de canonical_metrics ET pas de fichier
  // joint = le modèle n'a aucune donnée user pour répondre, et hallucinerait
  // ou produirait une réponse fade. On renvoie un message dirigé "branche une
  // source" avec un highlight callout actionnable, sans cramer un appel LLM.
  // On persiste quand même le tour (user msg + réponse pré-canned) pour ne
  // pas créer un trou dans l'historique côté UI.
  if (!metricsContext && attachments.length === 0 && workspaceId) {
    const empty = emptyWorkspaceResponse(locale)
    if (conversation) {
      try {
        await chatConversations.appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: message,
        })
        await chatConversations.appendMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: empty.answer,
          sources: empty.sources,
          highlights: empty.highlights,
          model: 'short-circuit',
        })
      } catch (err) {
        logger.warn(
          { event: 'chat_persist_failed', conversationId: conversation.id, error: err.message },
          'Could not persist empty-workspace turn',
        )
      }
    }
    return { ...empty, conversationId: conversation?.id || null }
  }

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
  // L'historique passé au LLM : tours visibles persistés (user/assistant)
  // dans l'ordre chronologique, PUIS le nouveau message user. Les
  // function_calls intermédiaires ne sont pas dans priorMessages (on ne les
  // persiste pas) ; Gemini rappellera les bons tools selon la nouvelle
  // question. Cap déjà appliqué côté loadRecentMessages.
  const history = [
    ...chatConversations.toGeminiContents(priorMessages),
    { role: 'user', parts: initialParts },
  ]

  const MAX_TOOL_ROUNDS = 3
  const toolsUsed = []
  let finalText = ''
  let modelName = ''
  for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
    let out
    try {
      out = await generateOnce({
        systemPrompt,
        contents: history,
        tools: chatTools.DECLARATIONS,
        temperature: 0.4,
      })
    } catch (err) {
      // Map les erreurs Gemini (rate-limit / timeout / unavailable) en codes
      // exploitables par le frontend (i18n dédié + retryAfterSec optionnel).
      throw classifyGeminiError(err)
    }
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
          { workspaceId, userId },
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

  // 2e passe : extrait 0-3 highlights visuels (KPI cards / callouts) à partir
  // de la réponse prose. Best-effort, latence ~500ms-1s. Si KO, on continue
  // sans highlights — le chat texte reste pleinement utilisable.
  const highlights = await chatHighlights.extract({
    workspaceId,
    userId,
    question: message,
    answer: text,
    sources: usedSources,
    locale,
  })

  // Persistance du tour (user msg + réponse assistant) dans la conversation
  // pour que le tour suivant retrouve le contexte. Best-effort : un crash ici
  // ne doit pas casser la réponse — l'user voit son message + la réponse,
  // c'est juste l'historique qui ne se construit pas.
  if (conversation) {
    try {
      await chatConversations.appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: message,
      })
      await chatConversations.appendMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: text,
        sources: usedSources,
        highlights,
        model: modelName,
      })
    } catch (err) {
      logger.warn(
        { event: 'chat_persist_failed', conversationId: conversation.id, error: err.message },
        'Could not persist chat turn',
      )
    }
  }

  return {
    answer: text,
    model: modelName,
    sources: usedSources,
    highlights,
    conversationId: conversation?.id || null,
  }
}

/**
 * Réponse pré-canned quand un workspace n'a aucune donnée connectée.
 * Évite (a) un appel LLM inutile, (b) une réponse molle ou hallucinée du
 * modèle, (c) un user perdu qui ne sait pas par où commencer.
 */
function emptyWorkspaceResponse(locale) {
  if (locale === 'en') {
    return {
      answer:
        "I'd love to help — but right now I don't see any source connected yet, so I can't ground my answer in your real numbers. Pick the tool you check most (GA4, Meta Ads, Google Ads, Stripe…) and connect it. Once one sync completes (a few minutes), come back and ask me anything.",
      model: 'short-circuit',
      sources: [],
      highlights: [
        {
          type: 'callout',
          tone: 'info',
          icon: 'lightbulb',
          title: 'Connect a source first',
          summary: 'GA4, Meta Ads, Stripe… one click, OAuth in seconds, and I can start digging.',
          value: null,
          delta: null,
          deltaUp: null,
          metricKey: null,
          sourceIds: [],
          sparkline: null,
          cta: { href: '/connectors', label: 'Connect a source' },
        },
      ],
    }
  }
  return {
    answer:
      "Avec plaisir — mais là tout de suite je ne vois aucune source connectée, donc je ne peux pas baser ma réponse sur tes vrais chiffres. Choisis l'outil que tu regardes le plus (GA4, Meta Ads, Google Ads, Stripe…) et branche-le. Une fois la première sync passée (quelques minutes), reviens me poser ta question.",
    model: 'short-circuit',
    sources: [],
    highlights: [
      {
        type: 'callout',
        tone: 'info',
        icon: 'lightbulb',
        title: 'Branche une source pour commencer',
        summary:
          'GA4, Meta Ads, Stripe… un clic, OAuth en quelques secondes, et je peux te répondre.',
        value: null,
        delta: null,
        deltaUp: null,
        metricKey: null,
        sourceIds: [],
        sparkline: null,
        cta: { href: '/connectors', label: 'Brancher une source' },
      },
    ],
  }
}

/**
 * Streaming variant of ask(). Same business logic, but yields incremental
 * text deltas via `onEvent({ type, ... })` instead of returning the full
 * payload at the end. Cahier §3 Lot 1 — chat ressenti "moderne".
 *
 * Events emitted (en ordre) :
 *   - { type: 'meta', conversationId }
 *   - { type: 'delta', text } — répétés
 *   - { type: 'done', answer, model, sources, highlights, conversationId }
 *   - { type: 'error', code, message }
 *
 * Le client SSE rebascule sur ask() (non-streaming) si une erreur sévère
 * survient avant le 1er delta (ex. budget exceeded, provider down).
 */
async function askStream({
  userId,
  workspaceId,
  message,
  locale = 'fr',
  fileIds = [],
  conversationId = null,
  // Cahier ADR-04 : "Rapide" = Gemini Flash (défaut), "Approfondi" = Claude.
  // Si ANTHROPIC_API_KEY n'est pas configuré, on fallback transparent sur
  // Gemini pour ne pas casser l'UX — la promesse "Approfondi" est dégradée
  // mais le chat reste utilisable.
  mode = 'fast',
  // Cahier 22b §3.2 — chip "filtre sources" : array de connecteur keys
  // (ex: ['ga4', 'meta_ads']). Si fourni, on injecte une directive dans
  // le system prompt pour que le LLM scope ses tool calls a ces sources.
  sources = null,
  onEvent,
}) {
  const emit = (ev) => {
    try {
      if (typeof onEvent === 'function') onEvent(ev)
    } catch (err) {
      logger.warn({ event: 'chat_stream_emit_failed', error: err.message }, 'onEvent threw')
    }
  }

  const budget = await aiUsage.checkBudget(workspaceId)
  if (!budget.allowed) {
    throw new AiBudgetExceededError({ used: budget.used, limit: budget.limit })
  }

  let conversation = null
  let priorMessages = []
  if (conversationId && workspaceId) {
    conversation = await chatConversations.getConversation(conversationId, workspaceId)
    if (conversation) {
      priorMessages = await chatConversations.loadRecentMessages(conversation.id)
    }
  }
  if (!conversation && workspaceId) {
    conversation = await chatConversations.createConversation({
      workspaceId,
      userId,
      firstMessage: message,
    })
  }

  // On émet d'abord le conversationId pour que le frontend persiste l'ID
  // même avant d'avoir reçu le moindre delta texte (utile pour les reprises).
  emit({ type: 'meta', conversationId: conversation?.id || null })

  const basePrompt = pickSystemPrompt(locale)

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

  // Short-circuit "workspace vide" — on émet directement la réponse pré-canned
  // en un seul chunk pour garder la même UX qu'un stream complété.
  if (!metricsContext && attachments.length === 0 && workspaceId) {
    const empty = emptyWorkspaceResponse(locale)
    emit({ type: 'delta', text: empty.answer })
    if (conversation) {
      try {
        await chatConversations.appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: message,
        })
        await chatConversations.appendMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: empty.answer,
          sources: empty.sources,
          highlights: empty.highlights,
          model: 'short-circuit',
        })
      } catch (err) {
        logger.warn(
          { event: 'chat_persist_failed', conversationId: conversation.id, error: err.message },
          'Could not persist empty-workspace turn',
        )
      }
    }
    emit({
      type: 'done',
      answer: empty.answer,
      model: 'short-circuit',
      sources: empty.sources,
      highlights: empty.highlights,
      conversationId: conversation?.id || null,
    })
    return
  }

  let systemPrompt = metricsContext ? `${basePrompt}\n\n${metricsContext.contextStr}` : basePrompt
  if (attachments.length > 0) {
    systemPrompt +=
      locale === 'en'
        ? `\n\nThe user attached ${attachments.length} file(s). Analyse them alongside the connected data. Cite the file (e.g. "Source: your file") when you use it.`
        : `\n\nL'utilisateur a joint ${attachments.length} fichier(s). Analyse-les en plus des données connectées. Cite le fichier (ex : « Source : ton fichier ») quand tu t'en sers.`
  }
  // Cahier 22b §3.2 — chip "filtre sources" : si l'user a explicitement
  // restreint le scope (ex: que GA4), on en informe le LLM pour qu'il
  // limite ses tool calls et ses citations a ces sources.
  if (Array.isArray(sources) && sources.length > 0) {
    const list = sources.join(', ')
    systemPrompt +=
      locale === 'en'
        ? `\n\nIMPORTANT — The user explicitly filtered the active sources to: ${list}. Only query these sources in your tool calls and only cite these sources in your answer. Do not invent or include other sources.`
        : `\n\nIMPORTANT — L'utilisateur a explicitement restreint les sources actives à : ${list}. N'interroge que ces sources dans tes tool calls et ne cite que ces sources dans ta réponse. N'invente ni n'inclus d'autres sources.`
  }

  const t0 = Date.now()
  const initialParts = [{ text: message }]
  for (const att of attachments) {
    if (att && att.data && att.mimeType) {
      initialParts.push({ inlineData: { mimeType: att.mimeType, data: att.data } })
    }
  }
  const history = [
    ...chatConversations.toGeminiContents(priorMessages),
    { role: 'user', parts: initialParts },
  ]

  // Routing provider (cahier ADR-04) :
  //   - mode='deep' + ANTHROPIC_API_KEY + plan autorise deep_chat → Claude
  //   - sinon → Gemini Flash (fallback transparent, l'user n'a pas d'erreur)
  // Gating plan (cahier §3 Lot 3) : seul le plan Pro débloque le mode
  // Approfondi. Sur Free, on rebascule silencieusement sur Gemini — l'UI
  // côté front grise déjà le toggle Approfondi pour signaler la limite.
  let effectiveMode = mode
  let modeDowngraded = false
  if (mode === 'deep' && workspaceId) {
    const plan = await entitlements.getWorkspacePlan(workspaceId)
    if (!entitlements.canUseFeature(plan, 'deep_chat')) {
      effectiveMode = 'fast'
      modeDowngraded = true
      logger.info(
        { event: 'chat_mode_downgraded_by_plan', workspaceId, plan },
        'Deep mode requested but plan does not allow it — falling back to fast',
      )
    }
  }
  const useClaude = effectiveMode === 'deep' && Boolean(process.env.ANTHROPIC_API_KEY)
  // Mode approfondi = vraie enquête multi-étapes : jusqu'à 8 tours de tools
  // (croiser les sources, tester des hypothèses) vs 3 en rapide. Le coût est
  // borné par le budget tokens mensuel (checkBudget en amont).
  const MAX_TOOL_ROUNDS = effectiveMode === 'deep' ? 8 : 3

  // Directives d'enquête spécifiques au mode approfondi — le mode ne doit
  // pas être « le même prompt avec un autre modèle » mais une vraie
  // investigation d'analyste (croisement de sources, hypothèses testées).
  if (effectiveMode === 'deep') {
    systemPrompt +=
      locale === 'en'
        ? `\n\nDEEP ANALYSIS MODE — investigate like a senior analyst:
1. If the question requires multi-step investigation, FIRST call set_analysis_plan with 2-5 short concrete steps, then execute them.
2. Cross-check several sources (analytics × ads × payments) before concluding — a drop in one metric must be explained by evidence, not guessed.
3. Form hypotheses and test them with tools (live queries, series, funnels). Discard what the data contradicts.
4. Conclude with: what happened, why (verified numbers cited), and what to do next. If the data is insufficient, say exactly what's missing.`
        : `\n\nMODE APPROFONDI — enquête comme un analyste senior :
1. Si la question demande une investigation multi-étapes, appelle D'ABORD set_analysis_plan avec 2 à 5 étapes courtes et concrètes, puis exécute-les.
2. Croise plusieurs sources (analytics × ads × paiements) avant de conclure — une baisse doit être expliquée par des preuves, pas devinée.
3. Formule des hypothèses et teste-les avec les tools (requêtes live, séries, funnels). Écarte ce que les données contredisent.
4. Conclus avec : ce qui s'est passé, pourquoi (chiffres vérifiés cités), et quoi faire. Si les données sont insuffisantes, dis exactement ce qui manque.`
  }
  const toolsUsed = []
  // Capture des séries temporelles retournées par les tools (get_metric_series).
  // Auto-injectées en fin de tour comme highlights `chart` pour rendre une vraie
  // viz au lieu d'une bullet list dans la prose.
  const toolSeries = []
  // Lot V2.2 — capture des tables (compute_table_from_metrics) et compares
  // (compare_metrics) pour auto-injection en highlight `table` / `compare`.
  const toolTables = []
  const toolCompares = []
  // Lot V2.3 — funnels (compute_funnel) et dashboards (build_dashboard_preview).
  const toolFunnels = []
  const toolDashboards = []
  // Cahier 22c — réponses analystes structurées (analyze_performance).
  // Place toujours le verdict en TÊTE des highlights pour qu'il soit lu en premier.
  const toolVerdicts = []
  // C1 — plans d'action proposés (propose_action_plan). Rendus en bloc
  // interactif « Ajouter à mes tâches » côté UI.
  const toolActionPlans = []
  let finalText = ''
  let modelName = ''
  for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
    let out
    try {
      // Seul le DERNIER tour (sans plus de tool-call) est utile à streamer
      // pour l'user. Les tours intermédiaires (functionCall → toolResponse)
      // n'émettent typiquement aucun texte ; on les exécute en non-streaming
      // pour éviter une SSE qui ouvre/ferme à vide. Stratégie : on tente le
      // streaming sur chaque tour ; les chunks vides sont ignorés.
      const streamFn = useClaude ? claudeService.generateStream : generateStream
      out = await streamFn({
        systemPrompt,
        contents: history,
        tools: chatTools.DECLARATIONS,
        temperature: 0.4,
        onDelta: (delta) => emit({ type: 'delta', text: delta }),
      })
    } catch (err) {
      // Erreurs Anthropic non classifiées : on les laisse remonter au
      // catch externe qui mappera en CLAUDE_NOT_CONFIGURED ou générique.
      if (useClaude) throw err
      throw classifyGeminiError(err)
    }
    modelName = out.modelName

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

    history.push({ role: 'model', parts: out.candidate.content.parts })

    const responses = await Promise.all(
      out.functionCalls.map(async (call) => {
        // set_analysis_plan : pas un vrai tool data — on émet l'event SSE
        // `plan` (checklist visible côté UI pendant l'enquête) et on rend
        // la main au modèle immédiatement, sans badge tool.
        if (call.name === 'set_analysis_plan') {
          const steps = Array.isArray(call.args?.steps)
            ? call.args.steps.filter((s) => typeof s === 'string' && s.trim()).slice(0, 6)
            : []
          if (steps.length > 0) emit({ type: 'plan', steps })
          return { functionResponse: { name: call.name, response: { result: { ok: true } } } }
        }
        // Emit le badge "tool running" cote UI (cahier 22b §3.5 — feedback
        // temps reel pendant le streaming). status='running' au depart,
        // status='done' apres l'execution. Le client affiche un chip
        // "🔌 Lecture GA4…" qui disparait au 'done'.
        emit({ type: 'tool', name: call.name, status: 'running' })
        const res = await chatTools.execute(
          { name: call.name, args: call.args || {} },
          { workspaceId, userId },
        )
        emit({ type: 'tool', name: call.name, status: 'done' })
        toolsUsed.push(call.name)
        // Capture des séries temporelles pour auto-injection en highlight chart.
        // get_metric_series retourne { points: [{date,value},...] } — on garde
        // tel quel avec un peu de méta pour le rendu.
        if (
          call.name === 'get_metric_series' &&
          Array.isArray(res?.points) &&
          res.points.length >= 2
        ) {
          toolSeries.push({
            metricKey: res.metric_key || call.args?.metric_key || 'series',
            days: res.days || call.args?.days || res.points.length,
            sources: res.sources || [],
            points: res.points,
          })
        }
        // Auto-capture table (Lot V2.2). Pas de minimum sur rows : meme 1
        // ligne se rend en card lisible — c'est mieux qu'une liste a puces.
        if (
          call.name === 'compute_table_from_metrics' &&
          Array.isArray(res?.rows) &&
          res.rows.length > 0 &&
          Array.isArray(res?.columns)
        ) {
          toolTables.push({
            columns: res.columns,
            rows: res.rows,
            days: res.days || 30,
            truncated: !!res.truncated,
          })
        }
        // Auto-capture compare (Lot V2.2). Besoin des 2 series avec >= 2 points
        // chacune sinon le split-view est moche.
        if (
          call.name === 'compare_metrics' &&
          res?.left?.points?.length >= 2 &&
          res?.right?.points?.length >= 2
        ) {
          toolCompares.push({
            metricKey: res.metric_key || call.args?.metric_key || 'series',
            days: res.days || 30,
            left: res.left,
            right: res.right,
          })
        }
        // Auto-capture funnel (Lot V2.3). Au moins 2 etapes avec value > 0
        // sinon c'est une bar plate sans valeur visuelle.
        if (
          call.name === 'compute_funnel' &&
          Array.isArray(res?.steps) &&
          res.steps.length >= 2 &&
          res.steps.some((s) => s.value > 0)
        ) {
          toolFunnels.push({ days: res.days || 30, steps: res.steps })
        }
        // Auto-capture dashboard preview (Lot V2.3).
        if (
          call.name === 'build_dashboard_preview' &&
          Array.isArray(res?.cards) &&
          res.cards.length > 0
        ) {
          toolDashboards.push({ days: res.days || 30, cards: res.cards })
        }
        // Cahier 22c — auto-capture du VerdictSpec. Pas de minimum : meme
        // 'unavailable' est rendu comme un bloc explicite "ce qui manque".
        if (
          (call.name === 'analyze_performance' ||
            call.name === 'analyze_journey' ||
            call.name === 'analyze_benchmark') &&
          res &&
          res.pattern &&
          res.header
        ) {
          toolVerdicts.push(res)
        }
        // C1 — auto-capture des plans d'action proposés.
        if (
          call.name === 'propose_action_plan' &&
          res?.ok &&
          Array.isArray(res.steps) &&
          res.steps.length >= 2
        ) {
          toolActionPlans.push({ goal: res.goal, steps: res.steps })
        }
        return { functionResponse: { name: call.name, response: { result: res } } }
      }),
    )
    history.push({ role: 'user', parts: responses })
  }

  const text = finalText
  const durationMs = Date.now() - t0

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
      streamed: true,
      hasMetricsContext: Boolean(metricsContext),
      sourcesAvailable: fullSources.length,
      sourcesCited: usedSources.length,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    },
    'Chat answered (stream)',
  )

  const service = getServiceRoleClient()
  service
    .from('audit_logs')
    .insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      action: 'chat_ask',
      changes: {
        message_length: message.length,
        model: modelName,
        duration_ms: durationMs,
        streamed: true,
      },
    })
    .then(({ error }) => {
      if (error) logger.warn({ event: 'chat_audit_failed', error: error.message })
    })

  const extractedHighlights = await chatHighlights.extract({
    workspaceId,
    userId,
    question: message,
    answer: text,
    sources: usedSources,
    locale,
  })

  // Auto-injection des highlights à partir des résultats de tools.
  // Posés AVANT les highlights extraits par la 2e passe Gemini pour être
  // visuellement prioritaires (charts/tables/funnel = nouveaux outputs).
  const chartHighlights = toolSeries.map((s) => buildChartHighlight(s, locale))
  const tableHighlights = toolTables.map((t) => buildTableHighlight(t, locale))
  const compareHighlights = toolCompares.map((c) => buildCompareHighlight(c, locale))
  const funnelHighlights = toolFunnels.map((f) => buildFunnelHighlight(f, locale))
  const dashboardHighlights = toolDashboards.map((d) => buildDashboardHighlight(d, locale))
  // Cahier 22c — VerdictHighlights TOUJOURS en tête : c'est la réponse
  // analyste structurée, elle doit être vue avant les charts/tables.
  const verdictHighlights = toolVerdicts.map((spec) => buildVerdictHighlight(spec))
  // C1 — plans d'action juste après le verdict : c'est le crochet d'action
  // principal (l'user matérialise les étapes en tâches d'un clic).
  const actionPlanHighlights = toolActionPlans.map((p) => ({
    type: 'action_plan',
    title: p.goal,
    planSteps: p.steps,
  }))
  const highlights = [
    ...verdictHighlights,
    ...actionPlanHighlights,
    ...dashboardHighlights,
    ...funnelHighlights,
    ...compareHighlights,
    ...tableHighlights,
    ...chartHighlights,
    ...extractedHighlights,
  ]

  // Lot V2.2 — capture l'ID du message assistant persiste, pour l'exposer
  // dans le `done` SSE (le frontend en a besoin pour appeler /export.xlsx).
  let assistantMessageId = null
  if (conversation) {
    try {
      await chatConversations.appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: message,
      })
      const persisted = await chatConversations.appendMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: text,
        sources: usedSources,
        highlights,
        model: modelName,
      })
      assistantMessageId = persisted?.id || null
    } catch (err) {
      logger.warn(
        { event: 'chat_persist_failed', conversationId: conversation.id, error: err.message },
        'Could not persist chat turn',
      )
    }
  }

  emit({
    type: 'done',
    answer: text,
    model: modelName,
    sources: usedSources,
    highlights,
    conversationId: conversation?.id || null,
    messageId: assistantMessageId,
    modeDowngraded: modeDowngraded || undefined,
  })
}

/**
 * Construit un highlight `chart` à partir d'une série temporelle retournée
 * par un tool (get_metric_series). Titre humanisé via METRIC_LABELS quand
 * dispo, sinon fallback metric_key brut.
 */
function buildChartHighlight(series, locale) {
  const label = METRIC_LABELS[series.metricKey]
  const title = label
    ? `${locale === 'en' ? label.en : label.fr} — ${series.days}j`
    : `${series.metricKey} — ${series.days}j`
  const summary = series.sources?.length
    ? `${locale === 'en' ? 'source' : 'source'} : ${series.sources.join(', ')}`
    : null
  return {
    type: 'chart',
    title,
    summary,
    series: series.points,
    chartKind: 'bar',
    metricKey: series.metricKey,
    unit: label?.unit || null,
    tone: 'info',
  }
}

/**
 * Lot V2.2 — bloc `table` (cahier 22b §3.3). Renderise une table compacte
 * (max 10 lignes triees) sous une reponse assistant.
 */
function buildTableHighlight(table, locale) {
  const mainMetric = table.columns[1] // 1ere metric (apres 'source')
  const label = METRIC_LABELS[mainMetric]
  const title = label
    ? `${locale === 'en' ? label.en : label.fr} — ${table.days}j`
    : `${locale === 'en' ? 'Breakdown' : 'Comparatif'} — ${table.days}j`
  return {
    type: 'table',
    title,
    summary: null,
    tone: 'info',
    columns: table.columns,
    rows: table.rows,
    truncated: !!table.truncated,
  }
}

/**
 * Lot V2.2 — bloc `compare` (cahier 22b §3.3). Split-view 2 mini-charts
 * cote a cote pour comparer 2 sources sur la meme metric.
 */
function buildCompareHighlight(cmp, locale) {
  const label = METRIC_LABELS[cmp.metricKey]
  const title = label
    ? `${locale === 'en' ? label.en : label.fr} — ${cmp.days}j`
    : `${locale === 'en' ? 'Comparison' : 'Comparaison'} — ${cmp.days}j`
  return {
    type: 'compare',
    title,
    summary: `${cmp.left.source} vs ${cmp.right.source}`,
    tone: 'info',
    metricKey: cmp.metricKey,
    unit: label?.unit || null,
    left: { source: cmp.left.source, total: cmp.left.total, series: cmp.left.points },
    right: { source: cmp.right.source, total: cmp.right.total, series: cmp.right.points },
  }
}

/**
 * Lot V2.3 — bloc `funnel` (cahier 22b §3.3). Barres decroissantes avec %
 * retention entre etapes. L'humanisation des labels (metric_key →
 * "Chiffre d'affaires") est faite cote frontend pour eviter de fixer ici
 * une convention de naming.
 */
function buildFunnelHighlight(f, locale) {
  return {
    type: 'funnel',
    title: locale === 'en' ? `Funnel — ${f.days}d` : `Funnel — ${f.days}j`,
    summary: null,
    tone: 'info',
    steps: f.steps,
  }
}

/**
 * Lot V2.3 — bloc `dashboard` preview (cahier 22b §3.3). Grille 4-6 KPI
 * cards. Chaque card est epinglable au dashboard reel via l'action shelf.
 */
function buildDashboardHighlight(d, locale) {
  return {
    type: 'dashboard',
    title: locale === 'en' ? `Dashboard preview — ${d.days}d` : `Aperçu dashboard — ${d.days}j`,
    summary: null,
    tone: 'info',
    cards: d.cards,
  }
}

/**
 * Cahier 22c — bloc `verdict`. Le tool analyze_performance retourne déjà un
 * VerdictSpec complet (header / verdict / winner / rows / actions) ; le
 * highlight l'embarque tel quel sous `spec`. Le composant VerdictHighlight
 * côté frontend route vers le bon rendu selon `spec.pattern`.
 */
function buildVerdictHighlight(spec) {
  return {
    type: 'verdict',
    title: spec.header?.title || 'Analyse',
    summary: null,
    tone: 'info',
    spec,
  }
}

module.exports = { ask, askStream, AiBudgetExceededError, ChatProviderError, classifyGeminiError }
