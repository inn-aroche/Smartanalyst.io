// Validation NL d'une description de watch (brief V2 §3.3, étape 1 du
// WatchModal). L'user écrit "Préviens-moi quand mon ROAS descend sous 2"
// → on appelle Gemini structured pour extraire :
//   - metric_key canonique correspondant
//   - operator suggéré (drops_below / rises_above / changes_by_pct / any_change)
//   - threshold numérique extrait du texte si présent
//   - confidence (high / medium / low)
//   - explanation courte que l'on affiche à l'user
//
// Fallback : si Gemini n'est pas dispo, on renvoie `confidence='low'` avec
// `metric_key=null` — le frontend laisse l'user choisir manuellement à l'étape 2.

const { generateStructured } = require('../ai/gemini.service')
const { logger } = require('../../lib/logger')

// Liste curatée des metric_keys que l'IA peut suggérer.
// Synchro avec celle du WatchModal frontend.
const ALLOWED_METRICS = [
  'revenue_recurring_monthly',
  'revenue_ecommerce',
  'orders_count',
  'order_value_average',
  'sessions_all',
  'users_active',
  'conversions_total',
  'bounce_rate_all',
  'churn_rate_subscription',
  'spend_paid_social',
  'spend_paid_search',
  'return_on_investment_paid',
  'click_through_rate_paid',
  'clicks_organic_search',
]

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    metric_key: {
      type: 'STRING',
      enum: [...ALLOWED_METRICS, 'unknown'],
      description: 'Clé canonique de la métrique surveillée. "unknown" si ambigu.',
    },
    operator: {
      type: 'STRING',
      enum: ['drops_below', 'rises_above', 'changes_by_pct', 'any_change', 'unknown'],
    },
    threshold: {
      type: 'NUMBER',
      description:
        'Valeur numérique extraite si présente (ex: "sous 2" → 2). 0 si pas extractible.',
    },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    explanation: {
      type: 'STRING',
      description: "Phrase courte FR pour confirmer à l'user ce qu'on a compris.",
    },
  },
  required: ['metric_key', 'operator', 'confidence', 'explanation'],
}

const SYSTEM_PROMPT = `Tu es l'assistant SmartAnalyst. L'user décrit en français naturel une alerte qu'il veut créer pour surveiller une métrique marketing.

Ton job : extraire de cette description :
1. La metric_key canonique correspondante (une de la liste autorisée). Si ambigu : "unknown".
2. L'opérateur de comparaison :
   - drops_below     : valeur passe SOUS un seuil ("descend sous", "chute sous")
   - rises_above     : valeur passe AU-DESSUS d'un seuil ("dépasse", "monte au-dessus")
   - changes_by_pct  : variation jour-sur-jour ≥ |seuil|% ("chute de X%", "varie de X%")
   - any_change      : tout changement ("préviens-moi à chaque changement")
3. Le threshold numérique si extractible (ex: "sous 2" → 2 ; "chute de 15%" → 15). 0 sinon.
4. Confidence : high si tout est limpide, medium si une seule ambiguïté, low si métrique floue.
5. Explanation : courte phrase FR pour confirmer.

Mapping français → metric_key :
- MRR / revenu récurrent → revenue_recurring_monthly
- Chiffre d'affaires / CA / revenu → revenue_ecommerce
- Commandes / ventes → orders_count
- Panier moyen / AOV → order_value_average
- Sessions / trafic / visiteurs → sessions_all
- Utilisateurs actifs → users_active
- Conversions → conversions_total
- Rebond / bounce → bounce_rate_all
- Churn / désabonnement → churn_rate_subscription
- Budget Meta / dépense pub social → spend_paid_social
- Budget Google / dépense Google Ads → spend_paid_search
- ROAS / retour sur investissement pub → return_on_investment_paid
- CTR pub → click_through_rate_paid
- Clics organiques / SEO → clicks_organic_search

Si la description ne matche aucune métrique évidente → metric_key="unknown" + confidence="low" + explanation pédagogique.`

/**
 * Valide une description NL d'alerte.
 *
 * @param {string} description — La saisie utilisateur, 3-280 chars.
 * @returns {Promise<{ metric_key, operator, threshold, confidence, explanation }>}
 */
async function validateIntent(description) {
  const desc = String(description || '').trim()
  if (desc.length < 3) {
    return {
      metric_key: null,
      operator: null,
      threshold: null,
      confidence: 'low',
      explanation: 'Décris en quelques mots ce que tu veux surveiller.',
    }
  }

  try {
    const { json } = await generateStructured({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: desc,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 400,
    })
    // Normalise les "unknown" en null pour le frontend.
    const metric_key = json.metric_key === 'unknown' ? null : json.metric_key
    const operator = json.operator === 'unknown' ? null : json.operator
    const threshold = Number.isFinite(json.threshold) && json.threshold > 0 ? json.threshold : null
    return {
      metric_key,
      operator,
      threshold,
      confidence: json.confidence || 'low',
      explanation: json.explanation || '',
    }
  } catch (err) {
    logger.warn(
      { event: 'watch_validate_failed', error: err.message },
      'Watch NL validation failed — falling back to manual',
    )
    // Fallback : retour neutre, le frontend laisse l'user choisir au step 2.
    return {
      metric_key: null,
      operator: null,
      threshold: null,
      confidence: 'low',
      explanation:
        "Je n'ai pas pu interpréter automatiquement. Tu pourras choisir la métrique à l'étape suivante.",
    }
  }
}

module.exports = { validateIntent, ALLOWED_METRICS }
