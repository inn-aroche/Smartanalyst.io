# SmartAnalyst — Contexte projet (Claude Code)

Ce fichier est lu automatiquement à chaque session : il fixe le cadre. Les specs détaillées vivent dans `docs/` — les lire **à la demande** (ne pas tout charger à chaque session).

## Le produit (une phrase)

SmartAnalyst = le **copilote marketing qui agit** : il connecte les données, dit ce qui compte et quoi faire — et aide à le faire. Pas un dashboard de plus, pas un chatbot de plus. Détail : `docs/adr/0003-positionnement-copilote-qui-agit.md`.

## Mode de travail : AUDIT & OPTIMISATION (pas réécriture)

On reprend un codebase **existant**. On ne réécrit pas : on diagnostique, on priorise, on durcit lot par lot. Avant toute modification d'un domaine, **lire le code réel concerné**.

## Décisions figées (ADR — détail dans `docs/adr/`)

- Persona lead = **annonceur final** mono-business (pas agence). ADR-0001.
- Pricing = **workspaces × features** (pas le nombre de clients). ADR-0002.
- Moat = **boucle vers l'action + IA incluse partout + gouvernance données EU** ; international dès J1 (bilingue EN/FR structurel). ADR-0003.
- Stack = React 18 + Vite + Tailwind + React Query / Node 20 + Express + BullMQ + Redis + PM2 / Supabase (Postgres + Auth + Vault + RLS). IA = **Gemini 2.5 Flash par défaut**, **Claude** pour l'analyse approfondie, derrière une **abstraction provider**. ADR-0004.
- Sources = API/OAuth (ingestion principale) + tag first-party + bibliothèque de fichiers (contexte chat) ; **MCP en sortie uniquement, post-beta**. ADR-0005.
- PDF rapports = `window.print()` par défaut ; Puppeteer en réserve. ADR-0006.

## Terminologie (TOUJOURS / JAMAIS)

- TOUJOURS **`workspace`** dans le nouveau code (pas `agency` / `client`).
- IA côté UI : TOUJOURS le toggle **« Rapide / Approfondi »** ; JAMAIS exposer « Gemini » / « Claude » à l'utilisateur final.
- TOUJOURS **« gouvernance des données / hébergement EU »** dans la copy ; JAMAIS « badge RGPD ».

## Garde-fou produit

Ne pas chercher à égaler Claude/ChatGPT sur le chat générique (terrain perdu). La valeur unique = les **crochets d'action** (créer une tâche / un rapport / une veille depuis le chat). Muscler la forme partout ; différencier par l'action.

## Conventions de code

- Fichiers `kebab-case` · Classes `PascalCase` · fn/vars `camelCase` · constantes `UPPER_SNAKE_CASE` · tables `snake_case`.
- **Code en anglais, commentaires en français.**
- **RLS obligatoire** sur chaque table tenant-scoped (`workspace_id`). `service_role` côté serveur uniquement.
- Variables d'env : jamais en dur ; vérifier leur présence au boot.
- Try/catch sur tout appel externe ; erreurs loggées avec contexte ; jamais d'erreur silencieuse sur un job critique ; messages user-facing en FR/EN.

## Definition of Done (chaque livrable)

Validation serveur · tous les états UI (vide / chargement / erreur / succès / permission refusée) · idempotence sur écritures sensibles · tests des parcours à risque · a11y AA · event de tracking posé (cahier §6) · consentement respecté (Consent Mode v2) · i18n-ready EN/FR.

## Discipline de verrou (auto-audit)

Avant un lot : présenter le **plan + un auto-audit ✅/⚠️/❌** de l'existant, puis attendre le go. Un lot n'est « vert » que **sans ❌ critique**. Ne pas franchir un verrou rouge sans décision explicite (le tracer en ADR si c'est un arbitrage assumé). En fin de lot : re-diagnostiquer (montrer ce qui passe de ❌/🔧 à ✅).

## Où regarder dans `docs/`

- `docs/cahier-des-charges.md` — **document de référence** : §1 décisions · §2 sources · §3 lots priorisés · §4 specs par feature **avec composants** · §6 measurement plan · §7 ordre d'exécution.
- `docs/adr/` — décisions figées (contexte / conséquences).
- `docs/kickoff-prompts.md` — prompts prêts à coller par phase.
- Lire la **section pertinente à la demande**, pas tout le doc à chaque fois.

## Exige une validation humaine (NE PAS présumer fait, s'arrêter et demander)

Isolation multitenant testée sur prod · délivrabilité email (SPF/DKIM/DMARC) · Stripe en **live** + TVA · validation juridique RGPD/AI Act · opérations sur la base de **prod** · envoi d'emails en masse · pentest.

## Ordre de marche

1. Inventaire du repo (diagnostic, rien modifier). 2. Audit connecteurs source par source. 3. Lot 0 (confiance & mesure). 4. Lot 1 (boucle accro). 5. Lot 2 (pro). 6. Lot 3 (monétisation). 7. Lot 4 (confort). Détail : cahier §3 et §7.
