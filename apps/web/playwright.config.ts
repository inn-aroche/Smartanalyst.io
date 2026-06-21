// Playwright config — smoke tests E2E pour l'app web.
//
// USAGE (depuis apps/web/) :
//   1. Demarrer le dev server : npm run dev (port 5173)
//   2. Dans un autre terminal : npm run e2e
//
// CI : pas branche pour l'instant (besoin d'une DB fixture + API mockable).
// Ces smoke tests garantissent qu'aucune regression critique ne casse les
// pages publiques + protected-routes (redirect /login). Les vrais tests
// happy-path (signup → connect → chat → upgrade) demanderont une fixture
// DB et un mock du backend — backlog.

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 5173)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Timeout par test : 30s suffit largement pour le smoke. Les tests
  // qui auraient besoin de plus declareront leur propre `test.setTimeout()`.
  timeout: 30 * 1000,
  // 1 retry en CI pour absorber le flakiness reseau ; 0 en local pour
  // detecter les vrais bugs plutot que de les masquer.
  retries: process.env.CI ? 1 : 0,
  // Pas de parallelisation par defaut — les tests partagent localStorage
  // donc on les serialise pour eviter les races.
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL: BASE_URL,
    // Capture trace + screenshot uniquement sur echec pour ne pas alourdir.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Pas de fail-fast sur "console errors" : la page peut emettre des
    // warnings React dev qu'on ne veut pas faire echouer le smoke.
  },

  // Auto-demarrer le dev server si pas deja up. Pratique en local + CI.
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile WebKit pour valider le responsive du chat / settings.
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
})
