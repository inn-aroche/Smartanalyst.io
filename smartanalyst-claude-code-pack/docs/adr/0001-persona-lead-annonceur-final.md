# ADR-0001 — Persona lead : l'annonceur final

- **Statut :** Accepté
- **Date :** 2026-06-19
- **Décideurs :** Aurélien (produit/distribution), CTO

## Contexte

Le produit a deux héritages qui se contredisent : un modèle **agence** (ReportFlow : `agencies` + `agency_clients`, reporting white-label sortant, pricing au nombre de clients) et un modèle **annonceur final** (SmartAnalyst V2 : « Mon point du jour », persona Camille fondatrice d'e-com, non-analyste). Tant qu'une persona unique n'est pas posée, chaque écran, le modèle de données, le pricing et l'onboarding sont tirés dans deux directions et restent des compromis tièdes.

## Décision

La **persona lead unique est l'annonceur final** : fondateur / TPE-PME mono-business qui gère lui-même son marketing (type Camille — e-commerce, équipe de 1 à 3, pas de data analyst), qui a besoin de décider chaque matin sans pouvoir s'offrir un analyste.

- **Anti-persona :** les équipes data / analystes qui cherchent un outil BI configurable. On ne conçoit pas pour eux.
- **L'agence** redevient un segment **secondaire**, adressé plus tard, et n'est plus l'ancre des décisions produit.

## Conséquences

**Positives**
- Marché plus large, douleur plus aiguë et plus émotionnelle, pas de bataille frontale avec AgencyAnalytics sur son terrain.
- Débloque une home cohérente (le Brief), un axe de pricing qui a du sens (ADR-0002) et un onboarding clair.

**Négatives / à assumer**
- Le modèle de données actuel est *agence-shaped* (`agencies`, `agency_clients`, white-label sortant) → **migration nécessaire** vers une sémantique workspace / mono-business. À inscrire au chantier (ne pas casser la prod : expand-contract).
- Les features multi-clients / white-label sortant sont **déprioritisées** (passent en P2, ADR-0006 cohérent).

## Alternatives écartées

- **Agence d'abord** — rejeté : marché plus encombré, affrontement frontal avec des incumbents financés, TAM plus petit pour un fondateur solo.
- **Servir les deux à parts égales** — rejeté : chaque écran devient un compromis qui ne ravit personne (c'est l'état de départ qu'on corrige).
