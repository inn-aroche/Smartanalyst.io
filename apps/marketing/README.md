# @smartanalyst/marketing

Site marketing statique pour SmartAnalyst.io — propulsé par [Astro](https://astro.build).

## Déploiement

Output statique (`output: 'static'` dans `astro.config.mjs`). `npm run build` génère `dist/`, qui est uploadé sur l’hébergement Cloud Hostinger (smartanalyst.io).

## Source de vérité partagée

Les prix, plans et features viennent de `@smartanalyst/shared/pricing` et `@smartanalyst/shared/features`. **Ne pas dupliquer** ces valeurs ici — modifier le package partagé et tout se met à jour partout (vitrine, app, API).

## Dev local

```bash
# Depuis la racine du monorepo :
npm install
npm run dev:marketing
```

Le serveur dev tourne sur http://localhost:4321 par défaut.

## Pages prévues (squelettes vides aujourd’hui)

- `/` — landing
- `/product` — détail produit
- `/pricing` — grille tarifaire (déjà câblée sur `@smartanalyst/shared`)
- `/securite` — sécurité & RGPD

## Workflow de déploiement

Voir `.github/workflows/deploy-marketing.yml`. Trigger automatique sur push touchant `apps/marketing/**`. Path Hostinger lu depuis le secret `HOSTINGER_DEPLOY_PATH` (à ne PAS confondre avec `HOSTINGER_WEB_DEPLOY_PATH`, utilisé par l'app `app.smartanalyst.io`).
