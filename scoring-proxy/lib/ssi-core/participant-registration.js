// ============================================================
// SSI Core — Participant Registration & Edit Helpers
// Form-based scraping functions for adding participants to events
// and editing their squad/status via SSI's HTML edit forms.
// Imported by participants.js (the Participants domain barrel).
// ============================================================

import {
  SSI_BASE_URL,
  log,
  formatCookies,
  _participantResponseCookies,
  _participantFormHeaders,
  _participantSearchCookies,
  _extractFormFields,
} from "./http-helpers.js"

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
    if (debug) console.log(`[search-and-add] Response: ${html.length} chars`)
    return await _handleRegisterResponse(html, url, _participantResponseCookies(cookies, resp), debug)
  }

  throw new Error(`Register participant failed HTTP ${resp.status}`)
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

    const fullAction = formAction.startsWith('http') ? formAction : `${SSI_BASE_URL}${formAction}`
    const confirmResp = await fetch(fullAction, {
      method: 'POST',
      headers: _participantFormHeaders(cookies, url),
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

export async function ssiSearchAndAddParticipant(eventContentType, eventId, email, cookies, { firstName, lastName } = {}) {
  const pageUrl = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/participant-search-and-add/`
  const debug = log.isEnabled('debug')
  cookies = await _participantSearchCookies(pageUrl, cookies)

  // SSI search-and-add is a two-step form (CSRF cookie must accompany POSTs):
  // Step 1: POST search (last_name, first_name, email, submit=Search) → returns result table
  // Step 2: GET the "add" link for the matching user → redirects to participants page

  // 1. POST search by email or name
  const formData = new URLSearchParams()
  formData.append('last_name', lastName || '')
  formData.append('first_name', firstName || '')
  formData.append('email', email || '')
  formData.append('submit', 'Search')

  const searchDesc = email ? `email=${email}` : `name=${firstName} ${lastName}`
  if (debug) console.log(`[search-and-add] POST search ${searchDesc} to ${pageUrl}`)
  const searchResp = await fetch(pageUrl, {
    method: 'POST',
    headers: _participantFormHeaders(cookies, pageUrl),
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
  cookies = _participantResponseCookies(cookies, searchResp)
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
    const fullUrl = registerUrl.startsWith('http') ? registerUrl : `${SSI_BASE_URL}${registerUrl}`
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
    const fullUrl = `${SSI_BASE_URL}${actionLinks[0]}`
    if (debug) console.log(`[search-and-add] Found action link: ${fullUrl}`)
    const result = await _followRegisterLink(fullUrl, pageUrl, cookies, debug)
    if (!result.shooterName && searchShooterName) result.shooterName = searchShooterName
    return result
  }

  // No action links found
  if (debug) console.log('[search-and-add] No action links found in search response.')

  return { success: false, message: 'user_not_found' }
}

// ============================================================
// Staffing: register user to trainer squad in one step
// 1. POST search-and-add by email → find register link
// 2. GET register link → confirmation form with squad select
// 3. Override squad + status → POST confirmation
// ============================================================

export async function ssiRegisterToTrainerSquad(eventContentType, eventId, email, trainerSquadName, cookies) {
  const debug = log.isEnabled('debug')
  const pageUrl = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/participant-search-and-add/`
  cookies = await _participantSearchCookies(pageUrl, cookies)

  // Step 1: Search by email
  const searchData = new URLSearchParams()
  searchData.append('last_name', '')
  searchData.append('first_name', '')
  searchData.append('email', email)
  searchData.append('submit', 'Search')

  if (debug) console.log(`[trainer-squad] POST search email=${email} to ${pageUrl}`)
  const searchResp = await fetch(pageUrl, {
    method: 'POST',
    headers: _participantFormHeaders(cookies, pageUrl),
    body: searchData.toString(),
    redirect: 'manual',
  })

  if (searchResp.status === 302) {
    return { success: true, message: 'Already registered (redirect)' }
  }
  if (searchResp.status !== 200) {
    throw new Error(`Trainer squad search failed HTTP ${searchResp.status}`)
  }

  const searchHtml = await searchResp.text()
  cookies = _participantResponseCookies(cookies, searchResp)

  if (searchHtml.includes('no results') || searchHtml.includes('gave no results')) {
    return { success: false, message: 'User not found in SSI by email' }
  }

  // Step 2: Find register link
  const registerLinks = [
    ...searchHtml.matchAll(/href="([^"]*participant-search-and-add\/\d+\/register\/[^"]*)"/gi),
    ...searchHtml.matchAll(/href="([^"]*register-participant\/\d+\/[^"]*)"/gi),
  ]
  if (registerLinks.length === 0) {
    // Maybe already registered
    if (searchHtml.includes('already registered') || searchHtml.includes('jo ilmoittautunut')) {
      return { success: true, message: 'Already registered' }
    }
    return { success: false, message: 'No register link found for user' }
  }

  const registerUrl = registerLinks[0][1]
  const fullRegUrl = registerUrl.startsWith('http') ? registerUrl : `${SSI_BASE_URL}${registerUrl}`
  if (debug) console.log(`[trainer-squad] GET register link: ${fullRegUrl}`)

  const regResp = await fetch(fullRegUrl, {
    headers: { 'Cookie': formatCookies(cookies), 'Referer': pageUrl },
    redirect: 'follow',
  })
  if (!regResp.ok) throw new Error(`Register page HTTP ${regResp.status}`)
  const regHtml = await regResp.text()
  cookies = _participantResponseCookies(cookies, regResp)

  // Step 3: Find and fill confirmation form
  const formMatch = regHtml.match(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch) {
    if (regHtml.includes('already registered') || regHtml.includes('jo ilmoittautunut')) {
      return { success: true, message: 'Already registered' }
    }
    return { success: false, message: 'No confirmation form found' }
  }

  const formData = _extractFormFields(formMatch[1])

  // Find trainer squad value by matching label
  const squadSelect = formMatch[1].match(/<select[^>]*name="squad"[^>]*>([\s\S]*?)<\/select>/i)
  let squadValue = null
  if (squadSelect) {
    const opts = [...squadSelect[1].matchAll(/<option\s+value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)]
    for (const opt of opts) {
      const val = opt[1]
      const label = opt[2].trim()
      // Match "Squad N" label or the Nth non-empty option
      if (label.toLowerCase().includes(trainerSquadName.toLowerCase().replace(/\./g, '').trim())) {
        squadValue = val
        break
      }
    }
    // Fallback: match by squad number in label (e.g. "Squad 5" matches "5")
    if (!squadValue) {
      const numMatch = trainerSquadName.match(/\d+/)
      if (numMatch) {
        for (const opt of opts) {
          if (opt[2].trim().match(new RegExp(`\\b${numMatch[0]}\\b`)) && opt[1]) {
            squadValue = opt[1]
            break
          }
        }
      }
    }
  }

  if (!squadValue) {
    if (debug) console.log(`[trainer-squad] WARNING: Could not find squad "${trainerSquadName}" in form`)
    return { success: false, message: `Trainer squad "${trainerSquadName}" not found in event` }
  }

  // Override squad and status
  formData.set('squad', squadValue)
  formData.set('status', 'a') // Approved
  formData.set('has_accepted_event_data_policy', 'on')

  // Submit button
  const submitMatch = formMatch[1].match(/<input[^>]*type="submit"[^>]*name=["']([^"']*)["'][^>]*value="([^"]*)"/i)
  if (submitMatch) formData.set(submitMatch[1], submitMatch[2])

  // SSI anti-bot: form_loaded_at timestamp check — must wait 5+ seconds
  if (debug) console.log('[trainer-squad] Waiting 5s (SSI anti-bot)...')
  await new Promise(r => setTimeout(r, 5000))

  // Extract form action
  const actionMatch = regHtml.match(/<form[^>]*action="([^"]*)"[^>]*method="post"/i)
    || regHtml.match(/<form[^>]*method="post"[^>]*action="([^"]*)"/i)
  let formAction = actionMatch?.[1] || ''
  if (!formAction || formAction === '#') formAction = fullRegUrl
  const fullAction = formAction.startsWith('http') ? formAction : `${SSI_BASE_URL}${formAction}`

  if (debug) console.log(`[trainer-squad] POST confirm to: ${fullAction}, squad=${squadValue}, status=a`)

  const confirmResp = await fetch(fullAction, {
    method: 'POST',
    headers: _participantFormHeaders(cookies, fullRegUrl),
    body: formData.toString(),
    redirect: 'manual',
  })

  if (debug) console.log(`[trainer-squad] Confirm response: ${confirmResp.status}`)

  if (confirmResp.status === 302 || confirmResp.status === 301) {
    return { success: true, message: 'Registered to trainer squad' }
  }
  if (confirmResp.status === 200) {
    const confirmHtml = await confirmResp.text()
    if (confirmHtml.includes('already registered') || confirmHtml.includes('Shooter already registered')) {
      return { success: true, message: 'Already registered' }
    }
    if (confirmHtml.includes('too quickly')) {
      return { success: false, message: 'SSI anti-bot: submitted too quickly' }
    }
    if (confirmHtml.includes('errorlist') || confirmHtml.includes('is-invalid')) {
      const errMatch = confirmHtml.match(/<(?:ul|div)[^>]*(?:errorlist|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
      const errText = errMatch ? errMatch[1].replace(/<[^>]+>/g, '').trim() : 'Form error'
      return { success: false, message: errText }
    }
    return { success: true, message: 'Registered to trainer squad (confirmed)' }
  }
  throw new Error(`Trainer squad registration failed HTTP ${confirmResp.status}`)
}
