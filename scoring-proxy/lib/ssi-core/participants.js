// ============================================================
// SSI Core — Participants Domain
// Participant search/add/delete/approve, squad assignment,
// status changes, trainer squad registration, and CUP status scraping.
// ============================================================

import { SSI_BASE_URL } from './constants.js'
import { log } from '../logger.js'
import { formatCookies } from './http-helpers.js'

// ============================================================
// Private helpers
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

    const fullAction = formAction.startsWith('http') ? formAction : `${SSI_BASE_URL}${formAction}`
    const confirmResp = await fetch(fullAction, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': formatCookies(cookies),
        'Referer': url,
        'Origin': SSI_BASE_URL,
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

export async function ssiSearchAndAddParticipant(eventContentType, eventId, email, cookies, { firstName, lastName } = {}) {
  const pageUrl = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/participant-search-and-add/`
  const debug = log.isEnabled('debug')

  // SSI search-and-add is a two-step form (NO CSRF tokens — SSI doesn't use them):
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': pageUrl,
      'Origin': SSI_BASE_URL,
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
  let searchShooterName = null
  const nameFromTable = searchHtml.match(/<tr[^>]*>[\s\S]*?(?:register|Register)[\s\S]*?<\/tr>/i)
  if (nameFromTable) {
    const cells = [...nameFromTable[0].matchAll(/<td[^>]*>([^<]*)<\/td>/gi)]
      .map(m => m[1].trim())
      .filter(t => t.length > 1 && !t.includes('@') && !/^\d+$/.test(t))
    if (cells.length > 0) {
      searchShooterName = cells[0]
      if (debug) console.log(`[search-and-add] Name from search table: "${searchShooterName}"`)
    }
  }

  // 4. Find the "Register" link for this user
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

  if (debug) console.log('[search-and-add] No action links found in search response.')
  return { success: false, message: 'user_not_found' }
}

// ============================================================
// Admin: find and delete a CUP participant (web scraping)
// 1. If participantId provided: use it directly (email-based match from GraphQL)
// 2. Otherwise: Scrape /event/136/{cupId}/participants/ to find participant by name
// 3. Use toggle-status to cycle Pending → Deleted (3 toggles)
//    Toggle cycle: Pending → Approved → Approved(no results) → Deleted → Pending
// ============================================================

export async function ssiFindAndDeleteCupParticipant(cupId, shooterName, cookies, email = null, participantId = null) {
  const debug = log.isEnabled('debug')

  const partUrl = `${SSI_BASE_URL}/event/136/${cupId}/participants/`

  // If participantId provided, use it directly (email-verified from GraphQL)
  if (participantId) {
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-delete] Using GraphQL participant ID ${participantId} for ${searchDesc}`)

    // Fetch the page to check current status
    const resp = await fetch(partUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
    const html = await resp.text()

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-delete] Current status: "${currentStatus}"`)

    if (currentStatus === 'Deleted') {
      if (debug) console.log(`[cup-delete] Already deleted`)
      return { success: true, message: 'Already deleted' }
    }
  } else {
    // Legacy path: scrape HTML to find participant by name
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-delete] GET ${partUrl} (looking for ${searchDesc})`)
    const resp = await fetch(partUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
    const html = await resp.text()

    // Find participant link: <a href="/event/participant/137/{id}/" ...>Name</a>
    const pattern = /<a[^>]*href="\/event\/participant\/137\/(\d+)\/"[^>]*>([^<]*)<\/a>/gi
    const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))
    if (debug) console.log(`[cup-delete] Search words: ${JSON.stringify(searchWords)}`)

    const matches = []
    for (const m of html.matchAll(pattern)) {
      const name = m[2].trim().toLowerCase()
      if (searchWords.length > 0 && searchWords.every(w => name.includes(w))) {
        matches.push({ id: m[1], name: m[2].trim() })
      }
    }

    if (matches.length === 0) {
      if (debug) console.log(`[cup-delete] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    if (matches.length > 1) {
      console.warn(`[cup-delete] WARNING: Multiple name matches found for "${shooterName}" in CUP ${cupId}:`, matches.map(m => m.name))
      if (email) {
        console.warn(`[cup-delete] Email provided for disambiguation: ${email} (but cannot verify from HTML)`)
      } else {
        console.warn(`[cup-delete] No email provided for disambiguation - using first match`)
      }
    }

    participantId = matches[0].id
    if (debug) console.log(`[cup-delete] Found: ${matches[0].name} → participant ${participantId}`)

    if (!participantId) {
      if (debug) console.log(`[cup-delete] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-delete] Current status: "${currentStatus}"`)

    if (currentStatus === 'Deleted') {
      if (debug) console.log(`[cup-delete] Already deleted`)
      return { success: true, message: 'Already deleted' }
    }
  }

  // 3. Toggle status 3 times: Pending → Approved → Approved(no results) → Deleted
  const toggleUrl = `${SSI_BASE_URL}/event/participant/137/${participantId}/toggle-status/?next=${partUrl}`

  for (let i = 0; i < 3; i++) {
    if (debug) console.log(`[cup-delete] Toggle ${i + 1}/3: ${toggleUrl}`)
    const toggleResp = await fetch(toggleUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!toggleResp.ok) throw new Error(`Toggle-status HTTP ${toggleResp.status}`)

    // Check status after each toggle
    const verifyHtml = await toggleResp.text()
    const newStatusMatch = verifyHtml.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const newStatus = newStatusMatch ? newStatusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-delete] Status after toggle ${i + 1}: "${newStatus}"`)

    // If we reached Deleted early, we're done
    if (newStatus === 'Deleted') {
      return { success: true, message: 'Deleted' }
    }
  }

  // 4. Verify final status
  const finalResp = await fetch(partUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  const finalHtml = await finalResp.text()
  const finalStatusMatch = finalHtml.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
  const finalStatus = finalStatusMatch ? finalStatusMatch[1] : 'unknown'
  if (debug) console.log(`[cup-delete] Final status: "${finalStatus}"`)

  if (finalStatus === 'Deleted') {
    return { success: true, message: 'Deleted' }
  }

  if (debug) console.log(`[cup-delete] Unexpected status after 3 toggles: "${finalStatus}"`)
  return { success: false, message: `Toggle resulted in "${finalStatus}", expected "Deleted"` }
}

// ============================================================
// Admin: find and approve a CUP participant (web scraping)
// 1. If participantId provided: use it directly (email-based match from GraphQL)
// 2. Otherwise: Scrape /event/136/{cupId}/participants/ to find participant by name
// 3. Use toggle-status to cycle Pending → Approved
//    NOTE: CUP participant edit form (ct=137) does NOT support status changes.
//          Only the toggle-status URL works for CUP participants.
//          Toggle cycle: Pending → Approved → Approved(no results) → Deleted → Pending
// ============================================================

export async function ssiFindAndApproveCupParticipant(cupId, shooterName, cookies, email = null, participantId = null) {
  const debug = log.isEnabled('debug')

  const partUrl = `${SSI_BASE_URL}/event/136/${cupId}/participants/`

  // If participantId provided, use it directly (email-verified from GraphQL)
  if (participantId) {
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-approve] Using GraphQL participant ID ${participantId} for ${searchDesc}`)

    // Fetch the page to check current status
    const resp = await fetch(partUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
    const html = await resp.text()

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-approve] Current status: "${currentStatus}"`)

    if (currentStatus === 'Approved') {
      if (debug) console.log(`[cup-approve] Already approved`)
      return { success: true, message: 'Already approved' }
    }
  } else {
    // Legacy path: scrape HTML to find participant by name
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-approve] GET ${partUrl} (looking for ${searchDesc})`)
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

    const matches = []
    for (const m of html.matchAll(pattern)) {
      const name = m[2].trim().toLowerCase()
      if (searchWords.length > 0 && searchWords.every(w => name.includes(w))) {
        matches.push({ id: m[1], name: m[2].trim() })
      }
    }

    if (matches.length === 0) {
      if (debug) console.log(`[cup-approve] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    if (matches.length > 1) {
      console.warn(`[cup-approve] WARNING: Multiple name matches found for "${shooterName}" in CUP ${cupId}:`, matches.map(m => m.name))
      if (email) {
        console.warn(`[cup-approve] Email provided for disambiguation: ${email} (but cannot verify from HTML)`)
      } else {
        console.warn(`[cup-approve] No email provided for disambiguation - using first match`)
      }
    }

    participantId = matches[0].id
    if (debug) console.log(`[cup-approve] Found: ${matches[0].name} → participant ${participantId}`)

    if (!participantId) {
      if (debug) console.log(`[cup-approve] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-approve] Current status: "${currentStatus}"`)

    if (currentStatus === 'Approved') {
      if (debug) console.log(`[cup-approve] Already approved`)
      return { success: true, message: 'Already approved' }
    }
  }

  // Toggle status: Pending → Approved (one toggle from Pending)
  const toggleUrl = `${SSI_BASE_URL}/event/participant/137/${participantId}/toggle-status/?next=${partUrl}`
  if (debug) console.log(`[cup-approve] GET toggle-status: ${toggleUrl}`)

  const toggleResp = await fetch(toggleUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!toggleResp.ok) throw new Error(`Toggle-status HTTP ${toggleResp.status}`)

  // 4. Verify the new status
  const verifyHtml = await toggleResp.text()
  const newStatusMatch = verifyHtml.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
  const newStatus = newStatusMatch ? newStatusMatch[1] : 'unknown'
  if (debug) console.log(`[cup-approve] New status: "${newStatus}"`)

  if (newStatus === 'Approved') {
    return { success: true, message: 'Approved' }
  }

  if (debug) console.log(`[cup-approve] Unexpected status after toggle: "${newStatus}"`)
  return { success: false, message: `Toggle resulted in "${newStatus}", expected "Approved"` }
}

// ============================================================
// Admin: set participant squad + status via edit form (web scraping)
// GET  /event/participant/{participantCT}/{participantId}/edit/  → extract all fields
// POST /event/participant/{participantCT}/{participantId}/edit/  → submit with overrides
// participantContentType: 93 for Nordic matches, 23 for IPSC/SRA matches
// ============================================================

export async function ssiSetParticipantSquad(participantId, squadNumber, cookies, statusOverride = 'a', participantContentType = 93) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/edit/`

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
  const squadSelectMatch = formMatch[1].match(/<select[^>]*name="squad"[^>]*>([\s\S]*?)<\/select>/i)
  if (!squadSelectMatch) throw new Error('No squad select in edit form')

  let squadValue = null
  const squadOptions = [...squadSelectMatch[1].matchAll(/<option\s+value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)]
  for (const opt of squadOptions) {
    const val = opt[1]
    const label = opt[2].trim()
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
      'Origin': SSI_BASE_URL,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  log.info(`[squad-edit] POST CT=${participantContentType} id=${participantId} squad=${squadValue} status=${statusOverride} → HTTP ${editResp.status}`)

  if (editResp.status === 302 || editResp.status === 301) {
    return { success: true, httpStatus: editResp.status }
  }
  if (editResp.status === 200) {
    const respHtml = await editResp.text()
    if (respHtml.includes('errorlist') || respHtml.includes('is-invalid')) {
      const errorMatch = respHtml.match(/<(?:ul|div)[^>]*(?:errorlist|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Edit error'
      log.warn(`[squad-edit] Form error: ${errorText}`)
      return { success: false, message: errorText, httpStatus: 200 }
    }
    // HTTP 200 without error class — SSI may have re-rendered the form without applying changes
    log.warn(`[squad-edit] HTTP 200 without redirect — squad change may not have been applied (CT=${participantContentType})`)
    return { success: true, httpStatus: 200, warning: 'no-redirect' }
  }
  throw new Error(`Participant edit failed HTTP ${editResp.status}`)
}

// ============================================================
// Admin: set match participant status (web scraping)
// GET  /event/participant/{participantCT}/{participantId}/edit/  → extract all fields
// POST /event/participant/{participantCT}/{participantId}/edit/  → submit with status override
// Used to delete match participants by setting status='d'
// participantContentType: 93 for Nordic matches, 23 for IPSC/SRA matches
// ============================================================

export async function ssiSetMatchParticipantStatus(participantId, status, cookies, participantContentType = 93) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/edit/`

  // 1. GET the edit form
  if (debug) console.log(`[match-status] GET ${url}`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participant edit page HTTP ${resp.status}`)
  const html = await resp.text()

  // 2. Extract the form content
  const formMatch = html.match(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch) throw new Error('No edit form found on participant page')

  // 3. Extract all form fields using shared helper
  const formData = _extractFormFields(formMatch[1])

  // 4. Override status
  formData.set('status', status)

  if (debug) console.log(`[match-status] POST status=${status} fields: ${[...formData.keys()].join(', ')}`)

  // 5. POST the edit form
  const editResp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': url,
      'Origin': SSI_BASE_URL,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  if (debug) console.log(`[match-status] Response: ${editResp.status}`)

  if (editResp.status === 302 || editResp.status === 301) {
    return { success: true }
  }
  if (editResp.status === 200) {
    const respHtml = await editResp.text()
    if (respHtml.includes('errorlist') || respHtml.includes('is-invalid')) {
      const errorMatch = respHtml.match(/<(?:ul|div)[^>]*(?:errorlist|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Edit error'
      if (debug) console.log(`[match-status] Error: ${errorText}`)
      return { success: false, message: errorText }
    }
    return { success: true }
  }
  throw new Error(`Participant status edit failed HTTP ${editResp.status}`)
}

// ============================================================
// Admin: delete a match participant (wrapper for status change)
// Sets status='d' for the participant
// participantContentType: 93 for Nordic matches, 23 for IPSC/SRA matches (CT 22)
// ============================================================

export async function ssiDeleteMatchParticipant(matchId, participantId, shooterName, cookies, participantContentType = 93) {
  const debug = log.isEnabled('debug')

  if (debug) console.log(`[match-delete] Deleting "${shooterName}" (ID ${participantId}) from match ${matchId}, participantCT=${participantContentType}`)

  const result = await ssiSetMatchParticipantStatus(participantId, 'd', cookies, participantContentType)

  if (result.success) {
    if (debug) console.log(`[match-delete] Successfully deleted "${shooterName}" from match ${matchId}`)
    return { success: true, message: 'Deleted from match' }
  } else {
    if (debug) console.log(`[match-delete] Failed to delete "${shooterName}": ${result.message}`)
    return result
  }
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

  // Step 1: Search by email
  const searchData = new URLSearchParams()
  searchData.append('last_name', '')
  searchData.append('first_name', '')
  searchData.append('email', email)
  searchData.append('submit', 'Search')

  if (debug) console.log(`[trainer-squad] POST search email=${email} to ${pageUrl}`)
  const searchResp = await fetch(pageUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': pageUrl,
      'Origin': SSI_BASE_URL,
    },
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': fullRegUrl,
      'Origin': SSI_BASE_URL,
    },
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

// ============================================================
// Admin: find competitor ID in a match by scraping participants page
// GET /event/91/{matchId}/participants/
// Returns the participant ID if found, or null
// Optional email parameter is used for disambiguation if multiple
// participants match the same shooter name.
// ============================================================

export async function ssiFindCompetitorInMatch(matchId, shooterName, cookies, email = null) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/91/${matchId}/participants/`

  const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
  if (debug) console.log(`[find-competitor] GET ${url} (looking for ${searchDesc})`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participants page HTTP ${resp.status} for match ${matchId}`)
  const html = await resp.text()

  // Normalize search: split into words for flexible matching (handles double spaces etc.)
  // Keep single-char digits (e.g. "2") to distinguish "Tuloskone 1" from "Tuloskone 2"
  const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))
  if (debug) console.log(`[find-competitor] Search words: ${JSON.stringify(searchWords)}`)

  // Parse by table row so we can use row text (e.g. email) for disambiguation
  const rows = html.split(/<tr[\s>]/i).slice(1)
  const matches = []

  for (const row of rows) {
    // Participant link pattern: <a href="/event/participant/93/{id}/">Name</a>
    const participantMatch = row.match(/<a[^>]*href="\/event\/participant\/93\/(\d+)\/"[^>]*>([^<]*)<\/a>/i)
    if (!participantMatch) continue

    const compId = participantMatch[1]
    const name = participantMatch[2].trim()
    const nameLower = name.toLowerCase()

    // Match if all search words appear in the participant name
    if (searchWords.length > 0 && searchWords.every(w => nameLower.includes(w))) {
      matches.push({ id: compId, name, row })
    }
  }

  if (matches.length === 0) {
    if (debug) console.log(`[find-competitor] ${searchDesc} not found in match ${matchId}`)
    return null
  }

  if (matches.length === 1) {
    if (debug) console.log(`[find-competitor] Found: ${matches[0].name} → participant ${matches[0].id}`)
    return matches[0].id
  }

  // Multiple name matches found — try to disambiguate by email from row text.
  console.warn(`[find-competitor] WARNING: Multiple name matches found for "${shooterName}" in match ${matchId}:`, matches.map(m => m.name))
  if (email) {
    const emailLower = email.toLowerCase()
    const emailMatches = matches.filter(m => m.row.toLowerCase().includes(emailLower))

    if (emailMatches.length === 1) {
      if (debug) console.log(`[find-competitor] Email-disambiguated: ${emailMatches[0].name} (${email}) → participant ${emailMatches[0].id}`)
      return emailMatches[0].id
    }

    if (emailMatches.length > 1) {
      console.warn(`[find-competitor] WARNING: Multiple email matches for ${email} in match ${matchId}; using first match`)
      return emailMatches[0].id
    }

    console.warn(`[find-competitor] WARNING: Email ${email} not found in matched rows for match ${matchId}; using first name match`)
  }

  return matches[0].id
}

// ============================================================
// Admin: find participant in any event by scraping participants page.
// General-purpose version of ssiFindCompetitorInMatch (which is Nordic-only).
//
// Scrapes /event/{eventContentType}/{eventId}/participants/ with admin cookies.
// Parses participant links: <a href="/event/participant/{participantCT}/{id}/">Name</a>
// Matches by shooterName (word-based flexible matching).
// Returns { participantId, participantCT } or null.
//
// Why scraping instead of GraphQL?
//   SSI GraphQL returns competitor data but the admin JWT does NOT include
//   shooter.email for other users (privacy restriction). Web scraping with
//   admin cookies has no such limitation — all participant data is visible.
// ============================================================

export async function ssiFindParticipantInEvent(eventContentType, eventId, shooterName, cookies) {
  const url = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/participants/`

  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participants page HTTP ${resp.status} for event ${eventId}`)
  const html = await resp.text()

  // Participant links: <a href="/event/participant/{ct}/{id}/">Name</a>
  // Captures: [1]=participantCT, [2]=participantId, [3]=name
  const pattern = /<a[^>]*href="\/event\/participant\/(\d+)\/(\d+)\/"[^>]*>([^<]*)<\/a>/gi

  // Normalize search: split into words for flexible matching
  const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))

  for (const m of html.matchAll(pattern)) {
    const participantCT = m[1]
    const participantId = m[2]
    const name = m[3].trim()
    const nameLower = name.toLowerCase()
    if (searchWords.length > 0 && searchWords.every(w => nameLower.includes(w))) {
      return { participantId, participantCT: parseInt(participantCT) }
    }
  }

  return null
}

// ============================================================
// CUP Management: Set "Did Not Show" (DNS) on a participant
// GET /event/participant/{ct}/{participantId}/set-did-not-show/?next=...
// SSI redirects (302) on success.
// ct: 137 for CUP participants, 93 for Nordic match participants
// ============================================================

export async function ssiSetDidNotShow(participantContentType, participantId, cookies, nextUrl = '') {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/set-did-not-show/`
  const fullUrl = nextUrl ? `${url}?next=${nextUrl}` : url

  if (debug) console.log(`[dns-set] GET ${fullUrl}`)
  const resp = await fetch(fullUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  })

  if (debug) console.log(`[dns-set] Response: ${resp.status}`)

  // SSI redirects (302/301) on success. A 200 likely means redirect to login/error page.
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Did Not Show set' }
  }
  throw new Error(`Set Did Not Show failed HTTP ${resp.status}`)
}

// ============================================================
// CUP Management: Undo "Did Not Show" (DNS) on a participant
// GET /event/participant/{ct}/{participantId}/undo-did-not-show/?next=...
// SSI redirects (302) on success.
// ct: 137 for CUP participants, 93 for Nordic match participants
// ============================================================

export async function ssiUndoDidNotShow(participantContentType, participantId, cookies, nextUrl = '') {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/undo-did-not-show/`
  const fullUrl = nextUrl ? `${url}?next=${nextUrl}` : url

  if (debug) console.log(`[dns-undo] GET ${fullUrl}`)
  const resp = await fetch(fullUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  })

  if (debug) console.log(`[dns-undo] Response: ${resp.status}`)

  // SSI redirects (302/301) on success. A 200 likely means redirect to login/error page.
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Did Not Show undone' }
  }
  throw new Error(`Undo Did Not Show failed HTTP ${resp.status}`)
}

// ============================================================
// CUP Management: Toggle paid status on a participant
// GET /event/participant/{ct}/{participantId}/toggle-paid/?next=...
// SSI redirects (302) on success.
// ct: 137 for CUP participants
// ============================================================

export async function ssiTogglePaid(participantContentType, participantId, cookies, nextUrl = '') {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/toggle-paid/`
  const fullUrl = nextUrl ? `${url}?next=${nextUrl}` : url

  if (debug) console.log(`[toggle-paid] GET ${fullUrl}`)
  const resp = await fetch(fullUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  })

  if (debug) console.log(`[toggle-paid] Response: ${resp.status}`)

  // SSI redirects (302/301) on success
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Paid status toggled' }
  }
  throw new Error(`Toggle paid failed HTTP ${resp.status}`)
}

// ============================================================
// CUP Management: Scrape CUP participants page for paid + DNS status
// GET /event/136/{cupId}/participants/
// Returns Map<participantId, { paid: bool, didNotShow: bool }>
// ============================================================

export async function ssiGetCupParticipantStatuses(cupId, cookies) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/136/${cupId}/participants/`

  if (debug) console.log(`[cup-status] GET ${url}`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
  const html = await resp.text()

  const statuses = new Map()

  // Parse each table row to extract participant ID, paid status, and DNS status
  const rows = html.split(/<tr[\s>]/i).slice(1)

  let firstRowLogged = false
  for (const row of rows) {
    // Extract participant ID from link: /event/participant/137/{id}/
    const partMatch = row.match(/\/event\/participant\/137\/(\d+)\//)
    if (!partMatch) continue
    const partId = partMatch[1]

    // Log first row's toggle-paid context to understand SSI HTML structure
    if (!firstRowLogged) {
      const toggleContext = row.match(/toggle-paid[\s\S]{0,200}/i)
      if (debug) console.log(`[cup-status] Sample row toggle-paid context: ${toggleContext ? toggleContext[0].substring(0, 200) : 'NOT FOUND'}`)
      const dnsContext = row.match(/(set-did-not-show|undo-did-not-show)[\s\S]{0,100}/i)
      if (debug) console.log(`[cup-status] Sample row DNS context: ${dnsContext ? dnsContext[0].substring(0, 100) : 'NOT FOUND'}`)
      firstRowLogged = true
    }

    // Paid status: SSI shows text content inside the toggle-paid link
    // Pattern: <a href="...toggle-paid/">all</a> (paid) or <a href="...toggle-paid/">no</a> (unpaid)
    const paidMatch = row.match(/toggle-paid\/?"?>(\w+)<\/a>/i)
    const paid = paidMatch ? paidMatch[1].toLowerCase() === 'all' : false

    // DNS status: check if row contains "Did not show" or undo-did-not-show link
    const didNotShow = /did.not.show/i.test(row) || row.includes(`/${partId}/undo-did-not-show/`)

    statuses.set(partId, { paid, didNotShow })
  }

  if (debug) console.log(`[cup-status] Found ${statuses.size} participants with status data`)
  return statuses
}
