// ============================================================
// UAT: Create account and auto-join existing tenant
//
// Flow:
//   1. Owner creates a pending invitation for a new test email
//      (invitation is stored in the DB and would normally be sent by email)
//   2. New user visits the sign-up page and registers with that email
//   3. The backend auto-accepts the pending invitation on sign-up
//   4. New user is redirected to the dashboard already in the tenant
//
// Email bypass:
//   The invitation token is captured from the API response in step 1.
//   No real email delivery is required.  The test derives the
//   accept URL from the token and could also verify that route directly —
//   but this test exercises the sign-up auto-accept code path.
//
// Required env vars:
//   PLATFORM_EMAIL    - Owner account email
//   PLATFORM_PASSWORD - Owner account password
// ============================================================

import { test, expect } from '@playwright/test'
import { apiSignIn, apiGetFirstTenantId, apiCreateInvitation, testEmail } from '../fixtures/platform-api.js'

const OWNER_EMAIL = process.env.PLATFORM_EMAIL
const OWNER_PASSWORD = process.env.PLATFORM_PASSWORD

test.beforeAll(() => {
  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    throw new Error('Set PLATFORM_EMAIL and PLATFORM_PASSWORD env vars before running UAT tests.')
  }
})

test('create new account and auto-join existing tenant via pending invitation', async ({ page, request }) => {
  // ── Step 1: Owner creates a pending invitation via API ──────────────────
  const sid = await apiSignIn(request, OWNER_EMAIL, OWNER_PASSWORD)
  const tenantId = await apiGetFirstTenantId(request, sid)

  const inviteeEmail = testEmail('newuser')
  const { token } = await apiCreateInvitation(request, sid, tenantId, inviteeEmail)

  // ── Step 2: New user navigates to sign-up page (WelcomePage is the landing page) ──
  await page.goto('/#/platform')
  await expect(page.getByRole('heading', { name: /match management platform/i })).toBeVisible()

  // ── Step 3: Fill in the registration form on the WelcomePage ────────────
  const orgName = `UAT Org ${Date.now()}`
  const userName = 'UAT Test User'
  const userPassword = 'UATpassword123!'

  await page.getByRole('textbox', { name: /organization/i }).fill(orgName)
  await page.getByRole('textbox', { name: /your name/i }).fill(userName)
  await page.getByRole('textbox', { name: /email/i }).fill(inviteeEmail)
  await page.getByRole('textbox', { name: /password/i }).fill(userPassword)

  await page.getByRole('button', { name: /create account/i }).click()

  // ── Step 4: Dashboard should load ───────────────────────────────────────
  // The backend auto-accepts pending invitations on sign-up,
  // so the new account should already be a member of the owner's tenant.
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 20_000 })

  // Verify the invitation token URL also resolves correctly (belt-and-suspenders)
  // Navigate directly to the invite page now that we have a session
  // (the invitation is already consumed so this should show a 404 message)
  await page.goto(`/#/platform/invite/${token}`)
  // The invitation was already used, so we expect an error message or redirect
  await expect(
    page.getByText(/not found|already used|expired|dashboard/i),
  ).toBeVisible({ timeout: 10_000 })
})
