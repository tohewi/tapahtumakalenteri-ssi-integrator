import { SessionExpiredError, ScopeMismatchError } from './api'

const API_BASE = '/api/v1/guns'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && data.sessionExpired) {
      throw new SessionExpiredError(data.error)
    }
    if (res.status === 403 && data.scopeMismatch) {
      throw new ScopeMismatchError(data.error)
    }
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export function getGuns({ includeRetired = false } = {}) {
  const qs = includeRetired ? '?includeRetired=true' : ''
  return request(qs)
}

export function createGun({ make, model, serialNumber, acquisitionYear }) {
  return request('', {
    method: 'POST',
    body: JSON.stringify({ make, model, serialNumber, acquisitionYear: Number(acquisitionYear) }),
  })
}

export function updateGun(gunId, payload) {
  return request(`/${gunId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function retireGun(gunId) {
  return request(`/${gunId}`, {
    method: 'DELETE',
  })
}

export function checkoutGun(gunId, { shooterName, shooterEmail, cupId, cupName, cartridgesGiven }) {
  return request(`/${gunId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({
      shooterName,
      shooterEmail,
      cupId,
      cupName,
      cartridgesGiven: Number(cartridgesGiven),
    }),
  })
}

export function returnGun(gunId) {
  return request(`/${gunId}/return`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function returnAllGuns({ cupId = null } = {}) {
  return request('/return-all', {
    method: 'POST',
    body: JSON.stringify({ cupId }),
  })
}

export function recordGunMaintenance(gunId, { notes = '' } = {}) {
  return request(`/${gunId}/maintenance`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  })
}
