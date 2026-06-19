# ADR-0003 — Positionnement & moat : le copilote qui agit, géographie-agnostique

- **Statut :** Accepté
- **Date :** 2026-06-19
- **Lié à :** ADR-0001 (persona), ADR-0004 (UX modèle), cahier des charges §4 (garde-fou)

## Contexte

Deux faits changent le positionnement :

1. **L'IA conversationnelle marketing est devenue une commodité (2026).** AgencyAnalytics expose Ask AI, AI Summary, Forecasting, Anomaly Detection et un serveur MCP ; Supermetrics et Dataslayer shippent MCP vers Claude/ChatGPT. L'ancien argument « l'IA en français, eux n'en ont pas » est **faux** aujourd'hui.
2. **Ambition internationale (US potentiellement premier marché).** Le moat ne doit donc pas être une logique de **localisation France/EU** qui plafonne la géographie.

## Décision

Positionnement = **« le copilote marketing qui agit »**. Pas « une IA qui répond à des questions » (commodité), mais « une IA qui te dit quoi faire et t'aide à le faire ».

**Trois piliers de moat, tous géographie-agnostiques :**

1. **La boucle vers l'action** — insight → reco → tâche → fait. Personne ne la ferme, US compris. C'est la tête du positionnement.
2. **IA incluse dans tous les plans** — vs gatée (≈ 179 $+ chez AgencyAnalytics). Argument de packaging mondial.
3. **Gouvernance de la donnée** — hébergement EU, donnée **jamais renvoyée à un LLM tiers** — formulée comme une **feature de confiance universelle** (vendable aux US aussi), **pas** comme une conformité réglementaire française.

**Signatures :**
- EN — tagline « From data to decision to done. »
- FR — tagline « De la donnée à la décision, de la décision à l'action. »
- On supprime « dont on a besoin » (faible) et le doublon « data analyste ».

## Conséquences

**Positives**
- Une différenciation qui survit à la commoditisation et qui **voyage** à l'international.
- L'hébergement EU devient un **atout de vente mondial** au lieu d'un particularisme.

**Négatives / à assumer**
- Le produit doit être **English-first / vraiment bilingue dès J1** : l'i18n devient **structurelle**, pas un confort (remonté en priorité dans le cahier des charges).
- La copy abandonne le « badge RGPD » pour le cadrage « ta donnée reste gouvernée ».
- **Garde-fou d'ingénierie :** l'énergie reste sur la boucle d'action, pas sur la course à parité avec Claude sur le chat générique (cf. §4 du cahier des charges).

**Ouvert (hors de cet ADR)**
- La **tête de pont go-to-market (EU vs US)** est une décision *commerciale* distincte, volontairement non figée ici. Le positionnement reste global quel que soit le choix.

## Alternatives écartées

- **« L'IA en français / RGPD » comme moat** — rejeté : plafonne la géographie, n'est pas le vrai fossé, et le cadrage est déjà commoditisé.
- **« Une meilleure IA conversationnelle »** — rejeté : commodité, affrontement frontal avec Claude/ChatGPT et les incumbents.
