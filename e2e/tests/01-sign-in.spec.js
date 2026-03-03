// ============================================================
// UAT: Sign-in (existing user)
//
// Verifies that a platform owner can sign in via the UI and
// reaches the dashboard.
//
// Required env vars:
//   PLATFORM_EMAIL    - Owner account email
//   PLATFORM_PASSWORD - Owner account password
// ============================================================

import { test, expect } from '@playwright/test'

const EMAIL = process.env.PLATFORM_EMAIL
const PASSWORD = process.env.PLATFORM_PASSWORD

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Set PLATFORM_EMAIL and PLATFORM_PASSWORD env vars before running UAT tests.',
    )
  }
})

test('sign in with existing owner account', async ({ page }) => {
  // Navigate to the platform section (lands on WelcomePage)
  await page.goto('/#/platform')

  // Click the header "Sign in" link to switch to SignInPage
  await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click()

  // The sign-in page should appear
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

  // Fill in credentials
  await page.getByRole('textbox', { name: /email/i }).fill(EMAIL)
  await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD)

  // Submit
  await page.getByRole('button', { name: /sign in/i }).click()

  // Dashboard should load — look for a heading that indicates we are in
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 20_000 })
})

test('sign-in form shows error for wrong password', async ({ page }) => {
  await page.goto('/#/platform')

  // Click the header "Sign in" link to switch to SignInPage
  await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

  await page.getByRole('textbox', { name: /email/i }).fill(EMAIL)
  await page.getByRole('textbox', { name: /password/i }).fill('wrong-password-uat')

  await page.getByRole('button', { name: /sign in/i }).click()

  // An error message should appear (no redirect to dashboard)
  await expect(page.getByText(/invalid|incorrect|wrong password|error/i)).toBeVisible({ timeout: 10_000 })
  // Dashboard heading must NOT appear
  await expect(page.getByRole('heading', { name: /dashboard/i })).not.toBeVisible()
})
