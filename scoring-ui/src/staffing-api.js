/**
 * Staffing API client — frontend calls to /api/staffing/* endpoints.
 */

const API_BASE = '/api/staffing'

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
export function fetchStaffingEvents() {
  return fetchJson(`${API_BASE}/events`)
}

/** Get single event staffing details */
export function fetchStaffingEvent(eventId) {
  return fetchJson(`${API_BASE}/events/${eventId}`)
}

/** Register for a specific role in an event */
export function staffSignup(eventId, role) {
  return fetchJson(`${API_BASE}/events/${eventId}/signup`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  })
}

/** Resign from own role in an event */
export function staffResign(eventId) {
  return fetchJson(`${API_BASE}/events/${eventId}/signup`, {
    method: 'DELETE',
  })
}

/** Get staffing config (roles, training types) */
export function fetchStaffingConfig() {
  return fetchJson(`${API_BASE}/config`)
}
