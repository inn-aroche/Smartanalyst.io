// Visual regression — cahier 22c verdict format.
//
// Le playground rend les 4 patterns avec des fixtures statiques. Ce test
// se balade sur la page, attend que chaque section soit visible, screenshot
// chaque pattern individuellement + la page entiere pour archivage.
//
// Sorties : test-results/verdict-*.png. Sert de baseline pour le visual
// regression manuel (pas de tolerance pixel auto pour l'instant).

import { test, expect } from '@playwright/test'

// Override executablePath quand on tourne dans un env oa la version pinnee
// de Playwright ne correspond pas au browser pre-installe (ex: container
// Hostinger). En CI ou local classique, l'env var n'est pas set et on
// retombe sur le comportement par defaut.
test.use({
  launchOptions: process.env.E2E_CHROMIUM_PATH
    ? { executablePath: process.env.E2E_CHROMIUM_PATH }
    : {},
})

const PATTERNS = ['campaigns', 'journey', 'benchmark', 'unavailable'] as const

test.describe('Verdict playground — visual fixtures (DEV-only route)', () => {
  test('rend les 4 patterns + screenshot chacun', async ({ page }) => {
    await page.goto('/dev/verdict-playground')

    // Attend l'h1 pour confirmer que la page DEV est bien servie.
    await expect(page.getByRole('heading', { name: /Verdict playground/i })).toBeVisible()

    for (const pattern of PATTERNS) {
      const section = page.getByTestId(`verdict-${pattern}`)
      await expect(section).toBeVisible()
      // Screenshot de la section seule, plus utile qu'une viewport entiere.
      await section.screenshot({ path: `test-results/verdict-${pattern}.png` })
    }

    // Capture pleine page pour archivage / partage rapide.
    await page.screenshot({ path: 'test-results/verdict-all.png', fullPage: true })
  })
})
