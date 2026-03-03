// ============================================================
// UAT: Invite an instructor
//
// Flow (UI-driven):
//   1. Owner signs in via the UI
//   2. Navigates to the Members page of their tenant
//   3. Opens the "Invite Member" modal
//   4. Enters a test email and confirms the Instructor role is selected
//   5. Submits the form
//   6. Verifies the invitation appears in the pending-invitations table
//
// Cleanup: The test revokes the invitation via API after the assertions
// so the pending invitation does not pollute subsequent test runs.
//
// Required env vars:
//   PLATFORM_EMAIL    - Owner account email
//   PLATFORM_PASSWORD - Owner account password
// ============================================================

import { test, expect } from '@playwright/test'
import { apiSignIn, apiGetFirstTenantId, testEmail, apiRevokeInvitation } from '../fixtures/platform-api.js'

const OWNER_EMAIL = process.env.PLATFORM_EMAIL
const OWNER_PASSWORD = process.env.PLATFORM_PASSWORD

test.beforeAll(() => {
  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    throw new Error('Set PLATFORM_EMAIL and PLATFORM_PASSWORD env vars before running UAT tests.')
  }
})

test('owner can invite an instructor from the Members page', async ({ page, request }) => {
  const inviteeEmail = testEmail('instructor')

  // Keep track of invitation ID for cleanup
  let invitationId = null

  try {
    // ── Step 1: Sign in via UI ────────────────────────────────────────────
    await page.goto('/#/platform')
    // WelcomePage is the landing page — click header "Sign in" to switch to SignInPage
    await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

    await page.getByRole('textbox', { name: /email/i }).fill(OWNER_EMAIL)
    await page.getByRole('textbox', { name: /password/i }).fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 20_000 })

    // ── Step 2: Navigate to Members page ─────────────────────────────────
    // Use the sidebar/navigation link
    await page.getByRole('link', { name: /members/i }).click()
    await expect(page.getByRole('heading', { name: /members/i })).toBeVisible({ timeout: 10_000 })

    // ── Step 3: Open invite modal ─────────────────────────────────────────
    await page.getByRole('button', { name: /invite member/i }).click()
    await expect(page.getByRole('heading', { name: /invite member/i })).toBeVisible()

    // ── Step 4: Fill in the invite form ──────────────────────────────────
    await page.getByRole('textbox', { name: /email address/i }).fill(inviteeEmail)

    // Verify the Instructor checkbox is checked by default.
    // There is exactly one checkbox labelled "Instructor" in this modal;
    // the strict (no .first()) locator intentionally fails if duplicates appear.
    const instructorCheckbox = page.getByRole('checkbox', { name: /^instructor$/i })
    await expect(instructorCheckbox).toBeChecked()

    // ── Step 5: Submit ────────────────────────────────────────────────────
    await page.getByRole('button', { name: /send invitation/i }).click()

    // Modal should close
    await expect(page.getByRole('heading', { name: /invite member/i })).not.toBeVisible({ timeout: 10_000 })

    // ── Step 6: Invitation should appear in pending table ─────────────────
    await expect(page.getByText(inviteeEmail)).toBeVisible({ timeout: 10_000 })

    // Capture invitation ID for cleanup via API
    const sid = await apiSignIn(request, OWNER_EMAIL, OWNER_PASSWORD)
    const tenantId = await apiGetFirstTenantId(request, sid)
    const listRes = await request.get(`/api/v1/platform/tenants/${tenantId}/invitations`, {
      headers: { Cookie: `platform_sid=${sid}` },
    })
    const listBody = await listRes.json()
    const found = (listBody.invitations || []).find(inv => inv.email === inviteeEmail)
    invitationId = found?.id || null
  } finally {
    // Cleanup: revoke the invitation to keep the DB clean
    if (invitationId) {
      const sid = await apiSignIn(request, OWNER_EMAIL, OWNER_PASSWORD)
      const tenantId = await apiGetFirstTenantId(request, sid)
      await apiRevokeInvitation(request, sid, tenantId, invitationId)
    }
  }
})
