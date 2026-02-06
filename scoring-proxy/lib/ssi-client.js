const SSI_BASE = process.env.SSI_BASE_URL || 'https://shootnscoreit.com'
const SSI_GRAPHQL = `${SSI_BASE}/graphql/`

// ============================================================
// GraphQL client (JWT auth for reads)
// ============================================================

export async function ssiGraphQL(jwtToken, query, variables = {}, apiKey = null) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (jwtToken) {
    headers['Authorization'] = `JWT ${jwtToken}`
  }
  if (apiKey) {
    headers['X-Api-Key'] = apiKey
  }

  const body = JSON.stringify({ query, variables })

  const resp = await fetch(SSI_GRAPHQL, {
    method: 'POST',
    headers,
    body,
  })

  if (!resp.ok) {
    throw new Error(`GraphQL HTTP ${resp.status}: ${resp.statusText}`)
  }

  const json = await resp.json()

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map(e => e.message).join('; ')
    throw new Error(`GraphQL Error: ${messages}`)
  }

  return json.data
}

// ============================================================
// JWT token refresh
// ============================================================

export async function ssiRefreshJWT(refreshToken) {
  const result = await ssiGraphQL(null, `
    mutation Refresh($refreshToken: String!) {
      refresh_token(refresh_token: $refreshToken) {
        token { token }
        refresh_token { token }
      }
    }
  `, { refreshToken })

  if (!result.refresh_token?.token?.token) {
    throw new Error('Token refresh failed')
  }

  return {
    token: result.refresh_token.token.token,
    refreshToken: result.refresh_token.refresh_token.token,
  }
}

// ============================================================
// Web login (session cookies for form POSTs)
//
// NOTE: SSI does NOT use CSRF tokens. Neither the login page
// nor the scoring page include a csrfmiddlewaretoken hidden
// field or set a csrftoken cookie. All form POSTs work with
// just the session cookie. The CSRF-related code below is
// kept as a defensive fallback in case SSI re-enables CSRF
// protection in a future update.
// ============================================================

export async function ssiLogin(email, password) {
  // 1. GET the login page to get cookies (no CSRF token expected)
  // SSI login URL is /login/ (not /accounts/login/)
  const loginUrl = `${SSI_BASE}/login/?next=/dashboard/`
  const loginPageResp = await fetch(loginUrl, {
    redirect: 'manual',
    headers: {
      'Cookie': 'django_language=en',
    },
  })
  const loginPageHtml = await loginPageResp.text()

  // SSI login page has no CSRF token (verified 2026-02-06).
  // Defensive: still check in case SSI re-enables it later.
  const csrfMatch = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  const setCookies = loginPageResp.headers.getSetCookie?.() || []
  const cookies = parseCookies(setCookies)
  cookies.django_language = 'en'

  const csrfToken = csrfMatch?.[1] || cookies.csrftoken || null

  // 2. POST login form — fields are: username, password, keep
  const formData = new URLSearchParams()
  if (csrfToken) formData.append('csrfmiddlewaretoken', csrfToken)
  formData.append('username', email)
  formData.append('password', password)
  formData.append('keep', 'on')

  const loginResp = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': loginUrl,
      'Origin': SSI_BASE,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  // Merge new cookies from login response
  const loginSetCookies = loginResp.headers.getSetCookie?.() || []
  const loginCookies = parseCookies(loginSetCookies)
  const allCookies = { ...cookies, ...loginCookies }

  if (process.env.NODE_ENV !== 'production') {
    console.log('Login response status:', loginResp.status, 'Cookies:', Object.keys(allCookies))
  }

  // 302 redirect = success
  if (loginResp.status === 302 || loginResp.status === 301) {
    if (process.env.NODE_ENV !== 'production') console.log('SSI web login successful')
    return allCookies
  }

  // 200 with sessionid cookie = success (some configs)
  if (allCookies.sessionid) {
    if (process.env.NODE_ENV !== 'production') console.log('SSI web login successful (no redirect)')
    return allCookies
  }

  // Check for error messages
  if (loginResp.status === 200) {
    const html = await loginResp.text()
    if (html.includes('Please enter a correct') || html.includes('errorlist')) {
      throw new Error('Login failed: invalid credentials')
    }
  }

  throw new Error(`Login failed with status ${loginResp.status}`)
}

// ============================================================
// GET scoring page — extract form action
//
// NOTE: SSI scoring page does NOT use CSRF tokens (verified
// 2026-02-06). The form at /nordic/competitor/{id}/score-in-match/
// has no csrfmiddlewaretoken field and no csrftoken cookie is set.
// Session cookie alone is sufficient for authentication.
// ============================================================

export async function ssiGetScoringPage(competitorId, cookies) {
  const url = `${SSI_BASE}/nordic/competitor/${competitorId}/score-in-match/`

  const resp = await fetch(url, {
    headers: {
      'Cookie': formatCookies(cookies),
    },
    redirect: 'follow',
  })

  if (!resp.ok) {
    throw new Error(`Scoring page HTTP ${resp.status} for competitor ${competitorId}`)
  }

  const html = await resp.text()

  // SSI scoring page has no CSRF token (verified 2026-02-06).
  // Defensive: still check in case SSI re-enables it later.
  const csrfMatch = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  const sc = resp.headers.getSetCookie?.() || []
  const respCookies = parseCookies(sc)
  const csrfToken = csrfMatch?.[1] || respCookies.csrftoken || cookies.csrftoken || null

  // Extract form action
  const actionMatch = html.match(/<form[^>]*action="([^"]*)"/)
  const formAction = actionMatch ? actionMatch[1] : url

  return {
    csrfToken,
    formAction: formAction || url,
    html,
  }
}

// ============================================================
// POST score form to SSI
// ============================================================

export async function ssiSubmitScore(competitorId, formData, cookies, csrfToken) {
  const url = `${SSI_BASE}/nordic/competitor/${competitorId}/score-in-match/`

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': formatCookies(cookies),
    'Referer': url,
    'Origin': SSI_BASE,
  }
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: formData.toString(),
    redirect: 'manual',
  })

  // Django typically redirects on success (302)
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Score submitted successfully' }
  }

  // 200 might mean validation error — check the response
  if (resp.status === 200) {
    const html = await resp.text()
    if (html.includes('errorlist')) {
      const errorMatch = html.match(/<ul class="errorlist"[^>]*>([\s\S]*?)<\/ul>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown validation error'
      return { success: false, message: errorText }
    }
    // If no errors visible, it might have succeeded without redirect
    return { success: true, message: 'Score submitted (no redirect)' }
  }

  throw new Error(`Score submission failed with HTTP ${resp.status}`)
}

// ============================================================
// Admin: search-and-add participant to event (web scraping)
// POST /event/{contentType}/{eventId}/participant-search-and-add/
// ============================================================

export async function ssiSearchAndAddParticipant(eventContentType, eventId, email, cookies) {
  const pageUrl = `${SSI_BASE}/event/${eventContentType}/${eventId}/participant-search-and-add/`

  // 1. GET the page to find CSRF token
  const pageResp = await fetch(pageUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!pageResp.ok) {
    throw new Error(`Search-and-add page HTTP ${pageResp.status}`)
  }
  const html = await pageResp.text()
  const csrfMatch = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  const csrfToken = csrfMatch?.[1] || cookies.csrftoken || null

  // 2. POST the email to search and add
  const formData = new URLSearchParams()
  if (csrfToken) formData.append('csrfmiddlewaretoken', csrfToken)
  formData.append('email', email)

  const resp = await fetch(pageUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': pageUrl,
      'Origin': SSI_BASE,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  // 302 redirect = success (participant added)
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Participant added' }
  }

  // 200 = might have errors
  if (resp.status === 200) {
    const respHtml = await resp.text()
    if (respHtml.includes('errorlist')) {
      const errorMatch = respHtml.match(/<ul class="errorlist"[^>]*>([\s\S]*?)<\/ul>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown error'
      return { success: false, message: errorText }
    }
    // Check if user was not found
    if (respHtml.includes('not found') || respHtml.includes('No user') || respHtml.includes('no results')) {
      return { success: false, message: 'user_not_found' }
    }
    // May have succeeded without redirect
    return { success: true, message: 'Participant added (no redirect)' }
  }

  throw new Error(`Search-and-add failed with HTTP ${resp.status}`)
}

// ============================================================
// Admin: get participant edit page — extract squad options
// GET /event/participant/{contentType}/{participantId}/edit/
// ============================================================

export async function ssiGetParticipantEditForm(participantId, cookies) {
  const url = `${SSI_BASE}/event/participant/93/${participantId}/edit/`
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participant edit page HTTP ${resp.status}`)
  const html = await resp.text()

  // Extract CSRF token
  const csrfMatch = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  const csrfToken = csrfMatch?.[1] || null

  // Extract squad SELECT options
  const squadSelectMatch = html.match(/<select[^>]*name="squad"[^>]*>([\s\S]*?)<\/select>/)
  const squads = []
  if (squadSelectMatch) {
    const optionRegex = /<option\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g
    let m
    while ((m = optionRegex.exec(squadSelectMatch[1])) !== null) {
      if (m[1]) squads.push({ value: m[1], label: m[2].trim() })
    }
  }

  // Extract current field values for re-submission
  const getFieldValue = (name) => {
    // Check selected option
    const selectMatch = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)<\\/select>`))
    if (selectMatch) {
      const selectedMatch = selectMatch[1].match(/<option[^>]*selected[^>]*value="([^"]*)"/)
      return selectedMatch ? selectedMatch[1] : ''
    }
    // Check input value
    const inputMatch = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))
    return inputMatch ? inputMatch[1] : ''
  }

  return {
    csrfToken,
    squads,
    currentValues: {
      status: getFieldValue('status'),
      weapon_group: getFieldValue('weapon_group'),
      category: getFieldValue('category'),
      competence_class: getFieldValue('competence_class'),
      number: getFieldValue('number'),
      squad: getFieldValue('squad'),
    },
  }
}

// ============================================================
// Admin: set participant squad via edit form
// POST /event/participant/93/{participantId}/edit/
// ============================================================

export async function ssiSetParticipantSquad(participantId, squadValue, cookies) {
  // First get current form values
  const form = await ssiGetParticipantEditForm(participantId, cookies)

  const url = `${SSI_BASE}/event/participant/93/${participantId}/edit/`
  const formData = new URLSearchParams()
  if (form.csrfToken) formData.append('csrfmiddlewaretoken', form.csrfToken)

  // Re-submit all current values with updated squad
  formData.append('squad', squadValue)
  formData.append('status', form.currentValues.status || 'a')
  formData.append('weapon_group', form.currentValues.weapon_group || 'STD')
  formData.append('category', form.currentValues.category || 'Open')
  formData.append('number', form.currentValues.number || '')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': url,
      'Origin': SSI_BASE,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  if (resp.status === 302 || resp.status === 301) {
    return { success: true }
  }
  if (resp.status === 200) {
    const html = await resp.text()
    if (html.includes('errorlist')) {
      const errorMatch = html.match(/<ul class="errorlist"[^>]*>([\s\S]*?)<\/ul>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Edit error'
      return { success: false, message: errorText }
    }
    return { success: true }
  }
  throw new Error(`Participant edit failed with HTTP ${resp.status}`)
}

// ============================================================
// Cookie helpers
// ============================================================

function parseCookies(setCookieHeaders) {
  const cookies = {}
  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/)
    if (match) {
      cookies[match[1].trim()] = match[2].trim()
    }
  }
  return cookies
}

function formatCookies(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}
