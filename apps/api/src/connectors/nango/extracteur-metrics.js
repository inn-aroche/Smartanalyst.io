// ExtracteurMetrics — Flux A : données structurées via Nango.
//
// Objectif : récupérer les données transactionnelles, CRM et ads des
// intégrations Nango (Shopify, GA4, Meta Ads, TikTok Ads, Google Ads,
// Stripe, HubSpot), puis les transformer en un contexte narratif Markdown
// destiné à l'agent IA (et non pas du JSON brut).
//
// Pattern par méthode `extraire<Source>` :
//   1. nango.listRecords({providerConfigKey, connectionId, model})
//   2. Agrégation / calcul de tendances (vs période précédente)
//   3. _formaterEnMarkdown() pour produire un bloc texte court avec les
//      chiffres clés et leurs évolutions
//
// État : SQUELETTE. Chaque méthode est à implémenter au fur et à mesure
// que les syncs Nango correspondants sont activés et que les modèles de
// sortie sont stabilisés (cf. nango.yaml).

const { nango } = require('../../services/auth/nango.service')
const { logger } = require('../../lib/logger')

class ExtracteurMetrics {
  /**
   * @param {Object} params
   * @param {string} params.workspaceId
   * @param {string} params.connectionId - Nango connection_id (un par couple workspace × intégration)
   */
  constructor({ workspaceId, connectionId }) {
    this.workspaceId = workspaceId
    this.connectionId = connectionId
  }

  // ── Shopify ─────────────────────────────────────────────────────────────
  async extraireShopify({ debut, fin }) {
    throw new Error('À implémenter : sync ventes-shopify (ventes, panier moyen, top produits).')
  }

  // ── Google Analytics 4 ──────────────────────────────────────────────────
  async extraireGA4({ debut, fin }) {
    throw new Error('À implémenter : sync metriques-ga4 (sessions, conversions, sources).')
  }

  // ── Meta Ads (Facebook / Instagram) ─────────────────────────────────────
  async extraireMetaAds({ debut, fin }) {
    throw new Error('À implémenter : sync ads-meta (dépense, ROAS, CPA par campagne).')
  }

  // ── TikTok Ads ──────────────────────────────────────────────────────────
  async extraireTiktokAds({ debut, fin }) {
    throw new Error('À implémenter : sync ads-tiktok (dépense, CPM, conversions).')
  }

  // ── Google Ads ──────────────────────────────────────────────────────────
  async extraireGoogleAds({ debut, fin }) {
    throw new Error('À implémenter : sync campagnes-google-ads (coût, conversions, top keywords).')
  }

  // ── Stripe ──────────────────────────────────────────────────────────────
  async extraireStripe({ debut, fin }) {
    throw new Error('À implémenter : sync revenu-stripe (MRR, churn, paiements échoués).')
  }

  // ── HubSpot ─────────────────────────────────────────────────────────────
  // Logique spécifique : on récupère séparément les Contacts et les Deals
  // (deux syncs distincts côté nango.yaml), puis on joint deal.contact_id
  // pour produire un récit "tel client est dans telle étape du pipeline".
  async extraireHubspotContacts() {
    throw new Error('À implémenter : sync contacts-hubspot (segmentation par société/secteur).')
  }

  async extraireHubspotDeals() {
    throw new Error('À implémenter : sync deals-hubspot (pipeline, prévisionnel, vélocité).')
  }

  /**
   * Combine contacts + deals pour produire le contexte narratif CRM
   * complet (qui doit signer ce mois, top opportunités, blocages).
   */
  async extraireHubspotPipeline() {
    throw new Error('À implémenter : jointure Contacts × Deals + narratif pipeline.')
  }

  // ── Helpers communs ─────────────────────────────────────────────────────

  /**
   * Convertit un payload de métriques en bloc Markdown narratif pour l'IA.
   *
   * Format cible (exemple Shopify) :
   *
   *   ### Shopify — Ventes du 1er au 30 mai
   *   - Chiffre d'affaires : 12 450 € (+18% vs mois précédent)
   *   - Commandes : 287 (+12%)
   *   - Panier moyen : 43 € (+5%)
   *   - Top produits : T-shirt Bio (412 €), Mug céramique (298 €), …
   *
   * @param {Object} _contexte - Données brutes Nango + comparaison
   * @returns {string} Markdown narratif
   */
  _formaterEnMarkdown(_contexte) {
    throw new Error('À implémenter : formatage narratif en Markdown.')
  }
}

module.exports = ExtracteurMetrics
