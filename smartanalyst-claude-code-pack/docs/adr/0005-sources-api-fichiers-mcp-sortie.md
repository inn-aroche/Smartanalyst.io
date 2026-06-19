# ADR-0005 — Sources de données : API (ingestion) + tag first-party + fichiers ; MCP en sortie uniquement

- **Statut :** Accepté
- **Date :** 2026-06-19
- **Lié à :** cahier des charges §2 et §4.7

## Contexte

Question récurrente : les connecteurs doivent-ils être en API et/ou en MCP ? Risque de confusion : croire qu'« ajouter MCP » résout le besoin de connecteurs. Les features (brief, score, veille, rapports) sont **précomputées** et ont besoin d'une donnée normalisée, historisée et stable.

## Décision

**Séparer l'ingestion de la distribution.**

### Ingestion (remplit `canonical_metrics`, nourrit toutes les features précomputées)

1. **API / OAuth (`BaseConnector`) = mécanisme principal.** Seul moyen d'avoir une donnée normalisée/historisée qu'on contrôle. *Priorité P0 — existe, à fiabiliser source par source.*
2. **Tag first-party (`rf.js`) = complémentaire.** Donnée du site de l'utilisateur indisponible via API tierce ; différenciateur RGPD/first-party. *P1.*
3. **Bibliothèque de fichiers (CSV/PDF) = complémentaire, cadré.** **Nourrit le contexte du chat, ne remplit PAS les KPI structurés.** *P1.*
4. **MCP en entrée = NON (pour l'instant).** Donne du live non historisé, hors couche canonique, et crée une dépendance à un concurrent.

### Distribution (accès à l'intelligence)

- **Serveur MCP exposé** au-dessus de `canonical_metrics`, pour que l'utilisateur interroge **sa** donnée SmartAnalyst depuis Claude/ChatGPT. Devient un standard ; colle à l'annonceur final qui vit dans ces outils. **Canal d'accès supplémentaire, PAS un canal d'ingestion.** *P2, post-beta.*

## Conséquences

**Positives**
- Architecture claire : les connecteurs restent du **code API** ; la couche canonique reste propre.
- La bibliothèque de fichiers ne peut pas polluer les KPI structurés (cadrage explicite).

**Négatives / à assumer**
- Besoin d'une abstraction d'ingestion partagée API + tag, et d'un pipeline d'indexation des fichiers pour le contexte chat (type RAG).
- **Réalité à corriger :** seul **GA4** est probablement validé end-to-end ; Meta / Google Ads / Stripe / Search Console **à confirmer source par source** (chantier Lot 0).

## Alternatives écartées

- **MCP en entrée comme raccourci vers « plus de connecteurs »** — rejeté (cf. point 4).
