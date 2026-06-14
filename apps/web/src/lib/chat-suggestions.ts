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
    { en: 'What changed in my traffic this week?', fr: 'Qu’est-ce qui a changé sur mon trafic cette semaine ?' },
    { en: 'Which pages convert the best?', fr: 'Quelles pages convertissent le mieux ?' },
    { en: 'Where does my traffic come from?', fr: 'D’où vient mon trafic ?' },
    { en: 'Is my bounce rate healthy?', fr: 'Mon taux de rebond est-il sain ?' },
  ],
  meta_ads: [
    { en: 'How healthy are my Meta campaigns?', fr: 'Mes campagnes Meta sont-elles en bonne santé ?' },
    { en: 'Where is my Meta budget bleeding?', fr: 'Où fuit mon budget Meta ?' },
    { en: 'How do I detect Meta creative fatigue?', fr: 'Comment détecter une fatigue créative Meta ?' },
  ],
  google_ads: [
    { en: 'Which Google Ads keywords waste budget?', fr: 'Quels mots-clés Google Ads gaspillent mon budget ?' },
    { en: 'Is my Google Ads ROAS improving?', fr: 'Mon ROAS Google Ads s’améliore-t-il ?' },
  ],
  shopify: [
    { en: 'What’s my AOV trend?', fr: 'Quelle est la tendance de mon panier moyen ?' },
    { en: 'Which products drive my revenue?', fr: 'Quels produits portent mon revenu ?' },
  ],
  search_console: [
    { en: 'Which queries lost organic clicks?', fr: 'Quelles requêtes ont perdu en clics organiques ?' },
  ],
}

const GENERIC: Suggestion[] = [
  { en: 'What changed in my data this week?', fr: 'Qu’est-ce qui a changé dans mes données cette semaine ?' },
  { en: 'How do you compute a blended CAC?', fr: 'Comment on calcule un CAC blended ?' },
  { en: 'What is a healthy LTV/CAC ratio for a SaaS?', fr: 'Quel ratio LTV/CAC sain pour un SaaS ?' },
  { en: 'How do I detect creative fatigue?', fr: 'Comment détecter une fatigue créative ?' },
]

function todayHash(): number {
  const d = new Date()
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

/**
 * Construit jusqu'à 3 suggestions adaptées. Rotation déterministe quotidienne :
 * à mêmes sources, mêmes suggestions toute la journée, mais autres demain.
 */
export function pickSuggestions(activeSources: string[], locale: 'fr' | 'en'): string[] {
  const seed = todayHash()
  const out: string[] = []
  const seen = new Set<string>()

  function take(suggestions: Suggestion[], offset: number) {
    if (suggestions.length === 0) return
    const idx = (seed + offset) % suggestions.length
    const s = suggestions[idx]
    const txt = locale === 'fr' ? s.fr : s.en
    if (!seen.has(txt)) {
      seen.add(txt)
      out.push(txt)
    }
  }

  let i = 0
  for (const src of activeSources) {
    if (out.length >= 3) break
    const arr = SOURCE_QUESTIONS[src]
    if (arr) take(arr, i++)
  }
  // Complète avec des génériques si besoin
  let g = 0
  while (out.length < 3 && g < GENERIC.length + 3) {
    take(GENERIC, g++)
  }
  return out
}

// Clés i18n du label "Try" / "Essaie" et "Suggestions" (équivalents existants).
export const SUGGESTIONS_LABEL_KEY: StringKey = 'chat.suggestions'
