# ADR-0002 — Axe de pricing : workspaces × features (pas le nombre de clients)

- **Statut :** Accepté
- **Date :** 2026-06-19
- **Lié à :** ADR-0001 (persona), ADR-0003 (IA incluse)

## Contexte

Les plans actuels sont gatés sur le **nombre de clients** (1 / 5 / 20 / illimité). Pour un annonceur final mono-business (ADR-0001), c'est vide de sens : il a « un client », lui-même. Il faut un axe qui mappe la nouvelle persona et qui croît avec la valeur reçue, sans étrangler le cœur du produit (l'IA).

## Décision

Remplacer l'axe « nombre de clients » par **workspaces × paliers de features**, avec des **garde-fous d'usage** sur l'axe coûteux (tokens IA, connecteurs) plutôt qu'un gating dur sur la valeur cœur.

- Les plans se différencient sur : **nombre de workspaces**, **nombre de connecteurs**, **features avancées** (white-label, templates de rapport, gestion d'équipe), et une **enveloppe d'usage IA** (fair-use, pas un mur qui bloque l'usage quotidien).
- **L'IA reste incluse dans tous les plans** (ADR-0003) — ce n'est jamais le levier de gating premium.
- Cet ADR fige **l'axe**, pas les montants. Les points de prix exacts restent à calibrer.

## Conséquences

**Positives**
- Pricing lisible pour un fondateur ; il croît avec la valeur (plus de workspaces / données / usage).
- Cohérent avec la différenciation « IA incluse partout ».

**Négatives / à assumer**
- Nécessite **entitlements + métrage d'usage** (chantier Lot 3) et la synchronisation accès↔plan (anti-drift).
- **Migration des plans existants + grandfathering** des éventuels clients historiques.
- Validation humaine requise : **Stripe (metered/entitlements) + TVA / Stripe Tax**.

## Alternatives écartées

- **Par client** — rejeté (cf. contexte).
- **100 % usage-based / metered** — rejeté : imprévisible et anxiogène pour un acheteur TPE/PME.
- **Par siège** — rejeté : un mono-business a ~1 siège, l'axe ne discrimine rien.
