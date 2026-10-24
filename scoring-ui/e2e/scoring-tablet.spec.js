import { test, expect } from '@playwright/test'

test.describe('Tablet Scoring UAT E2E (US-020)', () => {
  test('verifies 3-column tablet scoring, drag handle reorder (TS13), score pad entry & double-tap delete, and completed match read-only lock (TS9)', async ({ page }) => {
    await page.goto('/#/scoring-tablet')
    await page.getByPlaceholder('your@email.com').fill('tablet@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()

    await page.getByPlaceholder(/Cup name/i).fill('Kupittaa')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByText('TurRes Kupittaa CUP 25.10.2026').click()

    await page.getByText('TurRes Kupittaa Osakilpailu 1').click()
    await page.getByText(/Laina-ase/i).click()

    // Verify 3-column layout and TS13 drag handle (no tiny ▲/▼ arrows)
    await expect(page.getByText('Score Pad')).toBeVisible()
    await expect(page.getByTestId('drag-handle-901')).toBeVisible()
    await expect(page.getByText('▲')).toHaveCount(0)

    // Reorder shooter via drag handle keyboard ArrowDown without changing selected shooter
    const handle901 = page.getByTestId('drag-handle-901')
    await handle901.focus()
    await page.keyboard.press('ArrowDown')

    // Select Teppo Testaaja and add a score via Score Pad
    await page.getByText('2. Teppo Testaaja').click()
    await page.getByRole('button', { name: 'Score 10' }).click()
    const shotButton = page.getByRole('button', { name: /String 1, 10 pts/i })
    await expect(shotButton).toBeVisible()

    // Double-tap shot to delete
    await shotButton.dblclick()
    await expect(shotButton).toHaveCount(0)

    // Navigate via breadcrumb to Match picker and open Completed Match (status: 'cp')
    await page.getByRole('button', { name: /Back: TurRes Kupittaa Osakilpailu 1/i }).click()
    await page.getByText('TurRes Kupittaa Osakilpailu 2 (Valmis)').click()
    await page.getByText(/Laina-ase/i).click()

    await expect(page.getByText('Completed', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Score 10' })).toBeDisabled()
    await expect(page.getByRole('button', { name: /Match Completed/i })).toBeDisabled()
  })
})
