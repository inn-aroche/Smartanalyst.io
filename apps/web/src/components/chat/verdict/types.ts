// Types partages pour les composants verdict (cahier 22c).
//
// Un `VerdictSpec` est l'output structure d'une reponse "analyste" : il
// declare son pattern, le gagnant (winner), les lignes du tableau, les
// actions a prendre. Backend → injecte un Highlight de type 'verdict'
// avec un de ces specs.

export type Status = 'TOP' | 'BON' | 'MOYEN' | 'FAIBLE'

export type StatusConfig = {
  badge: string // tailwind classes background + text
  bar: string // tailwind classes bg pour la barre proportionnelle
  dot: string // tailwind classes bg pour le point timeline
}

export const STATUS_CONFIG: Record<Status, StatusConfig> = {
  TOP: { badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  BON: { badge: 'bg-blue-100 text-blue-700', bar: 'bg-blue-400', dot: 'bg-blue-400' },
  MOYEN: { badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400', dot: 'bg-amber-400' },
  FAIBLE: { badge: 'bg-red-100 text-red-700', bar: 'bg-red-400', dot: 'bg-red-400' },
}

export type Metric = {
  /** Label court, ex: "CPL", "CVR", "Leads". */
  label: string
  /** Valeur principale formatee, ex: "18 €", "6.1%". */
  value: string
  /** Comparaison/contexte optionnel, ex: "−67% vs moyenne". */
  sub?: string | null
  /** Si true, fond vert pour mettre en avant la valeur gagnante. */
  highlight?: boolean
}

export type Row = {
  /** Identifiant stable (slug, id…). */
  id: string
  /** Nom affichable, ex: "Campagne X", "Produit Y". */
  name: string
  /** Statut qui pilote le badge + la couleur de la barre. */
  status: Status
  /** Valeur principale numerique pour la barre proportionnelle. */
  value: number
  /** Idem en string formattee pour l'affichage. */
  valueLabel: string
  /** Metric secondaire optionnelle (texte court). */
  secondary?: string | null
  /** Detail complet (Phase 3 — DetailPanel au clic). */
  metrics?: Metric[]
  /** Insight specifique a cet element (1-2 phrases). */
  insight?: string | null
}

export type Action = {
  /** Texte court, verbe d'action en debut. Ex: "Scaler la campagne X de +50% budget". */
  text: string
}

export type VerdictHeader = {
  /** Contexte source, ex: "META Ads · 30j". */
  context?: string | null
  /** Titre court de la reponse (pas la question reformulee). */
  title: string
}

export type Winner = {
  /** Nom du gagnant (ex: "Campagne Black Friday 2026"). */
  name: string
  /** Statut applique (typiquement TOP). */
  status: Status
  /** 3-4 metriques mises en avant. */
  metrics: Metric[]
  /** "Pourquoi" en 2-3 lignes. */
  insight: string
}

export type Source = {
  /** Nom court, ex: "AdRoll Benchmark 2025". */
  name: string
  /** URL externe. */
  url?: string | null
}

export type JourneyStep = {
  /** Label court de l'etape, ex: "Sessions", "Ajout panier", "Commande". */
  label: string
  /** Valeur brute de l'etape sur la fenetre. */
  value: number
  /** Idem formatte pour affichage, ex: "12 540". */
  valueLabel: string
  /** % retention vs etape precedente. null pour la 1ere etape. */
  retentionPct: number | null
  /** Statut pilote par la retention (TOP >= 60%, BON >= 35%, ...). */
  status: Status
}

export type BenchmarkSpectrum = {
  /** Label court de la metric comparee, ex: "ROAS", "Taux de conversion". */
  metricLabel: string
  /** Valeur de l'user (formatee), ex: "3.2x", "2.4%". */
  userValueLabel: string
  /** Valeur numerique de l'user. */
  userValue: number
  /** P25 / mediane / P75 du benchmark (numeriques pour le positionnement). */
  p25: number
  p50: number
  p75: number
  /** Versions formatees pour les ticks (ex: "2.0x", "3.1x", "4.5x"). */
  p25Label: string
  p50Label: string
  p75Label: string
  /** Position de l'user sur 0-100 (0 = au niveau p25, 100 = au niveau p75). */
  positionPct: number
  /** Statut deduit de la position. */
  status: Status
  /** Sens : 'higher_better' (ROAS) ou 'lower_better' (CPL, churn). */
  direction: 'higher_better' | 'lower_better'
}

export type VerdictSpec = {
  /** Quel pattern visuel utiliser (cf. cahier 22c §6). */
  pattern: 'campaigns' | 'creatives' | 'products' | 'journey' | 'benchmark' | 'unavailable'
  header: VerdictHeader
  /** Verdict 1-ligne avant tout. */
  verdict: string
  winner?: Winner | null
  rows?: Row[] | null
  actions: Action[]
  /** Pour pattern='journey' : etapes du funnel. */
  journey?: { steps: JourneyStep[] } | null
  /** Pour pattern='benchmark' : positionnement vs reference externe. */
  benchmark?: BenchmarkSpectrum | null
  /** Sources externes (obligatoire pour pattern='benchmark'). */
  sources?: Source[] | null
}
