// ============================================================
// UAT: Accept an invitation
//
// Flow:
//   1. Owner creates an invitation via API → get token from response
//      (no real email needed — token extracted from JSON response)
//   2. Invitee navigates to /#/platform/invite/{token}
//   3. JoinInvitePage loads and shows the tenant name + invited email
//   4. Invitee fills in their name and password and submits
//   5. Account is created and invitee is immediately in the tenant dashboard
//
// Email bypass:
//   The invitation token is returned in the POST response body:
//     POST /api/v1/platform/tenants/:id/invitations
//     → { success: true, invitation: { token: "…", … } }
//   The test constructs the accept URL from this token, bypassing email
//   delivery entirely.  This works whether or not RESEND_API_KEY is set.
//
// Cleanup: The new member is removed from the tenant after the test.
//
// Required env vars:
//   PLATFORM_EMAIL    - Owner account email
//   PLATFORM_PASSWORD - Owner account password
// ============================================================

import { test, expect } from '@playwright/test'
import {
  apiSignIn,
  apiGetFirstTenantId,
  apiCreateInvitation,
  apiRemoveMember,
  testEmail,
} from '../fixtures/platform-api.js'

const OWNER_EMAIL = process.env.PLATFORM_EMAIL
const OWNER_PASSWORD = process.env.PLATFORM_PASSWORD

test.beforeAll(() => {
  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    throw new Error('Set PLATFORM_EMAIL and PLATFORM_PASSWORD env vars before running UAT tests.')
  }
})

test('invitee can accept invitation and create account without email delivery', async ({
  page,
  request,
}) => {
  // ── Step 1: Owner creates invitation via API ───────────────────────────
  const ownerSid = await apiSignIn(request, OWNER_EMAIL, OWNER_PASSWORD)
  const tenantId = await apiGetFirstTenantId(request, ownerSid)

  const inviteeEmail = testEmail('invitee')
  const { token } = await apiCreateInvitation(request, ownerSid, tenantId, inviteeEmail)

  // We now have the invitation token without needing to read any mailbox.
  expect(token).toBeTruthy()

  // Track the new member for cleanup
  let newMemberId = null

  try {
    // ── Step 2: Invitee navigates directly to the invitation URL ──────────
    await page.goto(`/#/platform/invite/${token}`)

    // ── Step 3: JoinInvitePage renders ────────────────────────────────────
    // The page should show the invited email and a form to set up an account
    await expect(page.getByText(inviteeEmail)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/create.*account|set up|join/i)).toBeVisible()

    // ── Step 4: Invitee fills in name + password ──────────────────────────
    const inviteeName = 'UAT Invited User'
    const inviteePassword = 'InviteUAT999!'

    await page.getByLabel(/full name/i).fill(inviteeName)
    await page.getByLabel(/password/i).fill(inviteePassword)

    await page.getByRole('button', { name: /create account.*join|join/i }).click()

    // ── Step 5: Invitee lands on dashboard ────────────────────────────────
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 20_000 })

    // ── Find the new member ID for cleanup ────────────────────────────────
    const freshSid = await apiSignIn(request, OWNER_EMAIL, OWNER_PASSWORD)
    const membersRes = await request.get(`/api/v1/platform/tenants/${tenantId}/members`, {
      headers: { Cookie: `platform_sid=${freshSid}` },
    })
    const membersBody = await membersRes.json()
    const found = (membersBody.members || []).find(m => m.accountEmail === inviteeEmail)
    newMemberId = found?.memberId || null
  } finally {
    // Cleanup: remove the test member from the tenant
    if (newMemberId) {
      const cleanupSid = await apiSignIn(request, OWNER_EMAIL, OWNER_PASSWORD)
      await apiRemoveMember(request, cleanupSid, tenantId, newMemberId)
    }
  }
})

test('invitation page shows error for expired or invalid token', async ({ page }) => {
  await page.goto('/#/platform/invite/invalid-token-uat-test')

  await expect(
    page.getByText(/not found|expired|invalid|error/i),
  ).toBeVisible({ timeout: 15_000 })
})
