# Prompts de démarrage — Claude Code

Prompts prêts à coller, **dans l'ordre**. Chacun suppose que `CLAUDE.md` et `docs/` sont à la racine du repo. Travaille sur une branche git par lot, et relis les diffs avant de valider.

---

## Prompt 1 — Inventaire du repo (ne rien modifier)

```
Lis CLAUDE.md et le dossier docs/ (cahier des charges + ADR). On est en mode AUDIT & OPTIMISATION.
Étape 1 : inventaire du codebase réel. Explore le code et rends-moi un diagnostic SANS rien modifier :
- stack effective vs ADR-0004 (docs/adr/0004-...), structure des dossiers
- schéma de données + politiques RLS (table par table)
- modèle d'auth, gestion des sessions
- tracking / consentement en place, tests, CI/CD, observabilité
Pour chaque point : ✅ en place / ⚠️ partiel / ❌ manquant / 🔧 dette.
Termine par les 5 risques les plus critiques.
```

## Prompt 2 — Audit des connecteurs (ne rien modifier)

```
Audit des connecteurs source par source : GA4, Meta Ads, Google Ads, Stripe, Search Console.
Pour chacun, dis-moi s'il fonctionne END-TO-END (OAuth → fetch → normalisation vers canonical_metrics) ou où exactement il casse.
Rends un tableau : source | statut | dernier point qui marche | ce qui manque.
Ne modifie rien.
```

## Prompt 3 — Lot 0 (confiance & mesure)

```
On lance le Lot 0 du cahier des charges (docs/cahier-des-charges.md §3, + measurement plan §6).
Avant de coder : 1) présente le plan détaillé + un auto-audit ✅/⚠️/❌ de l'existant sur ces items ; 2) attends mon go.
Puis exécute item par item en respectant la DoD universelle (CLAUDE.md). Branche git dédiée, diffs montrés par étape.
Items : instrumentation du funnel d'onboarding · règle « jamais de chiffre nu suspect » · seuil de signifiance des insights · onboarding honnête (supprimer le faux loading) · santé/fraîcheur des connecteurs · états d'échec d'activation.
```

## Prompt 4 — Lot 1 (boucle accro)

```
Lot 1 (§3). Même protocole : plan + auto-audit, mon go, puis exécution item par item, DoD respectée, diffs montrés.
Items : Brief en home · NotificationCenter (cloche + badge + toasts) · feature « À faire » finie (§4.5) · streaming du chat · crochets d'action dans le chat — créer une tâche / un rapport / une veille depuis une réponse (§4.3).
Rappel garde-fou (CLAUDE.md) : différencier par l'action, pas par la parité chat avec Claude.
```

## Prompt 5 — Lot 2 (pro)

```
Lot 2 (§3) : design-system d'états uniformes (EmptyState / LoadingSkeleton / ErrorState / PermissionDenied) puis migration des écrans dessus · fraîcheur des données · mobile responsive testé · recherche globale · affordances chat modernes (§4.3).
Même protocole (plan + auto-audit + go + diffs).
```

## Prompt 6 — Lot 3 (monétisation)

```
Lot 3 (§3) : axe de pricing workspaces × features + gating (ADR-0002) · billing UI Stripe (Checkout + Customer Portal) · entitlements anti-drift + webhooks Stripe idempotents + dunning.
ARRÊTE-TOI avant tout passage en LIVE Stripe ou toute config TVA : signale-moi explicitement ce qui exige ma validation.
Même protocole pour le reste.
```

## Prompt 7 — Lot 4 (confort)

```
Lot 4 (§3) : Cmd+K · édition / snooze / historique des veilles · rapports (templates, destinataires, scheduling, « Mot de l'analyste » généré par l'IA) · team management / API keys / white-label par workspace · serveur MCP exposé (ADR-0005).
Benchmark : laisser en vision, NE PAS implémenter maintenant.
Même protocole.
```

---

## Prompt utilitaire — Reprise après une pause

```
Relis CLAUDE.md et fais le point sur où on en est (git log + branche courante).
Dis-moi le dernier lot terminé et le prochain item à traiter selon docs/cahier-des-charges.md §7.
```

## Prompt utilitaire — Vérifier un verrou avant de passer au lot suivant

```
Avant de passer au lot suivant : re-diagnostique le lot qu'on vient de finir.
Liste ce qui est passé de ❌/🔧 à ✅, ce qui reste en ⚠️/❌, et conclus VERT ou ROUGE (rouge s'il reste un ❌ critique).
```
