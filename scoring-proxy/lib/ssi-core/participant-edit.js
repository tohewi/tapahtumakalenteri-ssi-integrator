// ============================================================
// SSI Core — Participant Edit Helpers
// Form-based scraping functions that edit an existing participant's
// squad or status via SSI's HTML edit form.
// Imported by participants.js (the Participants domain barrel).
// ============================================================

import {
  SSI_BASE_URL,
  log,
  formatCookies,
  _participantResponseCookies,
  _participantFormHeaders,
  _extractFormFields,
} from "./http-helpers.js"

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
  cookies = _participantResponseCookies(cookies, resp)

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
    headers: _participantFormHeaders(cookies, url),
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
  cookies = _participantResponseCookies(cookies, resp)

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
    headers: _participantFormHeaders(cookies, url),
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
// Admin: set match participant number via edit form (GQL-HF5)
// GET /event/participant/{participantCT}/{participantId}/edit/
// POST with overridden 'number' field
// ============================================================

export async function ssiSetParticipantNumber(participantId, number, cookies, participantContentType = 93) {
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/edit/`
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participant edit page HTTP ${resp.status}`)
  const html = await resp.text()
  cookies = _participantResponseCookies(cookies, resp)

  const formMatch = html.match(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch) throw new Error('No edit form found on participant page')

  const formData = _extractFormFields(formMatch[1])
  formData.set('number', String(number))

  const editResp = await fetch(url, {
    method: 'POST',
    headers: _participantFormHeaders(cookies, url),
    body: formData.toString(),
    redirect: 'manual',
  })

  if (editResp.status === 302 || editResp.status === 301) {
    return { success: true }
  }
  if (editResp.status === 200) {
    const respHtml = await editResp.text()
    if (respHtml.includes('errorlist') || respHtml.includes('is-invalid')) {
      const errorMatch = respHtml.match(/<(?:ul|div)[^>]*(?:errorlist|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Edit error'
      return { success: false, message: errorText }
    }
    return { success: true }
  }
  throw new Error(`Participant number edit failed HTTP ${editResp.status}`)
}
