import { test, expect } from '@playwright/test'

test.use({ locale: 'fi-FI' })

test.describe('Smoke & Legal Pages E2E (US-018)', () => {
  test('loads HomePage (#/) and navigates to Privacy Policy (#/privacy) and Terms (#/terms)', async ({ page }) => {
    await page.goto('/#/')
    await expect(page.getByText('SSI apurit')).toBeVisible()

    await page.getByRole('link', { name: /Tietosuojaseloste/i }).click()
    await expect(page).toHaveURL(/#\/privacy$/)
    await expect(page.getByText(/Rekisterinpitäjä ja tarkoitus/i)).toBeVisible()

    await page.getByRole('link', { name: /Käyttöehdot/i }).click()
    await expect(page).toHaveURL(/#\/terms$/)
    await expect(page.getByText(/Palvelun käyttö/i)).toBeVisible()
  })
})
