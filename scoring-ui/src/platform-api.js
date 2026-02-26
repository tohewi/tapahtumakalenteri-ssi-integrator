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

// ---- Disciplines ----

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
