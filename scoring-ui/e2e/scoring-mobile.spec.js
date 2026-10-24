import { test, expect } from '@playwright/test'

test.describe('Mobile Scoring UAT E2E (US-020)', () => {
  test('completes cup search, match & squad selection, 2x double series toggle, and score submission', async ({ page }) => {
    await page.goto('/#/scoring')
    await page.getByPlaceholder('your@email.com').fill('scorer@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()

    await page.getByPlaceholder(/Cup name/i).fill('Kupittaa')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByText('TurRes Kupittaa CUP 25.10.2026').click()

    await page.getByText('TurRes Kupittaa Osakilpailu 1').click()
    await page.getByText(/Laina-ase/i).click()

    await expect(page.getByText('Matti Meikäläinen')).toBeVisible()
    await expect(page.getByText('Teppo Testaaja')).toBeVisible()

    // Toggle 2x double series mode on and back off
    const doubleToggle = page.locator('input[type="checkbox"]')
    await doubleToggle.check()
    await expect(page.getByRole('button', { name: /S1\+2/ })).toBeVisible()
    await doubleToggle.uncheck()

    // Select Teppo Testaaja and enter 5 hits in Series 1
    await page.getByText('Teppo Testaaja').click()
    const increase10 = page.getByRole('button', { name: 'Increase 10' })
    for (let i = 0; i < 5; i++) {
      await increase10.click()
    }

    await page.getByRole('button', { name: /Save → Next shooter|Tallenna/i }).click()
    await expect(page.getByText('Matti Meikäläinen')).toBeVisible()
  })
})
