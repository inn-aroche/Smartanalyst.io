# ADR-0006 — Génération PDF des rapports : `window.print()` par défaut, Puppeteer en réserve

- **Statut :** Accepté
- **Date :** 2026-06-19
- **Lié à :** ADR-0001 (persona mono-business), cahier des charges §4.6

## Contexte

Specs contradictoires : *Puppeteer/Chromium server-side* (ReportFlow) vs *`window.print()` zéro-dépendance* (SmartAnalyst). Pour l'annonceur final (ADR-0001), faire tourner un Chromium server-side est lourd en coût et en maintenance pour un bénéfice marginal.

## Décision

**Par défaut :** rapport rendu en **HTML dans `<iframe srcdoc>`** + bouton « Imprimer en PDF » via **`window.print()`** (zéro dépendance Chromium, coût/ops minimal).

**En réserve :** **Puppeteer server-side** — réservé au cas où un PDF white-label **pixel-perfect, branché, entièrement automatisé** (envoyé sans intervention humaine, à l'échelle) redevient prioritaire. À ce moment-là, un moteur de rendu server-side se justifie. **Cet ADR documente ce déclencheur.**

## Conséquences

**Positives**
- Infra et coût minimaux ; aligné sur la persona mono-business.

**Négatives / à assumer**
- `window.print()` dépend du dialogue d'impression du navigateur → moins de contrôle sur la pagination / les en-têtes, et **inadapté à la génération server-side non supervisée** de PDF brandés à l'échelle.
- L'envoi mensuel automatique reste donc un **email « rapport prêt » avec lien** plutôt qu'une pièce jointe PDF rendue côté serveur — cohérent avec cette décision. Si le PDF brandé auto-envoyé devient cœur (retour vers l'agence), **rouvrir cet ADR**.

## Alternatives écartées

- **Puppeteer par défaut** — rejeté maintenant : coût/maintenance pour la persona actuelle. Conservé comme **chemin d'évolution documenté**.
