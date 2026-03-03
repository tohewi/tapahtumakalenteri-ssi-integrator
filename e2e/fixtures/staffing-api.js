// ============================================================
// Staffing API helpers for Playwright E2E tests
//
// These helpers call the platform REST API directly to:
//   - Get upcoming staffing needs
//   - Get event staffing details (triggers SSI sync on read)
//   - Sign up for a staffing role
//   - Withdraw from a staffing role
//   - Directly manipulate SSI management group (test-only endpoints)
//   - Read SSI officials (test-only endpoint)
// ============================================================

/**
 * Get upcoming staffing needs for a tenant.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid  platform_sid cookie
 * @param {string} tenantId
 * @returns {Promise<Array>} array of { event, needs[], isUnderstaffed }
 */
export async function apiGetUpcomingStaffing(request, sid, tenantId) {
  const res = await request.get(`/api/v1/platform/tenants/${tenantId}/staffing/upcoming`, {
    headers: { Cookie: `platform_sid=${sid}` },
  })
  if (!res.ok()) throw new Error(`GET upcoming staffing failed (${res.status()})`)
  return res.json()
}

/**
 * Get staffing details for a specific event (triggers SSI sync on read).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @param {string} eventId
 * @returns {Promise<{event, needs[]}>}
 */
export async function apiGetEventStaffing(request, sid, tenantId, eventId) {
  const res = await request.get(`/api/v1/platform/tenants/${tenantId}/events/${eventId}/staffing`, {
    headers: { Cookie: `platform_sid=${sid}` },
  })
  if (!res.ok()) throw new Error(`GET event staffing failed (${res.status()})`)
  return res.json()
}

/**
 * Sign up for a staffing role.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @param {string} eventId
 * @param {string} needId
 * @returns {Promise<{success, signup, ssi?}>}
 */
export async function apiStaffingSignup(request, sid, tenantId, eventId, needId) {
  const res = await request.post(`/api/v1/platform/tenants/${tenantId}/events/${eventId}/staffing/signup`, {
    headers: { Cookie: `platform_sid=${sid}` },
    data: { needId },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Staffing signup failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  return res.json()
}

/**
 * Withdraw from a staffing role.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @param {string} eventId
 * @param {string} signupId
 * @returns {Promise<{success, signup, ssi?}>}
 */
export async function apiStaffingWithdraw(request, sid, tenantId, eventId, signupId) {
  const res = await request.post(`/api/v1/platform/tenants/${tenantId}/events/${eventId}/staffing/withdraw`, {
    headers: { Cookie: `platform_sid=${sid}` },
    data: { signupId },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Staffing withdraw failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  return res.json()
}

/**
 * Get my staffing assignments.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
export async function apiGetMyAssignments(request, sid, tenantId) {
  const res = await request.get(`/api/v1/platform/tenants/${tenantId}/staffing/my-assignments`, {
    headers: { Cookie: `platform_sid=${sid}` },
  })
  if (!res.ok()) throw new Error(`GET my-assignments failed (${res.status()})`)
  return res.json()
}

// ============================================================
// TEST-ONLY helpers (only available in non-production environments)
// ============================================================

/**
 * Directly add a user to the SSI management group for an event.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @param {string} eventId
 * @param {string} email         SSI account email to add
 * @param {string} [role='1']    SSI management role (1=admin, 2=staff)
 * @param {string[]} [officialCodes=[]]  e.g. ['MD', 'RO']
 */
export async function apiTestSsiAdd(request, sid, tenantId, eventId, email, role = '1', officialCodes = []) {
  const res = await request.post(`/api/v1/platform/tenants/${tenantId}/events/${eventId}/test/ssi-management`, {
    headers: { Cookie: `platform_sid=${sid}` },
    data: { action: 'add', email, role, officialCodes },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`TEST SSI add failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  return res.json()
}

/**
 * Directly remove a user from the SSI management group for an event.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @param {string} eventId
 * @param {string} email  SSI account email to remove
 */
export async function apiTestSsiRemove(request, sid, tenantId, eventId, email) {
  const res = await request.post(`/api/v1/platform/tenants/${tenantId}/events/${eventId}/test/ssi-management`, {
    headers: { Cookie: `platform_sid=${sid}` },
    data: { action: 'remove', email },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`TEST SSI remove failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  return res.json()
}

/**
 * Read the current SSI management group officials for an event.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @param {string} eventId
 * @returns {Promise<{officials: Array<{name, officials, role}>}>}
 */
export async function apiTestSsiGetOfficials(request, sid, tenantId, eventId) {
  const res = await request.get(`/api/v1/platform/tenants/${tenantId}/events/${eventId}/test/ssi-officials`, {
    headers: { Cookie: `platform_sid=${sid}` },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`TEST SSI get-officials failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  return res.json()
}

/**
 * Read SSI squad data for an event (competitors, statuses, squad assignments).
 * Only works for non-cup events (cups don't have squads).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sid
 * @param {string} tenantId
 * @param {string} eventId
 * @returns {Promise<{squads: Array<{number, comment, label, competitors: Array}>, staffSquadName: string|null}>}
 */
export async function apiTestSsiGetSquads(request, sid, tenantId, eventId) {
  const res = await request.get(`/api/v1/platform/tenants/${tenantId}/events/${eventId}/test/ssi-squads`, {
    headers: { Cookie: `platform_sid=${sid}` },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`TEST SSI get-squads failed (${res.status()}): ${body.error || 'unknown'}`)
  }
  return res.json()
}

/**
 * Find a need by roleKey from event staffing data.
 * @param {Array} needs  array of { id, roleKey, roleLabel, signups[] }
 * @param {string} roleKey  e.g. 'ro', 'match_director'
 * @returns {{id, roleKey, roleLabel, signups[]}|undefined}
 */
export function findNeedByRole(needs, roleKey) {
  return needs.find(n => n.roleKey === roleKey)
}

/**
 * Check if a user (by name substring, case-insensitive) is signed up for a need.
 * @param {{signups: Array}} need
 * @param {string} nameSubstring
 * @returns {boolean}
 */
export function isUserSignedUp(need, nameSubstring) {
  const lower = nameSubstring.toLowerCase()
  return (need.signups || []).some(s =>
    s.status === 'confirmed' && s.accountName?.toLowerCase().includes(lower)
  )
}
