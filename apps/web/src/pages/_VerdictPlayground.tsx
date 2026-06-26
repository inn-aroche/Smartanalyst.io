// VerdictPlayground — page DEV-ONLY pour valider visuellement le rendu des
// 4 patterns du cahier 22c. Wirée dans App.tsx derriere import.meta.env.DEV
// donc tree-shakee en build prod (verifie sur le bundle final).
//
// Usage : npm run dev puis visite http://localhost:5173/dev/verdict-playground
// Sert aussi de fixture pour le smoke test E2E playwright (verdict.spec.ts).

import VerdictHighlight from '../components/chat/verdict/VerdictHighlight'
import type { VerdictSpec } from '../components/chat/verdict/types'

const FIXTURE_CAMPAIGNS: VerdictSpec = {
  pattern: 'campaigns',
  header: { context: 'Canaux · 30j', title: 'Performance par canal' },
  verdict: 'Meta Ads domine sur CA (×2,5 vs Google Ads) sur les 30 derniers jours.',
  winner: {
    name: 'Meta Ads',
    status: 'TOP',
    metrics: [
      { label: 'CA', value: '12 500 €', sub: '52% du total', highlight: true },
      { label: 'Sessions', value: '4 320' },
      { label: 'CVR', value: '3,8%' },
    ],
    insight:
      'Meta Ads concentre 52% du chiffre d’affaires sur la fenêtre — c’est le canal le plus rentable à pousser en priorité.',
  },
  rows: [
    {
      id: 'meta_ads',
      name: 'Meta Ads',
      status: 'TOP',
      value: 12500,
      valueLabel: '12 500 €',
      secondary: 'Sessions : 4 320',
      metrics: [
        { label: 'CA', value: '12 500 €' },
        { label: 'Sessions', value: '4 320' },
        { label: 'CVR', value: '3,8%' },
      ],
      insight:
        'Meilleur ROAS du portefeuille, scaler avec prudence (palier de saturation autour de 15k€).',
    },
    {
      id: 'google_ads',
      name: 'Google Ads',
      status: 'BON',
      value: 5000,
      valueLabel: '5 000 €',
      secondary: 'Sessions : 2 100',
      metrics: [
        { label: 'CA', value: '5 000 €' },
        { label: 'Sessions', value: '2 100' },
        { label: 'CVR', value: '2,4%' },
      ],
      insight:
        'Stable, CTR correct mais CPL en hausse récente — surveiller la qualité des keywords.',
    },
    {
      id: 'ga4',
      name: 'GA4 (organique)',
      status: 'MOYEN',
      value: 2300,
      valueLabel: '2 300 €',
      secondary: 'Sessions : 8 700',
      metrics: [
        { label: 'CA', value: '2 300 €' },
        { label: 'Sessions', value: '8 700' },
        { label: 'CVR', value: '0,3%' },
      ],
      insight: 'Beaucoup de trafic mais conversion basse — opportunité CRO majeure.',
    },
    {
      id: 'stripe',
      name: 'Stripe (direct)',
      status: 'FAIBLE',
      value: 400,
      valueLabel: '400 €',
      secondary: 'Sessions : 120',
      metrics: [
        { label: 'CA', value: '400 €' },
        { label: 'Sessions', value: '120' },
        { label: 'CVR', value: '8,1%' },
      ],
      insight:
        'Volume faible mais conversion forte (audience qualifiée) — investir en SEO / partenariats.',
    },
  ],
  actions: [
    { text: 'Allouer plus de budget à Meta Ads (12 500 € sur 30j)' },
    { text: 'Auditer GA4 (organique) et Stripe (direct) avant d’arbitrer une baisse de budget' },
  ],
}

const FIXTURE_JOURNEY: VerdictSpec = {
  pattern: 'journey',
  header: { context: 'Funnel · 30j', title: 'Parcours utilisateur' },
  verdict:
    '5,0% de conversion globale sur 30j — la fuite la plus forte est entre ajout panier et commande (80% perdus).',
  journey: {
    steps: [
      {
        label: 'Sessions',
        value: 12000,
        valueLabel: '12 000',
        retentionPct: null,
        status: 'TOP',
      },
      {
        label: 'Vues produit',
        value: 8400,
        valueLabel: '8 400',
        retentionPct: 70,
        status: 'TOP',
      },
      {
        label: 'Ajout panier',
        value: 3000,
        valueLabel: '3 000',
        retentionPct: 35.7,
        status: 'BON',
      },
      {
        label: 'Commande',
        value: 600,
        valueLabel: '600',
        retentionPct: 20,
        status: 'MOYEN',
      },
    ],
  },
  actions: [
    { text: 'Auditer la transition ajout panier → commande (80% de perte)' },
    { text: 'Vérifier la qualité du trafic en entrée — la conversion globale est sous 1%' },
  ],
}

const FIXTURE_BENCHMARK: VerdictSpec = {
  pattern: 'benchmark',
  header: { context: 'Benchmark · E-commerce mode · 30j', title: 'Positionnement vs marché' },
  verdict:
    'ROAS à 3,8x sur 30j — au-dessus de la médiane E-commerce mode (3,0x), il reste de la marge vers 5,0x.',
  benchmark: {
    metricLabel: 'ROAS',
    userValueLabel: '3,8x',
    userValue: 3.8,
    p25: 2,
    p50: 3,
    p75: 5,
    p25Label: '2,0x',
    p50Label: '3,0x',
    p75Label: '5,0x',
    positionPct: 60,
    status: 'BON',
    direction: 'higher_better',
  },
  actions: [
    {
      text: 'Documenter ce qui fait que le ROAS est au-dessus de la médiane — c’est ce qu’il faut protéger',
    },
    {
      text: 'Recouper avec WordStream Benchmark 2024 avant d’arbitrer une décision majeure (benchmarks indicatifs)',
    },
  ],
  sources: [
    {
      name: 'WordStream Benchmark 2024',
      url: 'https://www.wordstream.com/blog/ws/google-ads-benchmarks',
    },
  ],
}

const FIXTURE_UNAVAILABLE: VerdictSpec = {
  pattern: 'unavailable',
  header: { context: 'Canaux · 30j', title: 'Données insuffisantes' },
  verdict:
    'Pas de données CA sur les 30 derniers jours. Connecte une source ou élargis la fenêtre pour obtenir un classement par canal.',
  actions: [{ text: 'Vérifier les connecteurs actifs depuis Sources' }],
}

const FIXTURES = [
  { id: 'campaigns', label: 'pattern campaigns', spec: FIXTURE_CAMPAIGNS },
  { id: 'journey', label: 'pattern journey', spec: FIXTURE_JOURNEY },
  { id: 'benchmark', label: 'pattern benchmark', spec: FIXTURE_BENCHMARK },
  { id: 'unavailable', label: 'pattern unavailable', spec: FIXTURE_UNAVAILABLE },
]

export default function VerdictPlayground() {
  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-12">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Verdict playground — DEV</h1>
        <p className="mt-2 text-sm text-gray-500">
          Cahier 22c. Rend les 4 patterns avec des fixtures statiques. Cette page est tree-shakée en
          build prod (gate sur <code>import.meta.env.DEV</code>).
        </p>
      </header>
      {FIXTURES.map((f) => (
        <section key={f.id} data-testid={`verdict-${f.id}`} className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400">{f.label}</p>
          <VerdictHighlight spec={f.spec} />
        </section>
      ))}
    </div>
  )
}
