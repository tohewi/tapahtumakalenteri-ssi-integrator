const API_BASE = '/api/v1/waitlist'

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: options.credentials ?? 'same-origin',
    ...options,
  })

  const data = await resp.json()
  if (!resp.ok) {
    const err = new Error(data.error || data.message || `HTTP ${resp.status}`)
    err.status = resp.status
    err.data = data
    throw err
  }

  return data
}

export function getWaitlistCaptcha() {
  return fetchJson(`${API_BASE}/captcha`)
}

export function verifyWaitlistCaptcha(captchaId, captchaAnswer) {
  return fetchJson(`${API_BASE}/verify-captcha`, {
    method: 'POST',
    body: JSON.stringify({ captchaId, captchaAnswer: Number(captchaAnswer) }),
  })
}

export function submitWaitlistEntry(payload) {
  return fetchJson(`${API_BASE}/submit`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      captchaAnswer: Number(payload.captchaAnswer),
    }),
  })
}

export function cancelWaitlistEntry(email) {
  return fetchJson(`${API_BASE}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function fetchWaitlistAdminData() {
  return fetchJson(`${API_BASE}/admin/data`, { credentials: 'include' })
}

export function createWaitlistInductionGroup({ participantIds, label, plannedDate }) {
  return fetchJson(`${API_BASE}/admin/groups`, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ participantIds, label, plannedDate }),
  })
}

export function completeWaitlistGroup(groupId) {
  return fetchJson(`${API_BASE}/admin/groups/${groupId}/complete`, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({}),
  })
}

export function adminCancelWaitlistEntry(entryId) {
  return fetchJson(`${API_BASE}/admin/entries/${entryId}/cancel`, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({}),
  })
}