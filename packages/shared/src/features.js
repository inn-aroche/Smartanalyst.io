// Feature catalog — drives both the marketing "What's included" tables
// and the in-app feature gating logic.

export const FEATURES = Object.freeze({
  connectors: {
    ga4: { label: 'Google Analytics 4', availableFrom: 'FREE' },
    meta: { label: 'Meta Ads (Facebook, Instagram)', availableFrom: 'STARTER' },
    googleAds: { label: 'Google Ads', availableFrom: 'STARTER' },
    stripe: { label: 'Stripe', availableFrom: 'STARTER' },
    searchConsole: { label: 'Google Search Console', availableFrom: 'STARTER' },
  },
  capabilities: {
    chatAI: { label: 'Chat IA en français', availableFrom: 'FREE' },
    weeklyReport: { label: 'Rapport hebdo PDF', availableFrom: 'STARTER' },
    anomalyDetection: { label: 'Détection d’anomalies', availableFrom: 'PRO' },
    healthScore: { label: 'Score de santé business', availableFrom: 'STARTER' },
    multiWorkspace: { label: 'Multi-clients (espaces séparés)', availableFrom: 'PRO' },
    customBranding: { label: 'Marque blanche sur les rapports', availableFrom: 'AGENCY' },
  },
});
