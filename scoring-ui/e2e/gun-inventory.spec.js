import { test, expect } from '@playwright/test'

test.use({ locale: 'fi-FI' })

test.describe('Gun & Ammo Inventory, Laina-ase Checkout, Undo & Maintenance UAT E2E (R90)', () => {
  test('manages ammo (#/ammo) & guns (#/guns), checks out & undoes loan in #/manage, returns to safe, records maintenance, and retires/restores gun', async ({ page }) => {
    // 1. Login to #/ammo as Group 25874 admin and add CCI Standard Velocity (.22 LR) purchase + whole-inventory stocktake
    await page.goto('/#/ammo')
    await page.getByPlaceholder('your@email.com').fill('manager@example.com')
    await page.getByPlaceholder('SSI password').fill('valid-password')
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page.getByText('SSI Ryhmä 25874 (admin)')).toBeVisible()
    await page.getByRole('button', { name: '+ Lisää patruunaosto' }).click()
    await page.getByPlaceholder(/esim\. CCI/i).fill('CCI')
    await page.getByPlaceholder(/esim\. Standard Velocity/i).fill('Standard Velocity')
    await page.getByRole('button', { name: 'Tallenna osto' }).click()

    await expect(page.getByText('CCI Standard Velocity')).toBeVisible()
    await expect(page.getByText('1000 patr.').first()).toBeVisible()

    // Whole-inventory stocktake on #/ammo
    await page.getByRole('button', { name: 'Inventointi' }).click()
    await page.getByLabel(/Todellinen määrä CCI Standard Velocity/i).fill('950')
    await page.getByRole('button', { name: 'Vahvista inventointi' }).click()
    await expect(page.getByText(/Viimeisin inventointi:/i)).toBeVisible()
    await expect(page.getByText('-50 patr.')).toBeVisible()

    // 2. Navigate to #/guns and add a new gun linked to CCI Standard Velocity (.22 LR)
    await page.goto('/#/guns')
    await page.getByRole('button', { name: '+ Lisää ase' }).click()
    await page.getByPlaceholder(/esim\. CZ/i).fill('CZ')
    await page.getByPlaceholder(/esim\. Shadow 2/i).fill('Shadow 2')
    await page.getByPlaceholder(/esim\. D482910/i).fill('SN-9001')
    await page.getByRole('button', { name: 'Tallenna' }).click()

    await expect(page.getByText('CZ Shadow 2')).toBeVisible()
    await expect(page.getByText('Asekaapissa')).toBeVisible()
    await expect(page.getByText('0 kertaa · 0 patr.').first()).toBeVisible()

    // 3. Navigate to #/manage, check out gun with 100 cartridges, test Undo (Peru lainaus), then re-checkout
    await page.goto('/#/manage')
    await page.getByText('TurRes Kupittaa CUP 25.10.2026').click()

    await page.getByRole('button', { name: /Laina-ase \(pieni puoli\)/i }).click()
    await page.getByRole('button', { name: 'Valitse ase' }).first().click()

    await expect(page.getByText('Valitse laina-ase ja patruunat')).toBeVisible()
    await page.getByRole('button', { name: /100 patr\./i }).click()
    await page.getByRole('button', { name: 'Merkitse käyttöön' }).click()

    await expect(page.getByText(/Laina-ase: CZ Shadow 2 \(SN-9001\) · 100 patr\./i)).toBeVisible()

    // Undo loan (Peru lainaus) -> badge disappears, gun returns to safe, ammo stock restored
    await page.getByRole('button', { name: 'Peru lainaus' }).click()
    await expect(page.getByText(/Laina-ase: CZ Shadow 2/i)).toHaveCount(0)

    // Re-checkout gun with 100 cartridges and then bulk return all Laina-ase guns to safe
    await page.getByRole('button', { name: 'Valitse ase' }).first().click()
    await page.getByRole('button', { name: 'Merkitse käyttöön' }).click()
    await expect(page.getByText(/Laina-ase: CZ Shadow 2 \(SN-9001\) · 100 patr\./i)).toBeVisible()

    await page.getByRole('button', { name: /Palauta kaikki laina-aseet kaappiin \(1\)/i }).click()
    await expect(page.getByText(/Laina-ase: CZ Shadow 2/i)).toHaveCount(0)

    // 4. Return to #/guns, verify usage/cartridge counters (1 kertaa · 100 patr.), record maintenance, and test Poista + Palauta asekaappiin
    await page.goto('/#/guns')
    await expect(page.getByText('Asekaapissa')).toBeVisible()
    await expect(page.getByText('1 kertaa · 100 patr.').first()).toBeVisible()

    await page.getByRole('button', { name: 'Huolto / Puhdistus' }).click()
    await page.getByPlaceholder(/Huomiot/i).fill('Puhdistus ja voitelu')
    await page.getByRole('button', { name: 'Kuittaa huolletuksi' }).click()

    await expect(page.getByText('0 kertaa · 0 patr.')).toBeVisible()
    await expect(page.getByText('1 kertaa · 100 patr.')).toBeVisible()

    // Retire gun ("Poista") -> hidden by default, visible when "Näytä käytöstä poistetut" is checked, then restore ("Palauta asekaappiin")
    await page.getByRole('button', { name: 'Poista' }).click()
    await expect(page.getByText('CZ Shadow 2')).toHaveCount(0)
    await page.getByLabel('Näytä käytöstä poistetut').check()
    await expect(page.getByText('Poistettu käytöstä')).toBeVisible()
    await page.getByRole('button', { name: 'Palauta asekaappiin' }).click()
    await expect(page.getByText('Asekaapissa')).toBeVisible()
  })
})
