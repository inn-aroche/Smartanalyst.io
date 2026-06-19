# Architecture Decision Records — SmartAnalyst

Décisions structurantes figées. Une décision = un fichier. On ne re-débat pas un ADR `Accepté` sans en écrire un nouveau qui le `Remplace`.

| # | Décision | Statut |
|---|---|---|
| [0001](./0001-persona-lead-annonceur-final.md) | Persona lead = annonceur final | ✅ Accepté |
| [0002](./0002-axe-pricing-workspaces-features.md) | Axe de pricing = workspaces × features (pas le nombre de clients) | ✅ Accepté |
| [0003](./0003-positionnement-copilote-qui-agit.md) | Positionnement & moat = copilote qui agit, géographie-agnostique | ✅ Accepté |
| [0004](./0004-stack-smartanalyst-react-gemini.md) | Stack = SmartAnalyst (React + Gemini défaut/Claude approfondi) + UX « Rapide/Approfondi » | ✅ Accepté |
| [0005](./0005-sources-api-fichiers-mcp-sortie.md) | Sources = API (ingestion) + tag + fichiers ; MCP en sortie uniquement | ✅ Accepté |
| [0006](./0006-pdf-window-print-par-defaut.md) | PDF rapports = `window.print()` par défaut, Puppeteer en réserve | ✅ Accepté |

## Décisions encore ouvertes (hors ADR pour l'instant)

- **Tête de pont go-to-market (EU vs US).** Décision *commerciale*, pas produit. Le positionnement (ADR-0003) reste global quoi qu'il arrive. À trancher selon le canal de distribution réel (audience anglophone existante ? réseau FR/EU ?).
- **Points de prix exacts.** L'ADR-0002 fige l'*axe*, pas les montants.

Format : Contexte · Décision · Conséquences · Alternatives écartées. Date au format ISO.
