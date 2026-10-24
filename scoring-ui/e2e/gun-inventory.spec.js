import { test, expect } from '@playwright/test'

test.describe('Gun Inventory, Laina-ase Checkout & Maintenance UAT E2E (R90 / US-006)', () => {
  test('adds a gun on #/guns, checks it out with 100 cartridges in #/manage Laina-ase squad, returns it to safe, and records cleaning/maintenance', async ({ page }) => {
    // 1. Login to #/guns as Group 25874 admin
    await page.goto('/#/guns')
    await page.getByPlaceholder('your@email.com').fill('manager@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page.getByText('SSI Ryhmä 25874 (admin)')).toBeVisible()

    // 2. Add a new gun to inventory
    await page.getByRole('button', { name: '+ Lisää ase' }).click()
    await page.getByPlaceholder('esim. CZ').fill('CZ')
    await page.getByPlaceholder('esim. Shadow 2').fill('Shadow 2')
    await page.getByPlaceholder('esim. D482910').fill('SN-9001')
    await page.getByRole('button', { name: 'Tallenna' }).click()

    await expect(page.getByText('CZ Shadow 2')).toBeVisible()
    await expect(page.getByText('Asekaapissa')).toBeVisible()
    await expect(page.getByText('0 kertaa · 0 patr.').first()).toBeVisible()

    // 3. Navigate to #/manage and check out the gun to Matti Meikäläinen in Laina-ase squad with 100 cartridges
    await page.goto('/#/manage')
    await page.getByText('TurRes Kupittaa CUP 25.10.2026').click()

    // Expand Laina-ase (pieni puoli) squad
    await page.getByRole('button', { name: /Laina-ase \(pieni puoli\)/i }).click()
    await page.getByRole('button', { name: 'Valitse ase' }).first().click()

    await expect(page.getByText('Valitse laina-ase ja patruunat')).toBeVisible()
    await page.getByRole('button', { name: /100 patr\./i }).click()
    await page.getByRole('button', { name: 'Merkitse käyttöön' }).click()

    await expect(page.getByText(/Laina-ase: CZ Shadow 2 \(SN-9001\) · 100 patr\./i)).toBeVisible()

    // 4. End of match: return all Laina-ase guns to safe
    await page.getByRole('button', { name: /Palauta kaikki laina-aseet kaappiin \(1\)/i }).click()
    await expect(page.getByText(/Laina-ase: CZ Shadow 2/i)).toHaveCount(0)

    // 5. Return to #/guns, verify usage/cartridge counters (1 kertaa · 100 patr.), and record cleaning/maintenance
    await page.goto('/#/guns')
    await expect(page.getByText('Asekaapissa')).toBeVisible()
    await expect(page.getByText('1 kertaa · 100 patr.').first()).toBeVisible()

    await page.getByRole('button', { name: 'Huolto / Puhdistus' }).click()
    await page.getByPlaceholder(/Huomiot/i).fill('Puhdistus ja voitelu')
    await page.getByRole('button', { name: 'Kuittaa huolletuksi' }).click()

    // Wait for maintenance reset (0 kertaa · 0 patr.) first, then verify total usage remains 1 kertaa · 100 patr.
    await expect(page.getByText('0 kertaa · 0 patr.')).toBeVisible()
    await expect(page.getByText('1 kertaa · 100 patr.')).toBeVisible()
  })
})
