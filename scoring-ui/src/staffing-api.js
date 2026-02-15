/**
 * Staffing API client — frontend calls to /api/staffing/* endpoints.
 */

const API_BASE = '/api/staffing'

function withSite(url, siteKey) {
  if (!siteKey) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}siteKey=${encodeURIComponent(siteKey)}`
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await resp.json()
  if (!resp.ok) {
    const err = new Error(data.error || `HTTP ${resp.status}`)
    err.status = resp.status
    err.sessionExpired = data.sessionExpired
    throw err
  }
  return data
}

/** List training events with staffing status */
export function fetchStaffingEvents(siteKey) {
  return fetchJson(withSite(`${API_BASE}/events`, siteKey))
}

/** Get single event staffing details */
export function fetchStaffingEvent(eventId, siteKey) {
  return fetchJson(withSite(`${API_BASE}/events/${eventId}`, siteKey))
}

/** Register for a specific role in an event */
export function staffSignup(eventId, role, siteKey) {
  return fetchJson(withSite(`${API_BASE}/events/${eventId}/signup`, siteKey), {
    method: 'POST',
    body: JSON.stringify({ role }),
  })
}

/** Resign from own role in an event */
export function staffResign(eventId, siteKey) {
  return fetchJson(withSite(`${API_BASE}/events/${eventId}/signup`, siteKey), {
    method: 'DELETE',
  })
}

/** Get staffing config (roles, training types) */
export function fetchStaffingConfig(siteKey) {
  return fetchJson(withSite(`${API_BASE}/config`, siteKey))
}

/** List available staffing sites */
export function fetchStaffingSites() {
  return fetchJson(`${API_BASE}/sites`)
}
