# SmartAnalyst — Marche à suivre avec Claude Code

> **Important :** tu n'« uploades » pas ces fichiers à Claude Code comme à un chatbot. **Claude Code travaille à l'intérieur de ton dépôt de code.** Ces fichiers se déposent DANS ton repo, et Claude Code les lit tout seul à chaque session.

## Ce que contient ce pack

- `CLAUDE.md` → à placer à la **racine de ton repo**. Claude Code le lit automatiquement à chaque session (il survit même à la compaction du contexte).
- `docs/` → à placer à la racine aussi : le cahier des charges, les 6 ADR, et les prompts de démarrage.

Tu ne pars **pas** de zéro : on greffe ce cadrage sur ton codebase SmartAnalyst existant.

---

## Étape 1 — Pré-requis (une fois)

- **Claude Code installé.** Méthode native (recommandée, sans Node) ou npm : `npm install -g @anthropic-ai/claude-code` (Node 18+ ; **pas de `sudo`**). Doc : https://docs.claude.com/en/docs/claude-code/overview
- **Un accès Claude** : abonnement Pro / Max / Team / Enterprise, ou une clé API Console. Le plan Claude.ai gratuit ne donne pas accès à Claude Code.
- **Ton projet sous Git** (fortement recommandé) : tu pourras relire chaque diff et revenir en arrière.

## Étape 2 — Déposer le pack dans ton repo

1. Décompresse le zip.
2. Copie `CLAUDE.md` à la **racine** de ton repo SmartAnalyst.
3. Copie le dossier `docs/` à la racine (fusionne s'il existe déjà).
4. Commit :
   ```bash
   git add CLAUDE.md docs/
   git commit -m "Cadrage produit : CLAUDE.md + ADR + cahier des charges"
   ```

## Étape 3 — Lancer Claude Code

1. `cd` dans ton repo, puis lance `claude` (la première fois : authentification dans le navigateur).
2. Vérifie qu'il a chargé le contexte : tape `/memory` → tu dois voir `CLAUDE.md` listé.

## Étape 4 — Toujours commencer par l'AUDIT (ne rien modifier)

Colle le **Prompt 1** (inventaire du repo) puis le **Prompt 2** (audit connecteurs) de `docs/kickoff-prompts.md`. Claude Code te rend un diagnostic ✅/⚠️/❌ **sans toucher au code**. Objectif : savoir où tu en es vraiment — rappel, seul GA4 est probablement validé end-to-end, à confirmer.

## Étape 5 — Travailler lot par lot

- Une **branche par lot** : `git checkout -b lot-0-confiance`.
- Colle le prompt du lot (`docs/kickoff-prompts.md`). Claude Code présente d'abord le **plan + auto-audit**, puis exécute item par item.
- **Relis les diffs** avant de valider. Commit à la fin du lot.
- Entre deux tâches sans rapport : `/clear` pour repartir d'un contexte propre.
- Un lot rouge (❌ critique) ne se franchit pas sans ta décision.

## Étape 6 — Les points où Claude Code doit s'arrêter et te demander

Stripe en **live**, secrets, opérations sur la base de **prod**, envoi d'emails en masse, validation juridique. `CLAUDE.md` lui dit de te solliciter — valide toi-même.

---

## L'ordre des lots (rappel)

1. Audit repo + connecteurs → 2. **Lot 0** (confiance & mesure) → 3. **Lot 1** (boucle accro) → 4. **Lot 2** (pro) → 5. **Lot 3** (monétisation) → 6. **Lot 4** (confort). Détail dans `docs/cahier-des-charges.md` §3 et §7.

## Quand mettre à jour ces docs

Si une décision change : modifie l'ADR concerné (ou écris-en un nouveau qui le **remplace**) **et** le cahier des charges, puis re-commit. Claude Code repart toujours de la version sur disque.

## Décisions encore ouvertes (à toi de trancher quand tu veux)

- **Tête de pont commerciale (EU vs US)** — décision marketing, pas produit. Le positionnement reste global quoi qu'il arrive.
- **Points de prix exacts** — l'axe est figé (ADR-0002), pas les montants.
