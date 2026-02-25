const API_BASE = '/api/v1/register'

export async function getCaptcha() {
  const resp = await fetch(`${API_BASE}/captcha`)
  if (!resp.ok) throw new Error('Failed to get captcha')
  return resp.json()
}

export async function verifyCaptcha(captchaId, captchaAnswer) {
  const resp = await fetch(`${API_BASE}/verify-captcha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ captchaId, captchaAnswer: Number(captchaAnswer) }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const err = new Error(data.message || data.error || 'Captcha verification failed')
    err.data = data
    throw err
  }
  return data
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

export async function submitRegistration({ cupId, squadNumber, email, captchaId, captchaAnswer }, onProgress) {
  const resp = await fetch(`${API_BASE}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cupId, squadNumber, email, captchaId, captchaAnswer: Number(captchaAnswer) }),
  })

  // Non-streaming error responses (4xx/5xx return JSON)
  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('ndjson')) {
    const data = await resp.json()
    if (!resp.ok) {
      const err = new Error(data.message || data.error || 'Registration failed')
      err.data = data
      throw err
    }
    return data
  }

  // Streaming NDJSON response — read progress lines
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Process complete lines
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete last line
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'progress' && onProgress) {
          onProgress(event)
        } else if (event.type === 'result') {
          result = event
        }
      } catch { /* skip malformed lines */ }
    }
  }

  // Flush any remaining decoded data and process the final line(s)
  buffer += decoder.decode()
  if (buffer) {
    const lines = buffer.split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'progress' && onProgress) {
          onProgress(event)
        } else if (event.type === 'result') {
          result = event
        }
      } catch { /* skip malformed lines */ }
    }
  }
  if (!result) throw new Error('No result received')
  if (!result.success) {
    const err = new Error(result.message || 'Registration failed')
    err.data = result
    throw err
  }
  return result
}
