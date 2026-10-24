import { test, expect } from '@playwright/test'

test.describe('Authentication & Session Lifecycle UAT (AUTH-UAT-01..08 / US-019)', () => {
  test('AUTH-UAT-01 & 02: Fresh login to #/scoring and reload with valid session preserves view without login flash', async ({ page }) => {
    await page.goto('/#/scoring')
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()

    await page.getByPlaceholder('your@email.com').fill('scorer@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page.getByText('Search for a cup to start scoring')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Search for a cup to start scoring')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Login' })).toHaveCount(0)
  })

  test('AUTH-UAT-03 & 04: Reload without session shows Login with Remember Me prefilled and never auto-submits', async ({ page, context }) => {
    await page.goto('/#/scoring')
    await page.getByPlaceholder('your@email.com').fill('remembered@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByText('Search for a cup to start scoring')).toBeVisible()

    await context.clearCookies()
    await page.reload()

    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
    await expect(page.getByPlaceholder('your@email.com')).toHaveValue('remembered@example.com')
  })

  test('AUTH-UAT-05, 06, 07 & 08: Scope isolation between scoring and manage, and explicit logout persistence', async ({ page }) => {
    await page.goto('/#/scoring')
    await page.getByPlaceholder('your@email.com').fill('scorer@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByText('Search for a cup to start scoring')).toBeVisible()

    // AUTH-UAT-07: Navigating to #/manage with a scoring-scoped session requires manage login
    await page.goto('/#/manage')
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()

    // Login to #/manage with manage scope
    await page.getByPlaceholder('your@email.com').fill('manager@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByText('TurRes Kupittaa CUP 25.10.2026')).toBeVisible()

    // AUTH-UAT-08: Explicit logout clears session and stays on Login after reload
    await page.getByRole('button', { name: /Sign out|Kirjaudu ulos|Logout/i }).click()
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  })
})
