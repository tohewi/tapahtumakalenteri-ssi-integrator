// ============================================================
// Platform API helpers for Playwright UAT tests
//
// These helpers call the backend REST API directly (via Playwright's
// APIRequestContext) so that tests can:
//   - Sign in / sign out without going through the UI
//   - Create invitation tokens and bypass real email delivery
//   - Clean up test accounts/members created during the test run
//
// Email bypass strategy
// ─────────────────────
// When an invitation is created via POST /api/v1/platform/tenants/:id/invitations,
// the JSON response contains the invitation token:
//   { success: true, invitation: { token: "abc123…", … } }
// Tests extract this token and navigate directly to:
//   /#/platform/invite/{token}
// No real email delivery is required.  If RESEND_API_KEY is not configured
// in the test environment the server already skips email silently.
// ============================================================

/**
 * Sign in to the platform and return the platform_sid cookie value.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>} platform_sid cookie
 */
export async function apiSignIn(request, email, password) {
  const res = await request.post('/api/v1/platform/login', {
    data: { email, password },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Sign-in failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  // Extract the platform_sid cookie from the response headers
  const setCookies = res.headers()['set-cookie'] || ''
  const match = setCookies.match(/platform_sid=([^;]+)/)
  if (!match) throw new Error('Sign-in succeeded but no platform_sid cookie was returned')
  return match[1]
}

/**
 * Get the first tenant ID for the currently authenticated session.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid platform_sid cookie value
 * @returns {Promise<string>} tenant ID
 */
export async function apiGetFirstTenantId(request, sid) {
  const res = await request.get('/api/v1/platform/status', {
    headers: { Cookie: `platform_sid=${sid}` },
  })
  const body = await res.json()
  const tenants = body.tenants || []
  if (tenants.length === 0) throw new Error('Owner account has no tenants')
  return tenants[0].id
}

/**
 * Create an invitation for the given email address and return the invitation
 * token directly from the API response — no real email delivery needed.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid       platform_sid cookie of the inviting user
 * @param {string} tenantId  target tenant
 * @param {string} email     invited user's email
 * @param {string[]} roles   roles to assign (default: ['instructor'])
 * @returns {Promise<{token: string, invitationId: string}>}
 */
export async function apiCreateInvitation(request, sid, tenantId, email, roles = ['instructor']) {
  const res = await request.post(`/api/v1/platform/tenants/${tenantId}/invitations`, {
    headers: { Cookie: `platform_sid=${sid}` },
    data: { email, roles },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Create invitation failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  const body = await res.json()
  const token = body.invitation?.token
  const invitationId = body.invitation?.id
  if (!token) throw new Error('Invitation created but no token in response')
  return { token, invitationId }
}

/**
 * Revoke (delete) a pending invitation.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid         platform_sid cookie
 * @param {string} tenantId
 * @param {string} invitationId
 */
export async function apiRevokeInvitation(request, sid, tenantId, invitationId) {
  await request.delete(
    `/api/v1/platform/tenants/${tenantId}/invitations/${invitationId}`,
    { headers: { Cookie: `platform_sid=${sid}` } },
  )
}

/**
 * Remove a member from a tenant (cleanup helper).
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid       platform_sid of a tenant admin
 * @param {string} tenantId
 * @param {string} memberId
 */
export async function apiRemoveMember(request, sid, tenantId, memberId) {
  await request.delete(
    `/api/v1/platform/tenants/${tenantId}/members/${memberId}`,
    { headers: { Cookie: `platform_sid=${sid}` } },
  )
}

/**
 * Generate a unique test email to avoid cross-test collisions.
 * Uses a timestamp + random suffix so repeated runs don't clash.
 *
 * The `.invalid` TLD is reserved by RFC 2606 and guaranteed never to
 * exist in DNS, making these addresses safe for testing without risking
 * accidental delivery to a real mailbox.  The timestamp+random suffix
 * prevents collisions when tests are retried or run in parallel.
 *
 * @param {string} prefix  short label, e.g. 'instructor'
 * @returns {string}
 */
export function testEmail(prefix = 'test') {
  return `uat-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@uat.invalid`
}
