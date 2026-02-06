const API_BASE = '/api/register'

export async function getCaptcha() {
  const resp = await fetch(`${API_BASE}/captcha`)
  if (!resp.ok) throw new Error('Failed to get captcha')
  return resp.json()
}

export async function getCups() {
  const resp = await fetch(`${API_BASE}/cups`)
  if (!resp.ok) throw new Error('Failed to load cups')
  const data = await resp.json()
  return data.cups || []
}

export async function getCupDetail(cupId) {
  const resp = await fetch(`${API_BASE}/cup/${cupId}`)
  if (!resp.ok) throw new Error('Failed to load cup details')
  return resp.json()
}

export async function submitRegistration({ cupId, squadNumber, email, captchaId, captchaAnswer }) {
  const resp = await fetch(`${API_BASE}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cupId, squadNumber, email, captchaId, captchaAnswer }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const err = new Error(data.message || data.error || 'Registration failed')
    err.data = data
    throw err
  }
  return data
}
