// Smoke tests E2E — verifie que les pages publiques + les protected-routes
// repondent correctement sans crasher. Tournent sans backend (les pages
// auth-protected redirigent vers /login, le smoke valide ce comportement).

import { test, expect } from '@playwright/test'

test.describe('Pages publiques', () => {
  test('/login se charge et expose un formulaire utilisable', async ({ page }) => {
    await page.goto('/login')
    // Le H1 ou le bouton "Login" doit etre visible. On accepte l'un OU l'autre
    // pour ne pas dependre du wording exact (l'i18n est dynamique).
    await expect(page.getByRole('button', { name: /sign in|connexion|se connecter/i }).first()).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('/signup se charge et expose un formulaire', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('/reset-password/request se charge', async ({ page }) => {
    await page.goto('/reset-password/request')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })
})

test.describe('Protected routes — redirect /login quand non auth', () => {
  // ProtectedRoute renvoie un <Navigate to="/login" replace> si !isAuthenticated.
  // On verifie que chacune des routes critiques bascule bien sur /login plutot
  // que d'afficher un blanc ou un crash.
  const protectedRoutes = [
    { path: '/', name: 'Home (Brief)' },
    { path: '/chat', name: 'Chat' },
    { path: '/sources', name: 'Sources' },
    { path: '/audit', name: 'Audit' },
    { path: '/tasks', name: 'Tasks' },
    { path: '/veille', name: 'Veille' },
    { path: '/rapports', name: 'Reports' },
    { path: '/settings', name: 'Settings' },
  ]

  for (const { path, name } of protectedRoutes) {
    test(`${name} (${path}) → redirige vers /login`, async ({ page }) => {
      await page.goto(path)
      // ProtectedRoute affiche un "Loading…" pendant que l'auth state se charge,
      // puis bascule. On attend que l'URL devienne /login.
      await page.waitForURL(/\/login/, { timeout: 5000 })
      expect(page.url()).toMatch(/\/login/)
    })
  }
})

test.describe('Invite accept page', () => {
  test('/invite/accept sans token → page se charge sans crash', async ({ page }) => {
    // L'user non-auth est redirige vers /login (cf. InviteAccept useEffect).
    await page.goto('/invite/accept')
    await page.waitForURL(/\/login|\/invite/, { timeout: 5000 })
    // Pas de "Uncaught Error" en console.
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })
})
