// Feature catalog — drives both the marketing "What's included" tables
// and the in-app feature gating logic.
//
// Reference: docs/00_BRIEF_EXECUTIF.md § "Les 8 features"

// IA is included in ALL plans — it's the heart of the product, not a premium feature.
// (See brief: "IA incluse dans tous les plans.")
export const FEATURES = Object.freeze({
  // The 8 product features, in importance order from the brief.
  product: [
    {
      id: 'conversational',
      label: 'Analyse conversationnelle en français',
      description:
        'Pose tes questions en français naturel. L’IA répond avec des données sourcées, contextualisées et une recommandation concrète.',
      availableFrom: 'FREE',
    },
    {
      id: 'dashboard',
      label: 'Dashboard temps réel',
      description:
        'Score de santé global, KPIs clés, alertes actives. Réponds à "est-ce que ça va ?" en 3 secondes.',
      availableFrom: 'FREE',
    },
    {
      id: 'proactiveInsights',
      label: 'Insights proactifs hebdomadaires',
      description:
        'Sans action de ta part, l’IA détecte les anomalies et te livre 3-5 insights par semaine avec recommandations.',
      availableFrom: 'FREE',
    },
    {
      id: 'benchmark',
      label: 'Benchmark concurrentiel',
      description:
        'Tes performances comparées à ton secteur — détecté automatiquement à l’onboarding.',
      availableFrom: 'STARTER',
    },
    {
      id: 'healthScore',
      label: 'Score de santé business (0-100)',
      description:
        'Un score hebdomadaire qui synthétise paid, organic, conversion et revenue. Historisé sur 12 mois.',
      availableFrom: 'FREE',
    },
    {
      id: 'autoReports',
      label: 'Rapports PDF automatiques',
      description:
        'Le 1er du mois, les rapports clients partent tout seuls. White-label, commentaire exécutif IA, benchmark inclus.',
      availableFrom: 'STARTER',
    },
    {
      id: 'connectors',
      label: 'Connecteurs multi-sources',
      description:
        'GA4, Meta Ads, Google Ads, Stripe, Search Console. Toutes les données normalisées sur un schéma universel.',
      availableFrom: 'FREE',
    },
    {
      id: 'businessProfile',
      label: 'Profil business intelligent',
      description:
        'Le site web est analysé à l’onboarding. Secteur, marché, outils détectés — chaque insight est contextualisé.',
      availableFrom: 'FREE',
    },
  ],

  // Connectors available (P1 MVP).
  connectors: [
    { id: 'ga4', label: 'Google Analytics 4', availableFrom: 'FREE' },
    { id: 'meta', label: 'Meta Ads (Facebook, Instagram)', availableFrom: 'STARTER' },
    { id: 'googleAds', label: 'Google Ads', availableFrom: 'STARTER' },
    { id: 'stripe', label: 'Stripe', availableFrom: 'STARTER' },
    { id: 'searchConsole', label: 'Google Search Console', availableFrom: 'STARTER' },
  ],
});
