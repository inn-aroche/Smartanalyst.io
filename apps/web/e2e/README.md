# E2E tests — Playwright

Smoke tests qui valident que l'app web démarre sans crash et que les
parcours critiques (public + auth-gated redirect) répondent comme prévu.

## Lancer en local

```bash
cd apps/web

# 1. Installer les browsers Playwright (une seule fois)
npm run e2e:install

# 2. Lancer les tests (le dev server vite démarre automatiquement)
npm run e2e

# OU en mode UI (debug interactif)
npm run e2e:ui
```

## Ce qui est couvert (V1)

- **Pages publiques** : `/login`, `/signup`, `/reset-password/request` se chargent
  et exposent un formulaire utilisable.
- **Protected routes** : `/`, `/chat`, `/sources`, `/audit`, `/tasks`, `/veille`,
  `/rapports`, `/settings` redirigent vers `/login` quand non auth.
- **Invite accept** : `/invite/accept` sans token ne crash pas.

Tournent sur **chromium desktop + mobile-safari** (cf. `playwright.config.ts`)
pour garantir le responsive mobile sur les pages publiques.

## Ce qui n'est PAS couvert (backlog)

- Happy path signup → connect GA4 → 1ère question chat → export Excel.
  → Demande une fixture DB Postgres + un mock du backend Resend/Gemini.
  Sera ajouté quand on aura un environnement de test isolé.

## Variables d'environnement

| Var            | Défaut                  | Usage                                           |
| -------------- | ----------------------- | ----------------------------------------------- |
| `E2E_PORT`     | `5173`                  | Port du dev server Vite.                        |
| `E2E_BASE_URL` | `http://localhost:5173` | Surcharge l'URL (e.g. tester un build deployé). |
| `CI`           | (set par GitHub)        | Active retries=1 + reporter HTML.               |

## Ajouter un test

Crée un fichier `*.spec.ts` dans `e2e/`. Pattern :

```ts
import { test, expect } from '@playwright/test'

test('ma feature charge sans erreur', async ({ page }) => {
  await page.goto('/ma-route')
  await expect(page.getByText(/quelque chose/i)).toBeVisible()
})
```
