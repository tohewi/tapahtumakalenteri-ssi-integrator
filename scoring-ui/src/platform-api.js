// ============================================================
// Platform API Client
//
// Handles communication with the platform backend for account
// registration, login, tenant management, and session status.
// ============================================================

const API_BASE = '/api/v1/platform'

/**
 * Generic fetch wrapper with JSON parsing and error handling.
 */
async function platformFetch(path, options = {}) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    credentials: 'include', // send platform_sid cookie
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.status = res.status
    err.details = data.details || null
    err.platformSessionExpired = data.platformSessionExpired || false
    throw err
  }

  return data
}

// ---- Auth ----

/**
 * Register a new platform account + first tenant.
 * @param {{ email, password, name, organizationName }} params
 */
export async function platformRegister({ email, password, name, organizationName }) {
  return platformFetch('/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, organizationName }),
  })
}

/**
 * Sign in to platform account.
 * @param {{ email, password }} params
 */
export async function platformLogin({ email, password }) {
  return platformFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

/**
 * Sign out — destroy platform session.
 */
export async function platformLogout() {
  return platformFetch('/logout', { method: 'POST' })
}

/**
 * Check platform session status.
 * Returns { authenticated, account?, tenants? }
 */
export async function platformStatus() {
  return platformFetch('/status')
}

/**
 * Get current account profile + tenants.
 */
export async function platformMe() {
  return platformFetch('/me')
}

// ---- Tenants ----

/**
 * Create a new tenant.
 * @param {{ name }} params
 */
export async function createTenant({ name }) {
  return platformFetch('/tenants', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/**
 * List all account's tenants.
 */
export async function listTenants() {
  return platformFetch('/tenants')
}

/**
 * Get tenant details.
 */
export async function getTenantDetails(tenantId) {
  return platformFetch(`/tenants/${tenantId}`)
}

/**
 * Update tenant settings.
 */
export async function updateTenant(tenantId, updates) {
  return platformFetch(`/tenants/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

// ---- Account ----

/**
 * Update account profile (name, email).
 * @param {{ name?, email? }} updates
 */
export async function updateAccountProfile(updates) {
  return platformFetch('/account', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

/**
 * Change account password.
 * @param {{ currentPassword, newPassword }} params
 */
export async function changeAccountPassword({ currentPassword, newPassword }) {
  return platformFetch('/account/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

// ---- MFA ----

/**
 * Verify MFA code during login challenge.
 * @param {{ code?, recoveryCode? }} params
 */
export async function mfaVerify({ code, recoveryCode }) {
  return platformFetch('/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code, recoveryCode }),
  })
}

/**
 * Initiate MFA setup — returns QR code and recovery codes.
 */
export async function mfaSetup() {
  return platformFetch('/account/mfa/setup', { method: 'POST' })
}

/**
 * Confirm MFA setup with a TOTP code from the authenticator app.
 * @param {{ code }} params
 */
export async function mfaConfirm({ code }) {
  return platformFetch('/account/mfa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

/**
 * Disable MFA. Requires current password.
 * @param {{ password }} params
 */
export async function mfaDisable({ password }) {
  return platformFetch('/account/mfa/disable', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

// ---- Password Reset ----

/**
 * Request a password reset email.
 * @param {{ email }} params
 */
export async function forgotPassword({ email }) {
  return platformFetch('/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/**
 * Reset password using a token from the reset email.
 * @param {{ token, newPassword }} params
 */
export async function resetPassword({ token, newPassword }) {
  return platformFetch('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  })
}

// ---- Disciplines ----

/**
 * Get the static registry of supported SSI discipline types.
 */
export async function getSsiDisciplineRegistry() {
  return platformFetch('/ssi-discipline-registry')
}

/**
 * List disciplines for a tenant.
 */
export async function listDisciplines(tenantId) {
  return platformFetch(`/tenants/${tenantId}/disciplines`)
}

/**
 * Create a discipline for a tenant.
 * @param {string} tenantId
 * @param {{ name, labelFi?, labelEn?, ssiGroupId?, ssiOrganizerId? }} data
 */
export async function createDisciplineApi(tenantId, data) {
  return platformFetch(`/tenants/${tenantId}/disciplines`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Update a discipline.
 */
export async function updateDisciplineApi(tenantId, disciplineId, updates) {
  return platformFetch(`/tenants/${tenantId}/disciplines/${disciplineId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

/**
 * Delete a discipline.
 */
export async function deleteDisciplineApi(tenantId, disciplineId) {
  return platformFetch(`/tenants/${tenantId}/disciplines/${disciplineId}`, {
    method: 'DELETE',
  })
}

// ---- Members & Invitations ----

export async function listMembers(tenantId) {
  return platformFetch(`/tenants/${tenantId}/members`)
}

export async function updateMemberRoles(tenantId, memberId, roles) {
  return platformFetch(`/tenants/${tenantId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ roles }),
  })
}

export async function removeMember(tenantId, memberId) {
  return platformFetch(`/tenants/${tenantId}/members/${memberId}`, {
    method: 'DELETE',
  })
}

export async function listInvitations(tenantId) {
  return platformFetch(`/tenants/${tenantId}/invitations`)
}

export async function createInvitation(tenantId, { email, roles }) {
  return platformFetch(`/tenants/${tenantId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email, roles }),
  })
}

export async function revokeInvitation(tenantId, invitationId) {
  return platformFetch(`/tenants/${tenantId}/invitations/${invitationId}`, {
    method: 'DELETE',
  })
}

export async function getInvitationByToken(token) {
  return platformFetch(`/invitations/${token}`)
}

export async function acceptInvitation(token, { password, name } = {}) {
  return platformFetch(`/invitations/${token}/accept`, {
    method: 'POST',
    body: JSON.stringify({ password, name }),
  })
}

// ---- Match Templates ----

/**
 * List templates for a tenant. Optionally filter by disciplineId.
 */
export async function listTemplates(tenantId, disciplineId) {
  const qs = disciplineId ? `?disciplineId=${disciplineId}` : ''
  return platformFetch(`/tenants/${tenantId}/templates${qs}`)
}

/**
 * Create a match template for a tenant.
 */
export async function createTemplateApi(tenantId, data) {
  return platformFetch(`/tenants/${tenantId}/templates`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Get a single match template.
 */
export async function getTemplateApi(tenantId, templateId) {
  return platformFetch(`/tenants/${tenantId}/templates/${templateId}`)
}

/**
 * Update a match template.
 */
export async function updateTemplateApi(tenantId, templateId, updates) {
  return platformFetch(`/tenants/${tenantId}/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

/**
 * Import seed event structure from SSI into a template's snapshot.
 */
export async function importTemplateSeed(tenantId, templateId) {
  return platformFetch(`/tenants/${tenantId}/templates/${templateId}/import-seed`, {
    method: 'POST',
  })
}

/**
 * Delete a match template.
 */
export async function deleteTemplateApi(tenantId, templateId) {
  return platformFetch(`/tenants/${tenantId}/templates/${templateId}`, {
    method: 'DELETE',
  })
}

// ---- Scheduled Events ----

/**
 * List scheduled events for a tenant. Optional filters: templateId, status.
 */
export async function listEvents(tenantId, { templateId, status } = {}) {
  const params = new URLSearchParams()
  if (templateId) params.set('templateId', templateId)
  if (status) params.set('status', status)
  const qs = params.toString() ? `?${params}` : ''
  return platformFetch(`/tenants/${tenantId}/events${qs}`)
}

/**
 * Create scheduled event(s). Pass dates array (batch) or single date.
 */
export async function createEventsApi(tenantId, { templateId, dates }) {
  return platformFetch(`/tenants/${tenantId}/events`, {
    method: 'POST',
    body: JSON.stringify({ templateId, dates }),
  })
}

/**
 * Get a single scheduled event.
 */
export async function getEventApi(tenantId, eventId) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}`)
}

/**
 * Update a scheduled event (status, ssiReferences, etc.).
 */
export async function updateEventApi(tenantId, eventId, updates) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

/**
 * Execute a planned event — create cup/matches/squads in SSI.
 */
export async function executeEventApi(tenantId, eventId) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/execute`, {
    method: 'POST',
  })
}

/**
 * Delete a planned scheduled event (hard delete — removes from DB and SSI).
 */
export async function deleteEventApi(tenantId, eventId) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}`, {
    method: 'DELETE',
  })
}

/**
 * Soft-cancel a scheduled event (keeps DB record as 'cancelled').
 * @param {string} tenantId
 * @param {string} eventId
 * @param {{ removeFromSsi?: boolean }} options
 * @returns {{ event, impact: { staffingSignups, removedFromSsi } }}
 */
export async function cancelEventApi(tenantId, eventId, { removeFromSsi = false } = {}) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ removeFromSsi }),
  })
}

// ---- Calendar Publishing ----

/**
 * Manually trigger or retry calendar publishing for an event.
 * @param {string} tenantId
 * @param {string} eventId
 * @param {{ force?: boolean }} options
 */
export async function publishCalendarApi(tenantId, eventId, { force = false } = {}) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/publish-calendar`, {
    method: 'POST',
    body: JSON.stringify({ force }),
  })
}

/**
 * Update WordPress calendar event with statistics from SSI (CAL-5).
 * @param {string} tenantId
 * @param {string} eventId
 */
export async function updateCalendarStatsApi(tenantId, eventId) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/update-calendar-stats`, {
    method: 'POST',
  })
}

/**
 * Complete an SSI event — set status to 'cp' (CAL-7).
 * For cups: completes all component matches, then the cup.
 * @param {string} tenantId
 * @param {string} eventId
 */
export async function completeSsiEventApi(tenantId, eventId) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/complete-ssi`, {
    method: 'POST',
  })
}

/**
 * Run calendar data integrity check (CAL-6).
 * @param {string} tenantId
 * @param {{ liveCheck?: boolean }} [options]
 */
export async function integrityCheckApi(tenantId, options = {}) {
  return platformFetch(`/tenants/${tenantId}/events/integrity-check`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

// ---- SSI Event Search & Import ----

/**
 * Search SSI events via GraphQL with optional filters.
 * @param {string} tenantId
 * @param {{ search, sport?, startsAfter?, startsBefore?, region? }} filters
 */
export async function ssiSearchEventsApi(tenantId, filters) {
  return platformFetch(`/tenants/${tenantId}/ssi-search`, {
    method: 'POST',
    body: JSON.stringify(filters),
  })
}

/**
 * Import selected SSI events as local scheduled events.
 * @param {string} tenantId
 * @param {Array<object>} events - SSI event objects from search results
 */
export async function ssiImportEventsApi(tenantId, events, disciplineId = null) {
  return platformFetch(`/tenants/${tenantId}/ssi-import`, {
    method: 'POST',
    body: JSON.stringify({ events, disciplineId }),
  })
}

// ---- Event Staffing (Roster) ----

/**
 * Get upcoming events that need staff.
 */
export async function getUpcomingStaffingApi(tenantId) {
  return platformFetch(`/tenants/${tenantId}/staffing/upcoming`)
}

/**
 * Get the current user's staffing commitments.
 */
export async function getMyStaffingAssignmentsApi(tenantId) {
  return platformFetch(`/tenants/${tenantId}/staffing/my-assignments`)
}

/**
 * Sign up for a staffing role at an event.
 */
export async function signupForEventStaffingApi(tenantId, eventId, needId, notes = '') {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/staffing/signup`, {
    method: 'POST',
    body: JSON.stringify({ needId, notes })
  })
}

/**
 * Withdraw from a staffing commitment.
 */
export async function withdrawFromEventStaffingApi(tenantId, eventId, signupId) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/staffing/withdraw`, {
    method: 'POST',
    body: JSON.stringify({ signupId })
  })
}

/**
 * Get staffing leaderboard (volunteer activity summary).
 * @param {string} tenantId
 * @param {string} [period='all'] - 'all' | '12m' | '6m' | '3m'
 */
export async function getStaffingLeaderboardApi(tenantId, period = 'all') {
  return platformFetch(`/tenants/${tenantId}/staffing/leaderboard?period=${period}`)
}

/**
 * Backfill staffing needs for existing events from their template's staffing_rules.
 * Purely local DB — no SSI writes. Admin only.
 */
export async function backfillStaffingNeedsApi(tenantId, { defaultTemplateId } = {}) {
  const body = defaultTemplateId ? { defaultTemplateId } : undefined
  return platformFetch(`/tenants/${tenantId}/staffing/backfill`, {
    method: 'POST',
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  })
}

/**
 * Get staffing details for a specific event (needs + signups).
 */
export async function getEventStaffingApi(tenantId, eventId) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/staffing`)
}

/**
 * Update staffing needs for a specific event (admin override).
 * @param {string} tenantId
 * @param {string} eventId
 * @param {Array} needs - [{ roleKey, roleLabel, minCount, maxCount }]
 */
export async function updateEventStaffingNeedsApi(tenantId, eventId, needs) {
  return platformFetch(`/tenants/${tenantId}/events/${eventId}/staffing-needs`, {
    method: 'PUT',
    body: JSON.stringify({ needs })
  })
}

