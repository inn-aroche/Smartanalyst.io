# ADR-0004 — Stack : SmartAnalyst (React + Gemini défaut / Claude approfondi) + UX « Rapide / Approfondi »

- **Statut :** Accepté
- **Date :** 2026-06-19
- **Remplace :** les specs stack de ReportFlow (vanilla JS / Claude-only / node-cron)

## Contexte

Specs contradictoires : ReportFlow (front *vanilla HTML/JS*, IA *Claude*, scheduler *node-cron*) vs SmartAnalyst (front *React 18 + Vite + Tailwind*, IA *Gemini 2.5 Flash*, *BullMQ + Redis*). Décision tranchée : **« c'est SmartAnalyst aujourd'hui »**.

## Décision

**Stack canonique = SmartAnalyst.**

- **Frontend :** React 18 + Vite + TailwindCSS + React Query + react-router. (App à état riche : chat streaming, notifications, brief — le vanilla JS combattrait ce besoin.)
- **Backend :** Node 20 + Express + **BullMQ + Redis** + PM2 (remplace node-cron).
- **Base de données :** Supabase (Postgres + Auth + Vault + RLS).
- **IA :** **Gemini 2.5 Flash par défaut** (≈ 10× moins cher, suffisant pour ~90 % des questions marketing), **derrière une abstraction provider** permettant de router vers **Claude** pour l'analyse approfondie.
- **UX modèle côté utilisateur = toggle « Rapide / Approfondi »** (cadrage *bénéfice*) qui route Gemini Flash ↔ Claude sous le capot. **Pas** de sélecteur brut « Gemini vs Claude » dans l'UI principale ; le nom des modèles n'apparaît qu'en réglages avancés/power-user si vraiment nécessaire.

## Conséquences

**Positives**
- Une stack cohérente et unique → Claude Code peut construire sans ambiguïté.
- Coût maîtrisé par défaut, avec une **porte de sortie qualité** (Claude pour le complexe).
- UX qui respecte la persona non-experte (zéro fuite d'implémentation).

**Négatives / à assumer**
- L'abstraction provider ajoute une fine couche (justifiée).
- Deux providers → **monitoring des coûts IA (FinOps) + rate limiting** indispensables.
- Abandonne définitivement les chemins vanilla-JS / Claude-only / node-cron de ReportFlow.

## Alternatives écartées

- **Vanilla HTML/JS** — rejeté : combat un produit à état riche.
- **Gemini-only sans porte de sortie** — possible si on veut simplifier, mais rejeté par défaut pour préserver l'option qualité.
- **Sélecteur de modèle brut dans l'UI** — rejeté au regard de la persona (décision actée ici).
