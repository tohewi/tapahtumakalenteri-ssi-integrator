import { test, expect } from '@playwright/test'

test.describe('Registration & Cup Management UAT E2E (US-021)', () => {
  test('completes public cup registration flow (#/register) with math captcha and SSI password', async ({ page }) => {
    await page.goto('/#/register')

    const questionText = await page.locator('text=/\\d+\\s*\\+\\s*\\d+\\s*=\\s*\\?/').textContent()
    const match = questionText.match(/(\d+)\s*\+\s*(\d+)/)
    const answer = String(Number(match[1]) + Number(match[2]))

    await page.getByPlaceholder('Vastaus').fill(answer)
    await page.getByRole('button', { name: 'Jatka' }).click()

    await page.getByText('TurRes Kupittaa CUP 25.10.2026').click()
    await page.getByText('Laina-ase (pieni puoli)').click()

    await page.getByPlaceholder('nimi@esimerkki.fi').fill('matti.meikalainen@example.com')
    await page.getByPlaceholder(/SSI-salasana/i).fill('valid-password')
    await page.getByRole('button', { name: 'Ilmoittaudu' }).click()

    await expect(page.getByText(/Ilmoittautuminen onnistui|Squad päivitetty/i)).toBeVisible({ timeout: 10000 })
  })

  test('verifies ManagePage squadding overview, SquadPickerSheet full-squad capacity guard (R76-CUP1), and DNS dialog (CUP2)', async ({ page }) => {
    await page.goto('/#/manage')
    await page.getByPlaceholder('your@email.com').fill('manager@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()

    await page.getByText('TurRes Kupittaa CUP 25.10.2026').click()
    await expect(page.getByText('Outi Odottaja')).toBeVisible()

    // Open SquadPickerSheet on unsquadded shooter Outi Odottaja
    await page.getByRole('button', { name: /→ S\?|Move squad/i }).first().click()

    // Verify Squad 2 (1/1) in SquadPickerSheet is disabled
    const dialog = page.locator('.fixed.inset-0')
    await expect(dialog.getByRole('button', { name: /Oma ase 1/i })).toBeDisabled()

    // Close SquadPickerSheet
    await page.getByRole('button', { name: /Cancel|Peruuta/i }).click()

    // Open DNS confirmation dialog and cancel
    await page.getByRole('button', { name: /Outi Odottaja:.*DNS/i }).click()
    await expect(page.getByText('Set Outi Odottaja as DNS?')).toBeVisible()
    await page.getByRole('button', { name: /Cancel|Peruuta/i }).click()
  })
})
