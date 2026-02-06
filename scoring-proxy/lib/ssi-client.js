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
// Helper: follow a register-participant link and handle the response
// The GET may return a confirmation page with a form to POST,
// or it may redirect (302) on success.
// ============================================================

async function _followRegisterLink(url, referer, cookies, debug) {
  if (debug) console.log(`[search-and-add] GET register link: ${url}`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies), 'Referer': referer },
    redirect: 'manual',
  })
  if (debug) console.log(`[search-and-add] Register response: ${resp.status}`)

  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Participant added' }
  }

  if (resp.status === 200) {
    const html = await resp.text()
    if (debug) {
      const fs = await import('fs')
      fs.writeFileSync('test-harness/debug-register-participant-response.html', html)
      console.log(`[search-and-add] Saved register response (${html.length} chars)`)
    }
    return await _handleRegisterResponse(html, url, cookies, debug)
  }

  throw new Error(`Register participant failed HTTP ${resp.status}`)
}

// Extract ALL form fields from an SSI HTML form (hidden, select, text, number, checkbox)
function _extractFormFields(formHtml) {
  const formData = new URLSearchParams()
  const seen = new Set()

  // Hidden inputs
  for (const m of formHtml.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"/gi)) {
    if (!seen.has(m[1])) { formData.append(m[1], m[2]); seen.add(m[1]) }
  }

  // Select elements — use selected option, fallback to first non-empty option
  for (const sel of formHtml.matchAll(/<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const name = sel[1]
    if (seen.has(name)) continue
    const selectedMatch = sel[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/i)
    if (selectedMatch) {
      formData.append(name, selectedMatch[1]); seen.add(name)
    } else {
      const firstOpt = sel[2].match(/<option\s+value="([^"]+)"/i)
      if (firstOpt) { formData.append(name, firstOpt[1]); seen.add(name) }
    }
  }

  // Text and number inputs
  for (const m of formHtml.matchAll(/<input[^>]*type="(?:text|number)"[^>]*name="([^"]*)"[^>]*value="([^"]*)"/gi)) {
    if (!seen.has(m[1])) { formData.append(m[1], m[2]); seen.add(m[1]) }
  }
  // Reversed attribute order: name before value
  for (const m of formHtml.matchAll(/<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*type="(?:text|number)"/gi)) {
    if (!seen.has(m[1])) { formData.append(m[1], m[2]); seen.add(m[1]) }
  }
  // Reversed: value before name
  for (const m of formHtml.matchAll(/<input[^>]*value="([^"]*)"[^>]*name="([^"]*)"[^>]*type="(?:text|number)"/gi)) {
    if (!seen.has(m[2])) { formData.append(m[2], m[1]); seen.add(m[2]) }
  }

  return formData
}

async function _handleRegisterResponse(html, url, cookies, debug) {
  // If the page contains a form, we need to POST it to confirm registration
  const formMatch = html.match(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/i)
  if (formMatch) {
    if (debug) console.log('[search-and-add] Confirmation form found')

    // Extract shooter name from the shooter select: <option value="..." selected>Name</option>
    const shooterNameMatch = formMatch[1].match(/<select[^>]*name="shooter"[^>]*>[\s\S]*?<option[^>]*selected[^>]*>([^<]+)<\/option>/i)
    const shooterName = shooterNameMatch ? shooterNameMatch[1].trim() : null
    if (debug && shooterName) console.log(`[search-and-add] Shooter name: "${shooterName}"`)

    // Extract form action — "#" or empty means same page URL
    const actionMatch = html.match(/<form[^>]*action="([^"]*)"[^>]*method="post"/i)
      || html.match(/<form[^>]*method="post"[^>]*action="([^"]*)"/i)
    let formAction = actionMatch?.[1] || ''
    if (!formAction || formAction === '#') formAction = url

    // Extract all form fields
    const formData = _extractFormFields(formMatch[1])

    // Required checkbox: has_accepted_event_data_policy
    formData.set('has_accepted_event_data_policy', 'on')

    // Submit button
    const submitMatch = formMatch[1].match(/<input[^>]*type="submit"[^>]*name=["']([^"']*)["'][^>]*value="([^"]*)"/i)
    if (submitMatch) formData.set(submitMatch[1], submitMatch[2])

    // SSI anti-bot: form_loaded_at timestamp check — must wait 5+ seconds
    if (debug) console.log('[search-and-add] Waiting 5s (SSI anti-bot)...')
    await new Promise(r => setTimeout(r, 5000))

    if (debug) console.log(`[search-and-add] POST confirm to: ${formAction}, fields: ${[...formData.keys()].join(', ')}`)

    const fullAction = formAction.startsWith('http') ? formAction : `${SSI_BASE}${formAction}`
    const confirmResp = await fetch(fullAction, {
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
    if (debug) console.log(`[search-and-add] Confirm response: ${confirmResp.status}`)

    if (confirmResp.status === 302 || confirmResp.status === 301) {
      return { success: true, message: 'Participant added', shooterName }
    }
    if (confirmResp.status === 200) {
      const confirmHtml = await confirmResp.text()
      // Check for "already registered" (not an error — just means user is already in)
      if (confirmHtml.includes('already registered') || confirmHtml.includes('Shooter already registered')) {
        return { success: true, message: 'Already registered', shooterName }
      }
      if (confirmHtml.includes('too quickly')) {
        return { success: false, message: 'SSI anti-bot: submitted too quickly, try again' }
      }
      if (confirmHtml.includes('errorlist') || confirmHtml.includes('text-danger') || confirmHtml.includes('is-invalid')) {
        const errMatch = confirmHtml.match(/<(?:ul|div)[^>]*(?:errorlist|text-danger|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
        const errText = errMatch ? errMatch[1].replace(/<[^>]+>/g, '').trim() : 'Form validation error'
        return { success: false, message: errText }
      }
      return { success: true, message: 'Participant added (confirmed)', shooterName }
    }
    throw new Error(`Confirm registration failed HTTP ${confirmResp.status}`)
  }

  // No form — check if it looks like a success page
  if (html.includes('already registered') || html.includes('jo ilmoittautunut')) {
    return { success: true, message: 'Already registered' }
  }

  if (debug) console.log('[search-and-add] No confirmation form — assuming success')
  return { success: true, message: 'Participant added (no redirect)' }
}

// ============================================================
// Admin: search-and-add participant to event (web scraping)
// POST /event/{contentType}/{eventId}/participant-search-and-add/
// ============================================================

export async function ssiSearchAndAddParticipant(eventContentType, eventId, email, cookies) {
  const pageUrl = `${SSI_BASE}/event/${eventContentType}/${eventId}/participant-search-and-add/`
  const debug = process.env.NODE_ENV !== 'production'

  // SSI search-and-add is a two-step form (NO CSRF tokens — SSI doesn't use them):
  // Step 1: POST search (last_name, first_name, email, submit=Search) → returns result table
  // Step 2: GET the "add" link for the matching user → redirects to participants page

  // 1. POST search by email
  const formData = new URLSearchParams()
  formData.append('last_name', '')
  formData.append('first_name', '')
  formData.append('email', email)
  formData.append('submit', 'Search')

  if (debug) console.log(`[search-and-add] POST search email=${email} to ${pageUrl}`)
  const searchResp = await fetch(pageUrl, {
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
  if (debug) console.log(`[search-and-add] Search response: ${searchResp.status}`)

  if (searchResp.status === 302 || searchResp.status === 301) {
    return { success: true, message: 'Participant added' }
  }

  if (searchResp.status !== 200) {
    throw new Error(`Search-and-add failed HTTP ${searchResp.status}`)
  }

  const searchHtml = await searchResp.text()
  if (debug) console.log(`[search-and-add] Response: ${searchHtml.length} chars`)

  // 2. Check for "no results" — SSI shows this in <ul class="list-unstyled text-danger">
  if (searchHtml.includes('no results') || searchHtml.includes('gave no results')) {
    if (debug) console.log('[search-and-add] "no results" — user not found')
    return { success: false, message: 'user_not_found' }
  }

  // Check for Django form errors
  if (searchHtml.includes('errorlist')) {
    const errorMatch = searchHtml.match(/<ul class="errorlist"[^>]*>([\s\S]*?)<\/ul>/)
    const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown error'
    if (debug) console.log(`[search-and-add] Form error: ${errorText}`)
    return { success: false, message: errorText }
  }

  // 3. Extract shooter name from search results table
  //    The table row near the register link typically contains: <td>First Last</td>
  //    or the name appears in the first few <td> cells of the row containing the register link.
  let searchShooterName = null
  const nameFromTable = searchHtml.match(/<tr[^>]*>[\s\S]*?(?:register|Register)[\s\S]*?<\/tr>/i)
  if (nameFromTable) {
    // Extract text from <td> cells — name is typically the first non-empty cell content
    const cells = [...nameFromTable[0].matchAll(/<td[^>]*>([^<]*)<\/td>/gi)]
      .map(m => m[1].trim())
      .filter(t => t.length > 1 && !t.includes('@') && !/^\d+$/.test(t))
    if (cells.length > 0) {
      searchShooterName = cells[0]
      if (debug) console.log(`[search-and-add] Name from search table: "${searchShooterName}"`)
    }
  }

  // 4. Find the "Register" link for this user
  //    SSI shows a table with user rows, each having a "Register" button/link
  //    Patterns: .../participant-search-and-add/{userId}/register/
  //              .../register-participant/{userId}/
  const registerLinks = [
    ...searchHtml.matchAll(/href="([^"]*participant-search-and-add\/\d+\/register\/[^"]*)"/gi),
    ...searchHtml.matchAll(/href="([^"]*register-participant\/\d+\/[^"]*)"/gi),
  ]
  if (registerLinks.length > 0) {
    const registerUrl = registerLinks[0][1]
    const fullUrl = registerUrl.startsWith('http') ? registerUrl : `${SSI_BASE}${registerUrl}`
    if (debug) console.log(`[search-and-add] Found register link: ${fullUrl}`)

    const result = await _followRegisterLink(fullUrl, pageUrl, cookies, debug)
    // Propagate shooter name: prefer confirmation form name, fallback to search table name
    if (!result.shooterName && searchShooterName) result.shooterName = searchShooterName
    return result
  }

  // 5. Try broader link patterns in the results area
  const resultArea = searchHtml.match(/SearchNordicUserForm[\s\S]*$/i)?.[0] || searchHtml
  const actionLinks = [...resultArea.matchAll(/href="(\/event\/[^"]*(?:register|add)[^"]*)"/gi)]
    .map(m => m[1])
    .filter(l => !l.includes('search/?') && !l.includes('send-invitation') && !l.includes('create-'))

  if (actionLinks.length > 0) {
    const fullUrl = `${SSI_BASE}${actionLinks[0]}`
    if (debug) console.log(`[search-and-add] Found action link: ${fullUrl}`)
    const result = await _followRegisterLink(fullUrl, pageUrl, cookies, debug)
    if (!result.shooterName && searchShooterName) result.shooterName = searchShooterName
    return result
  }

  // Save debug HTML for investigation
  if (debug) {
    const fs = await import('fs')
    fs.writeFileSync('test-harness/debug-search-and-add-result.html', searchHtml)
    console.log('[search-and-add] No action links found. Saved debug HTML.')
  }

  return { success: false, message: 'user_not_found' }
}

// ============================================================
// Admin: find and approve a CUP participant (web scraping)
// 1. Scrape /event/136/{cupId}/participants/ to find participant by name
// 2. Edit via /event/participant/137/{participantId}/edit/ to set status = "a"
// ============================================================

export async function ssiFindAndApproveCupParticipant(cupId, shooterName, cookies) {
  const debug = process.env.NODE_ENV !== 'production'

  // 1. Scrape CUP participants page
  const partUrl = `${SSI_BASE}/event/136/${cupId}/participants/`
  if (debug) console.log(`[cup-approve] GET ${partUrl} (looking for "${shooterName}")`)
  const resp = await fetch(partUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
  const html = await resp.text()

  // Find participant link: <a href="/event/participant/137/{id}/" ...>Name</a>
  const pattern = /<a[^>]*href="\/event\/participant\/137\/(\d+)\/"[^>]*>([^<]*)<\/a>/gi
  const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))
  if (debug) console.log(`[cup-approve] Search words: ${JSON.stringify(searchWords)}`)

  let participantId = null
  for (const m of html.matchAll(pattern)) {
    const name = m[2].trim().toLowerCase()
    if (searchWords.length > 0 && searchWords.every(w => name.includes(w))) {
      participantId = m[1]
      if (debug) console.log(`[cup-approve] Found: ${m[2].trim()} → participant ${participantId}`)
      break
    }
  }

  if (!participantId) {
    if (debug) console.log(`[cup-approve] "${shooterName}" not found in CUP ${cupId} participants`)
    return { success: false, message: 'Participant not found in CUP' }
  }

  // 2. Check if already approved (look for status indicator near participant)
  const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
  if (statusMatch && statusMatch[1] === 'Approved') {
    if (debug) console.log(`[cup-approve] Already approved`)
    return { success: true, message: 'Already approved' }
  }

  // 3. Edit participant to set status = approved
  const editUrl = `${SSI_BASE}/event/participant/137/${participantId}/edit/`
  if (debug) console.log(`[cup-approve] GET edit form: ${editUrl}`)
  const editResp = await fetch(editUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!editResp.ok) throw new Error(`CUP participant edit page HTTP ${editResp.status}`)
  const editHtml = await editResp.text()

  const formMatch = editHtml.match(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch) throw new Error('No edit form found on CUP participant page')

  const formData = _extractFormFields(formMatch[1])
  formData.set('status', 'a')

  if (debug) console.log(`[cup-approve] POST status=a, fields: ${[...formData.keys()].join(', ')}`)

  const postResp = await fetch(editUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': editUrl,
      'Origin': SSI_BASE,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  if (debug) console.log(`[cup-approve] Response: ${postResp.status}`)

  if (postResp.status === 302 || postResp.status === 301) {
    return { success: true, message: 'Approved' }
  }
  if (postResp.status === 200) {
    const respHtml = await postResp.text()
    if (respHtml.includes('errorlist') || respHtml.includes('is-invalid')) {
      const errMatch = respHtml.match(/<(?:ul|div)[^>]*(?:errorlist|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
      const errText = errMatch ? errMatch[1].replace(/<[^>]+>/g, '').trim() : 'Edit error'
      if (debug) console.log(`[cup-approve] Error: ${errText}`)
      return { success: false, message: errText }
    }
    return { success: true, message: 'Approved (no redirect)' }
  }
  throw new Error(`CUP participant edit failed HTTP ${postResp.status}`)
}

// ============================================================
// Admin: set participant squad + status via edit form (web scraping)
// GET  /event/participant/93/{participantId}/edit/  → extract all fields
// POST /event/participant/93/{participantId}/edit/  → submit with overrides
// ============================================================

export async function ssiSetParticipantSquad(participantId, squadNumber, cookies, statusOverride = 'a') {
  const debug = process.env.NODE_ENV !== 'production'
  const url = `${SSI_BASE}/event/participant/93/${participantId}/edit/`

  // 1. GET the edit form
  if (debug) console.log(`[squad-edit] GET ${url}`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participant edit page HTTP ${resp.status}`)
  const html = await resp.text()

  // 2. Extract the form content
  const formMatch = html.match(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch) throw new Error('No edit form found on participant page')

  // 3. Find the squad option value matching the squad number
  //    Squad options: <option value="4262">Squad 3</option>
  const squadSelectMatch = formMatch[1].match(/<select[^>]*name="squad"[^>]*>([\s\S]*?)<\/select>/i)
  if (!squadSelectMatch) throw new Error('No squad select in edit form')

  let squadValue = null
  const squadOptions = [...squadSelectMatch[1].matchAll(/<option\s+value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)]
  for (const opt of squadOptions) {
    const val = opt[1]
    const label = opt[2].trim()
    // Match "Squad N" label or the Nth non-empty option
    if (label.match(new RegExp(`\\b${squadNumber}\\b`)) || label.startsWith(`${squadNumber} `)) {
      squadValue = val
      break
    }
  }
  // Fallback: use Nth non-empty option (squad numbers are 1-indexed)
  if (!squadValue) {
    const nonEmpty = squadOptions.filter(o => o[1])
    if (nonEmpty.length >= squadNumber) {
      squadValue = nonEmpty[squadNumber - 1][1]
    }
  }
  if (!squadValue) throw new Error(`Squad ${squadNumber} not found in edit form options`)
  if (debug) console.log(`[squad-edit] Squad ${squadNumber} → value ${squadValue}`)

  // 4. Extract all form fields using shared helper
  const formData = _extractFormFields(formMatch[1])

  // 5. Override squad and status
  formData.set('squad', squadValue)
  formData.set('status', statusOverride)

  if (debug) console.log(`[squad-edit] POST squad=${squadValue} status=${statusOverride} fields: ${[...formData.keys()].join(', ')}`)

  // 5. POST the edit form
  const editResp = await fetch(url, {
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

  if (debug) console.log(`[squad-edit] Response: ${editResp.status}`)

  if (editResp.status === 302 || editResp.status === 301) {
    return { success: true }
  }
  if (editResp.status === 200) {
    const respHtml = await editResp.text()
    if (respHtml.includes('errorlist') || respHtml.includes('is-invalid')) {
      const errorMatch = respHtml.match(/<(?:ul|div)[^>]*(?:errorlist|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Edit error'
      if (debug) console.log(`[squad-edit] Error: ${errorText}`)
      return { success: false, message: errorText }
    }
    return { success: true }
  }
  throw new Error(`Participant edit failed HTTP ${editResp.status}`)
}

// ============================================================
// Admin: find competitor ID in a match by scraping participants page
// GET /event/91/{matchId}/participants/
// Returns the participant ID if found, or null
// ============================================================

export async function ssiFindCompetitorInMatch(matchId, shooterName, cookies) {
  const debug = process.env.NODE_ENV !== 'production'
  const url = `${SSI_BASE}/event/91/${matchId}/participants/`

  if (debug) console.log(`[find-competitor] GET ${url} (looking for "${shooterName}")`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participants page HTTP ${resp.status} for match ${matchId}`)
  const html = await resp.text()

  // Participant links: <a href="/event/participant/93/{id}/">Name</a>
  // or: <a href="/event/participant/93/{id}/" class="...">Name</a>
  const pattern = /<a[^>]*href="\/event\/participant\/93\/(\d+)\/"[^>]*>([^<]*)<\/a>/gi

  // Normalize search: split into words for flexible matching (handles double spaces etc.)
  // Keep single-char digits (e.g. "2") to distinguish "Tuloskone 1" from "Tuloskone 2"
  const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))
  if (debug) console.log(`[find-competitor] Search words: ${JSON.stringify(searchWords)}`)

  for (const m of html.matchAll(pattern)) {
    const compId = m[1]
    const name = m[2].trim()
    const nameLower = name.toLowerCase()
    // Match if all search words appear in the name
    if (searchWords.length > 0 && searchWords.every(w => nameLower.includes(w))) {
      if (debug) console.log(`[find-competitor] Found: ${name} → participant ${compId}`)
      return compId
    }
  }

  if (debug) console.log(`[find-competitor] "${shooterName}" not found in match ${matchId}`)
  return null
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
