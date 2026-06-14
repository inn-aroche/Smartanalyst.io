// Suggestions de questions adaptées aux sources connectées.
//
// Règle : on prend les sources actives, on tire 1 question par source, on
// complète avec des génériques si moins de 3. La liste affichée tourne
// déterministiquement par jour (hash de la date) pour ne pas saouler
// l'utilisateur avec toujours les 3 mêmes.

import type { StringKey } from './i18n'

type Suggestion = { en: string; fr: string }

const SOURCE_QUESTIONS: Record<string, Suggestion[]> = {
  stripe: [
    { en: 'What is my MRR right now?', fr: 'Quel est mon MRR aujourd’hui ?' },
    { en: 'How is my churn evolving?', fr: 'Comment évolue mon churn ?' },
    { en: 'How many new customers this month?', fr: 'Combien de nouveaux clients ce mois-ci ?' },
    { en: 'Why are payments failing?', fr: 'Pourquoi y a-t-il des paiements échoués ?' },
  ],
  ga4: [
    {
      en: 'What changed in my traffic this week?',
      fr: 'Qu’est-ce qui a changé sur mon trafic cette semaine ?',
    },
    { en: 'Which pages convert the best?', fr: 'Quelles pages convertissent le mieux ?' },
    { en: 'Where does my traffic come from?', fr: 'D’où vient mon trafic ?' },
    { en: 'Is my bounce rate healthy?', fr: 'Mon taux de rebond est-il sain ?' },
  ],
  meta_ads: [
    {
      en: 'How healthy are my Meta campaigns?',
      fr: 'Mes campagnes Meta sont-elles en bonne santé ?',
    },
    { en: 'Where is my Meta budget bleeding?', fr: 'Où fuit mon budget Meta ?' },
    {
      en: 'How do I detect Meta creative fatigue?',
      fr: 'Comment détecter une fatigue créative Meta ?',
    },
  ],
  google_ads: [
    {
      en: 'Which Google Ads keywords waste budget?',
      fr: 'Quels mots-clés Google Ads gaspillent mon budget ?',
    },
    { en: 'Is my Google Ads ROAS improving?', fr: 'Mon ROAS Google Ads s’améliore-t-il ?' },
  ],
  shopify: [
    { en: 'What’s my AOV trend?', fr: 'Quelle est la tendance de mon panier moyen ?' },
    { en: 'Which products drive my revenue?', fr: 'Quels produits portent mon revenu ?' },
  ],
  search_console: [
    {
      en: 'Which queries lost organic clicks?',
      fr: 'Quelles requêtes ont perdu en clics organiques ?',
    },
  ],
}

const GENERIC: Suggestion[] = [
  {
    en: 'What changed in my data this week?',
    fr: 'Qu’est-ce qui a changé dans mes données cette semaine ?',
  },
  { en: 'How do you compute a blended CAC?', fr: 'Comment on calcule un CAC blended ?' },
  {
    en: 'What is a healthy LTV/CAC ratio for a SaaS?',
    fr: 'Quel ratio LTV/CAC sain pour un SaaS ?',
  },
  { en: 'How do I detect creative fatigue?', fr: 'Comment détecter une fatigue créative ?' },
]

function todayHash(): number {
  const d = new Date()
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

/**
 * Construit jusqu'à 3 suggestions adaptées. Rotation déterministe quotidienne :
 * à mêmes sources, mêmes suggestions toute la journée, mais autres demain.
 *
 * @param insights insights actifs du workspace. Si fournis, on prépend 1-2
 *                 questions construites à partir de leurs titres ("Pourquoi
 *                 <fait chiffré> ?"). Plus pertinent qu'une question
 *                 générique sur la même source.
 */
export function pickSuggestions(
  activeSources: string[],
  locale: 'fr' | 'en',
  insights: Array<{ title: string }> = [],
): string[] {
  const seed = todayHash()
  const out: string[] = []
  const seen = new Set<string>()

  function push(txt: string) {
    if (!txt || seen.has(txt)) return
    seen.add(txt)
    out.push(txt)
  }

  function take(suggestions: Suggestion[], offset: number) {
    if (suggestions.length === 0) return
    const idx = (seed + offset) % suggestions.length
    const s = suggestions[idx]
    push(locale === 'fr' ? s.fr : s.en)
  }

  // Priorité 1 : questions tirées des insights actifs (max 2). Plus pertinent
  // que du générique car relié au contexte réel du user.
  for (const ins of insights.slice(0, 2)) {
    push(insightTitleToQuestion(ins.title, locale))
    if (out.length >= 2) break
  }

  // Priorité 2 : questions par source connectée.
  let i = 0
  for (const src of activeSources) {
    if (out.length >= 3) break
    const arr = SOURCE_QUESTIONS[src]
    if (arr) take(arr, i++)
  }
  // Priorité 3 : complète avec génériques.
  let g = 0
  while (out.length < 3 && g < GENERIC.length + 3) {
    take(GENERIC, g++)
  }
  return out.slice(0, 3)
}

/**
 * Transforme un titre d'insight (fait chiffré) en question naturelle.
 * Heuristique légère : on préfixe par "Pourquoi" en FR / "Why" en EN, en
 * tutoyant l'assistant ("mon" au lieu de "ton" puisque c'est l'user qui parle).
 *
 * Exemples :
 *   "Ton ROAS Meta a chuté de 28 %" → "Pourquoi mon ROAS Meta a chuté de 28 % ?"
 *   "Trafic en baisse sur le mobile" → "Pourquoi le trafic est en baisse sur le mobile ?"
 */
function insightTitleToQuestion(title: string, locale: 'fr' | 'en'): string {
  let t = title.trim()
  // Retire la ponctuation finale qu'on va remplacer par "?".
  t = t.replace(/[.!?]+$/, '')
  if (locale === 'fr') {
    // Normalise "Ton/Ta/Tes" → "mon/ma/mes" (l'user pose SA question).
    t = t
      .replace(/^Ton\b/i, 'mon')
      .replace(/^Ta\b/i, 'ma')
      .replace(/^Tes\b/i, 'mes')
    if (t[0]) t = t[0].toLowerCase() + t.slice(1)
    return `Pourquoi ${t} ?`
  }
  // EN : "Your … is down" → "why is … down" (simplification)
  t = t.replace(/^Your\b/i, 'my')
  if (t[0]) t = t[0].toLowerCase() + t.slice(1)
  return `Why ${t}?`
}

// Clés i18n du label "Try" / "Essaie" et "Suggestions" (équivalents existants).
export const SUGGESTIONS_LABEL_KEY: StringKey = 'chat.suggestions'
