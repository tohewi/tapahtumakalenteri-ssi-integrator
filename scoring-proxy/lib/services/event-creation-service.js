// ============================================================
// Event Creation Service
//
// Creates SSI cups/matches/squads from a template + date.
// This replaces the PowerShell script New-KupittaaCup.ps1.
//
// Flow per scheduled event:
//   1. Authenticate to SSI (web session cookies)
//   2. Apply template overrides (name, times, descriptions)
//   3. Create Cup via POST form
//   4. Create component matches via POST form
//   5. Link matches to cup
//   6. Create squads for each match
//   7. Update scheduled event with SSI references
//
// All SSI interactions use web scraping (form POSTs with CSRF
// tokens) because SSI has no public API for event creation.
// ============================================================

import { SSI_BASE_URL } from '../ssi-core/constants.js'
import { ssiLogin, parseCookies, formatCookies } from '../ssi-core/client.js'
import { createEventWithBuilder } from './event-builders/index.js'
import { log } from '../logger.js'

// ---- CSRF + Form Helpers ----

/**
 * GET a page, extract CSRF token from cookie or hidden form field.
 * Returns { cookies (merged), csrfToken, html }.
 */
async function fetchCsrf(url, cookies) {
  // Follow redirects manually to capture set-cookie headers at each step.
  // Node.js fetch with redirect:'follow' doesn't expose intermediate
  // set-cookie headers, so we'd lose the csrftoken cookie that SSI
  // sets during redirect chains.
  let merged = { ...cookies }
  let currentUrl = url
  const maxRedirects = 10

  for (let i = 0; i < maxRedirects; i++) {
    const resp = await fetch(currentUrl, {
      headers: { 'Cookie': formatCookies(merged) },
      redirect: 'manual',
    })

    // Capture cookies from this response
    const setCookies = resp.headers.getSetCookie?.() || []
    const newCookies = parseCookies(setCookies)
    merged = { ...merged, ...newCookies }

    // Follow redirects
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location')
      if (location) {
        currentUrl = location.startsWith('http') ? location : `${SSI_BASE_URL}${location}`
        continue
      }
    }

    if (resp.status !== 200) {
      throw new Error(`SSI page HTTP ${resp.status} for ${currentUrl}`)
    }

    const html = await resp.text()

    // CSRF token from cookie or hidden field
    const csrfFromCookie = merged.csrftoken || null
    const csrfFromHidden = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1]
      || html.match(/csrfmiddlewaretoken['"]\s*value=['"]([\w]+)['"]/ )?.[1]
      || null
    const csrfToken = csrfFromCookie || csrfFromHidden
    log.debug(`[event-creation] CSRF extraction: cookie=${csrfFromCookie ? 'yes' : 'no'}, hidden=${csrfFromHidden ? csrfFromHidden.substring(0, 10) + '...' : 'no'}, html has csrfmiddlewaretoken: ${html.includes('csrfmiddlewaretoken')}`)

    return { cookies: merged, csrfToken, html }
  }

  throw new Error(`Too many redirects fetching ${url}`)
}

/**
 * POST a URL-encoded form to SSI. Returns the final redirect URL.
 * @param {string} url - POST target
 * @param {object} body - key-value pairs (scalars)
 * @param {object} arrayFields - key → array of values (for multi-select fields)
 * @param {string} csrfToken - CSRF token
 * @param {object} cookies - session cookies
 * @returns {{ finalUrl: string, html: string, cookies: object }}
 */
async function postForm(url, body, arrayFields, csrfToken, cookies) {
  // Build URL-encoded body from body object (caller includes csrfmiddlewaretoken if needed)
  const pairs = []
  for (const [key, val] of Object.entries(body)) {
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(val ?? '')}`)
  }
  for (const [key, values] of Object.entries(arrayFields || {})) {
    for (const v of values) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
    }
  }
  const encodedBody = pairs.join('&')

  // Build headers — only include X-CSRFToken if we have one
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': formatCookies(cookies),
    'Referer': url,
    'Origin': SSI_BASE_URL,
  }
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken
  }

  // Do NOT follow redirects — we need the Location header to detect success
  // (SSI redirects to /event/{type}/{id}/ on success, back to form on failure)
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: encodedBody,
    redirect: 'manual',
  })

  const setCookies = resp.headers.getSetCookie?.() || []
  const newCookies = parseCookies(setCookies)
  const merged = { ...cookies, ...newCookies }

  // Check for redirect (302/303) — success means redirect to event page
  const location = resp.headers.get('location') || ''
  if (resp.status >= 300 && resp.status < 400 && location) {
    const finalUrl = location.startsWith('http') ? location : `${SSI_BASE_URL}${location}`
    log.info(`[event-creation] Form POST ${resp.status} → ${finalUrl}`)
    return { finalUrl, html: '', cookies: merged, status: resp.status }
  }

  // No redirect — form validation failed, read the HTML for errors
  const html = await resp.text()
  log.info(`[event-creation] Form POST ${resp.status}, no redirect (${html.length} chars HTML)`)
  return { finalUrl: url, html, cookies: merged, status: resp.status }
}

/**
 * Extract event type ID and event ID from an SSI event URL.
 * E.g., /event/136/160/ → { typeId: '136', eventId: '160' }
 */
function extractEventIds(url) {
  const m = url.match(/\/event\/(\d+)\/(\d+)/)
  if (!m) return null
  return { typeId: m[1], eventId: m[2] }
}

/**
 * Extract validation errors from SSI's Django form HTML response.
 * When a form POST fails validation, SSI returns the form page with
 * <ul class="errorlist"><li>Error message</li></ul> elements.
 */
function extractFormErrors(html) {
  if (!html) return []
  const errors = []

  // Django errorlist: <ul class="errorlist"><li>message</li></ul>
  const errorListRe = /<ul[^>]*class="[^"]*errorlist[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi
  let match
  while ((match = errorListRe.exec(html)) !== null) {
    const liRe = /<li>([\s\S]*?)<\/li>/gi
    let li
    while ((li = liRe.exec(match[1])) !== null) {
      const text = li[1].replace(/<[^>]+>/g, '').trim()
      if (text) errors.push(text)
    }
  }

  // SSI/SRA error pattern: <ul class="list-unstyled text-danger"><li>message</li></ul>
  // These appear after a <label> identifying the field
  const sraErrorRe = /<ul[^>]*class="[^"]*text-danger[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi
  while ((match = sraErrorRe.exec(html)) !== null) {
    // Try to find the preceding label for context
    const before = html.substring(Math.max(0, match.index - 300), match.index)
    const labelMatch = before.match(/<label[^>]*>([^<]+)<\/label>/gi)
    const fieldName = labelMatch ? labelMatch[labelMatch.length - 1].replace(/<[^>]+>/g, '').trim() : ''
    const liRe = /<li>([\s\S]*?)<\/li>/gi
    let li
    while ((li = liRe.exec(match[1])) !== null) {
      const text = li[1].replace(/<[^>]+>/g, '').trim()
      if (text && !errors.includes(text)) {
        errors.push(fieldName ? `${fieldName}: ${text}` : text)
      }
    }
  }

  // Django alert/message boxes
  const alertRe = /<div[^>]*class="[^"]*(?:alert|error|message)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  while ((match = alertRe.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim()
    if (text && text.length < 200 && !errors.includes(text)) errors.push(text)
  }

  // Check for login page (session expired)
  if (html.includes('id="id_password"') || html.includes('name="password"') && html.includes('Log in')) {
    errors.push('SSI session expired — redirected to login page')
  }

  return errors
}

/**
 * Extract the <title> from an HTML page for diagnostics.
 */
function extractPageTitle(html) {
  if (!html) return 'empty response'
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim() : 'no title'
}

// ---- Date/Time Helpers ----
// All date arithmetic uses pure string manipulation on YYYY-MM-DD
// to avoid timezone pitfalls. The server runs in UTC but events
// are in Europe/Helsinki. SSI expects dates as YYYY-MM-DD and
// times as HH:mm.

/**
 * Normalize an event date to YYYY-MM-DD string.
 * PostgreSQL DATE columns return JS Date objects, not strings.
 * Also accepts YYYY-MM-DD strings, ISO timestamps, or Date objects.
 */
function normalizeDate(dateInput) {
  if (!dateInput) throw new Error('Event date is required')
  if (typeof dateInput === 'string') {
    // Already a YYYY-MM-DD string
    const match = dateInput.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  if (dateInput instanceof Date) {
    // PostgreSQL DATE → extract YYYY-MM-DD in UTC
    const y = dateInput.getUTCFullYear()
    const m = String(dateInput.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dateInput.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  throw new Error(`Invalid event date: ${dateInput}`)
}

/**
 * Format a YYYY-MM-DD date for display in Finnish format (dd.MM.yyyy).
 * Uses pure string manipulation — no Date object needed.
 */
function formatDisplayDate(isoDate) {
  const [y, m, d] = normalizeDate(isoDate).split('-')
  return `${d}.${m}.${y}`
}

/**
 * Convert Finnish time format (hh.mm) to SSI API format (HH:mm).
 */
function toSsiTime(finnishTime) {
  if (!finnishTime) return ''
  return finnishTime.replace('.', ':')
}

/**
 * Subtract days from a YYYY-MM-DD date string.
 * Returns YYYY-MM-DD. Uses UTC to avoid DST issues.
 */
function subtractDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z') // noon UTC to avoid DST edge
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().split('T')[0]
}

/**
 * Calculate registration dates and times from template overrides and event date.
 * All date arithmetic is timezone-safe (UTC-based string manipulation).
 * SSI expects: dates as YYYY-MM-DD, times as HH:mm.
 */
function calculateSchedule(eventDate, overrides) {
  const isoDate = normalizeDate(eventDate)
  const startTime = toSsiTime(overrides.startTime || '09.00')
  const endTime = toSsiTime(overrides.endTime || '12.00')
  const regDaysBefore = overrides.registrationDaysBeforeEvent || 7
  const regStartTime = toSsiTime(overrides.registrationStartTime || '00.00')

  const regStartDate = subtractDays(isoDate, regDaysBefore)

  // Registration closes 12 hours before start
  const [startH, startM] = startTime.split(':').map(Number)
  let regCloseH = startH - 12
  let regCloseDate = isoDate
  if (regCloseH < 0) {
    // Wraps to previous day
    regCloseH += 24
    regCloseDate = subtractDays(isoDate, 1)
  }
  const regCloseTime = `${String(regCloseH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`

  return {
    isoDate,
    displayDate: formatDisplayDate(isoDate),
    startTime, endTime,
    regStartDate, regStartTime,
    regCloseDate, regCloseTime,
  }
}

// Exported for unit testing
export { extractEventIds, formatDisplayDate, toSsiTime, calculateSchedule, normalizeDate, subtractDays }

// ---- Generic HTML Form Parser ----

/**
 * Parse all form fields from an SSI HTML page.
 * Extracts inputs, selects (with selected option), textareas, and checkboxes.
 * Returns { fields: { key: value }, arrayFields: { key: [values] } }.
 * This allows discipline-agnostic form submission — SSI page provides the
 * correct defaults for discipline-specific fields (weapon_groups, layouts, etc.)
 */
function parseFormFields(html) {
  const fields = {}
  const arrayFields = {}

  // Extract hidden and text inputs: <input type="..." name="..." value="...">
  // SRA forms use multiple hidden inputs with the same name for array fields
  // (e.g., handgun_divs_0, handgun_divs_1 all with name="handgun_divs")
  const inputRe = /<input[^>]*\sname="([^"]+)"[^>]*>/gi
  let m
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0]
    const name = m[1]
    const type = tag.match(/type="([^"]+)"/i)?.[1]?.toLowerCase() || 'text'
    const value = tag.match(/value="([^"]*)"/i)?.[1] || ''

    if (type === 'checkbox' || type === 'radio') {
      // Checkbox/Radio: only include if checked
      // Radio: keep only the checked value (don't promote to array)
      if (/\bchecked\b/i.test(tag)) {
        if (type === 'radio') {
          // Radio: always overwrite — only one can be checked
          fields[name] = value
        } else if (arrayFields[name]) {
          arrayFields[name].push(value || 'on')
        } else if (name in fields) {
          // Promote scalar to array (multiple checked checkboxes)
          arrayFields[name] = [fields[name], value || 'on']
          delete fields[name]
        } else {
          fields[name] = value || 'on'
        }
      }
    } else if (type !== 'submit' && type !== 'button' && type !== 'file') {
      // Detect duplicate names → promote to array (SRA hidden input arrays)
      if (arrayFields[name]) {
        arrayFields[name].push(value)
      } else if (name in fields) {
        // Same name seen twice → promote to array
        arrayFields[name] = [fields[name], value]
        delete fields[name]
      } else {
        fields[name] = value
      }
    }
  }

  // Extract select fields: <select name="..."><option value="..." selected>...</option></select>
  const selectRe = /<select[^>]*\sname="([^"]+)"[^>]*(?:\smultiple)?[^>]*>([\s\S]*?)<\/select>/gi
  while ((m = selectRe.exec(html)) !== null) {
    const name = m[1]
    const isMultiple = /\bmultiple\b/i.test(m[0])
    const optionsHtml = m[2]

    // Find selected options
    const selectedValues = []
    const optRe = /<option[^>]*value="([^"]*)"[^>]*selected[^>]*>/gi
    let opt
    while ((opt = optRe.exec(optionsHtml)) !== null) {
      selectedValues.push(opt[1])
    }

    if (isMultiple) {
      arrayFields[name] = selectedValues
    } else {
      fields[name] = selectedValues[0] || ''
    }
  }

  // Extract textareas: <textarea name="...">content</textarea>
  const textareaRe = /<textarea[^>]*\sname="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/gi
  while ((m = textareaRe.exec(html)) !== null) {
    fields[m[1]] = m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
  }

  return { fields, arrayFields }
}

// Exported for testing
export { parseFormFields }

// ---- Main Service ----

/**
 * Deletes an event from SSI via web scraping.
 * @param {object} ssiReferences - The references to the SSI event (cupId, cupTypeId)
 * @param {object} credentials - SSI login credentials
 * @returns {Promise<void>}
 */
export async function deleteSsiEvent({ ssiReferences, credentials }) {
  if (!ssiReferences || (!ssiReferences.cupId && !ssiReferences.id)) {
    throw new Error('No SSI reference ID provided for deletion')
  }

  // Handle both single matches and cups. Prefer cup if both exist.
  const eventId = ssiReferences.cupId || ssiReferences.id
  const typeId = ssiReferences.cupTypeId || ssiReferences.typeId

  if (!eventId || !typeId) {
    throw new Error(`Missing SSI eventId or typeId in references: ${JSON.stringify(ssiReferences)}`)
  }

  log.info(`[event-deletion] Logging in to SSI to delete event ${eventId}...`)
  const cookies = await ssiLogin(credentials.email, credentials.password)

  const deleteUrl = `${SSI_BASE_URL}/event/${typeId}/${eventId}/delete/`
  log.info(`[event-deletion] Fetching delete confirmation page: ${deleteUrl}`)

  // Get the delete form to verify it exists
  const resp = await fetch(deleteUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
  })
  
  if (resp.status === 404) {
    log.info(`[event-deletion] Event ${eventId} not found on SSI (already deleted)`)
    return
  }

  if (!resp.ok) {
    throw new Error(`Failed to access delete page for event ${eventId}: HTTP ${resp.status}`)
  }

  const html = await resp.text()

  // Extract event name from the confirmation page to be safe
  const nameMatch = html.match(/Are you sure you want to delete:\s*(.+?)\s*</)
  const eventName = nameMatch ? nameMatch[1].trim() : 'Unknown Event'
  
  log.info(`[event-deletion] Confirming deletion of: "${eventName}"`)

  // POST to confirm deletion
  // The SSI form just needs remove=Delete
  const postResp = await fetch(deleteUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': deleteUrl,
      'Origin': SSI_BASE_URL,
    },
    body: 'remove=Delete',
    redirect: 'manual',
  })

  // We expect a redirect after successful deletion
  if (postResp.status >= 300 && postResp.status < 400) {
    log.info(`[event-deletion] Successfully deleted event ${eventId} ("${eventName}")`)
    return
  }

  // If no redirect, check if it failed or if we're still on the delete page
  const resultHtml = await postResp.text()
  if (resultHtml.includes('Are you sure you want to delete')) {
     log.warn(`[event-deletion] Deletion may have failed for event ${eventId}, still on confirmation page.`)
     throw new Error(`Failed to delete event ${eventId} on SSI (no redirect received)`)
  }
  
  log.info(`[event-deletion] Successfully deleted event ${eventId} ("${eventName}") (Status ${postResp.status})`)
}

/**
 * Create an SSI event from a template for a specific date.
 * Supports both cups (with component matches) and standalone matches.
 *
 * For cups (isCup=true): Creates cup → component matches → links → squads.
 * For standalone matches (isCup=false): Creates single match → squads.
 *
 * The creation URL is determined by:
 *   1. discipline.ssiCreateUrl (per-discipline config)
 *   2. Fallback: hardcoded RESUL cup URL (legacy)
 *
 * Form fields are extracted from the SSI creation page HTML using
 * parseFormFields(), so discipline-specific fields (layouts, weapon_groups,
 * scoring_format, etc.) keep their SSI defaults. Only common fields
 * (name, dates, times, venue, registration) are overridden.
 *
 * @param {object} params
 * @param {object} params.template - match_templates row (with ssiSeedSnapshot + overrides)
 * @param {string} params.eventDate - YYYY-MM-DD
 * @param {object} params.credentials - { email, password }
 * @param {object} params.discipline - optional: { ssiGroupId, ssiOrganizerId, ssiCreateUrl }
 * @param {function} params.onProgress - optional callback: (step, detail) => void
 * @returns {object} ssiReferences - { cupId, cupUrl, cupTypeId, matches: [...] }
 */
export async function createSsiEvent({ template, eventDate, credentials, discipline, onProgress }) {
  const snapshot = template.ssiSeedSnapshot
  if (!snapshot) throw new Error('Template has no imported seed snapshot')

  const overrides = template.overrides || {}
  const schedule = calculateSchedule(eventDate, overrides)
  const progress = onProgress || (() => {})
  const isCup = snapshot.isCup !== false // default to cup for backward compatibility

  // Determine creation URL
  const createUrl = discipline?.ssiCreateUrl
    ? (discipline.ssiCreateUrl.startsWith('http') ? discipline.ssiCreateUrl : `${SSI_BASE_URL}${discipline.ssiCreateUrl}`)
    : `${SSI_BASE_URL}/series/nordic/create-resul-cup/` // legacy fallback
  
  log.info(`[event-creation] Mode: ${isCup ? 'cup' : 'standalone match'}, createUrl: ${createUrl}`)

  // Step 1: Initialize Progress
  progress('init', 'Preparing to create event...')

  // Step 2: Build event name from template
  const nameTemplate = overrides.nameTemplate || snapshot.name
  const eventName = nameTemplate
    .replace(/\{date\}/gi, schedule.displayDate)
    .replace(/\{displayDate\}/gi, schedule.displayDate)
    .replace(/\{isoDate\}/gi, schedule.isoDate)

  progress('create_event', `Creating ${isCup ? 'cup' : 'match'}: ${eventName}`)
  log.info(`[event-creation] Creating ${isCup ? 'cup' : 'match'}: ${eventName} for ${schedule.isoDate}`)

  // Use the builder registry to create the event
  const builderParams = {
    snapshot,
    overrides,
    schedule,
    credentials,
    discipline,
    progress,
    eventName,
    createUrl,
    isCup,
    // Provide dependencies needed by legacy builders
    fetchCsrf,
    parseFormFields,
    postForm,
    extractEventIds,
    extractFormErrors,
    extractPageTitle
  }

  const { eventIds, eventUrl, cookies: createResultCookies } = await createEventWithBuilder(builderParams)
  
  progress('event_created', `${isCup ? 'Cup' : 'Match'} created: ${eventUrl}`)

  // Step 5: Create component matches (cups only)
  const createdMatches = []
  if (isCup && snapshot.matches && snapshot.matches.length > 0) {
    for (const seedMatch of snapshot.matches) {
      const matchName = eventName.replace(snapshot.name, seedMatch.name)
        .replace(/\{date\}/gi, schedule.displayDate)

      progress('create_match', `Creating match: ${matchName}`)
      log.info(`[event-creation] Creating match: ${matchName}`)

      // Determine the match creation URL from the seed's content type
      // Default: Nordic 25m Kuvio Pistol
      const matchCreateUrl = `${SSI_BASE_URL}/nordic/create-resul-25-kuvio-pistol/`

      const { csrfToken: matchCsrf, cookies: matchCookies, html: matchFormHtml } = await fetchCsrf(matchCreateUrl, createResultCookies)

      // Parse match form defaults and override common fields
      const { fields: matchDefaults, arrayFields: matchDefaultArrays } = parseFormFields(matchFormHtml)
      // Determine group and organizer
      const groupId = discipline?.ssiGroupId || snapshot.settings?.groupId || 'xxx'
      const organizerId = discipline?.ssiOrganizerId || snapshot.settings?.organizerId || ''

      const matchBody = {
        ...matchDefaults,
        csrfmiddlewaretoken: matchCsrf || matchDefaults.csrfmiddlewaretoken || '',
        name: matchName,
        ...(groupId && { group: groupId }),
        ...(organizerId && { organizer: organizerId }),
        status: 'on',
        has_accepted_event_data_ass_agreement: 'on',
        results: 'org',
        description: (seedMatch.description || '').trim(),
        information: (seedMatch.information || '').trim(),
        venue: overrides.venue || snapshot.venue || '',
        starts_date: schedule.isoDate,
        starts_time: schedule.startTime,
        ends_date: schedule.isoDate,
        ends_time: schedule.endTime,
        reg_start_date: schedule.regStartDate,
        reg_start_time: schedule.regStartTime,
        reg_close_date: schedule.isoDate,
        reg_close_time: schedule.endTime,
        timezone: 'Europe/Helsinki',
      }

      const matchResult = await postForm(matchCreateUrl, matchBody, matchDefaultArrays, matchCsrf, matchCookies)
      const matchIds = extractEventIds(matchResult.finalUrl)

      if (matchIds) {
        createdMatches.push({
          name: seedMatch.name,
          typeId: matchIds.typeId,
          eventId: matchIds.eventId,
          url: `${SSI_BASE_URL}/event/${matchIds.typeId}/${matchIds.eventId}/`,
        })
        log.info(`[event-creation] Match created: ${seedMatch.name} → ID ${matchIds.eventId}`)
      } else {
        log.error(`[event-creation] Match creation failed for ${seedMatch.name}: ${matchResult.finalUrl}`)
      }

      await new Promise(r => setTimeout(r, 500))
    }

    // Step 6: Link matches to cup
    if (createdMatches.length > 0) {
      progress('link_matches', `Linking ${createdMatches.length} matches to cup...`)
      const linkUrl = `${SSI_BASE_URL}/event/${eventIds.typeId}/${eventIds.eventId}/add-existing-match/`
      let matchNumber = 1

      for (const match of createdMatches) {
        const { csrfToken: linkCsrf, cookies: linkCookies } = await fetchCsrf(linkUrl, createResultCookies)

        await postForm(linkUrl, {
          number: String(matchNumber),
          match: match.eventId,
          included: 'on',
        }, {}, linkCsrf, linkCookies)

        log.info(`[event-creation] Linked ${match.name} as component #${matchNumber}`)
        matchNumber++
        await new Promise(r => setTimeout(r, 500))
      }
    }
  }

  // Step 7: Create squads
  // For cups: squads on each component match
  // For standalone matches: squads on the main event
  const squadTargets = isCup
    ? createdMatches.map(m => ({ eventId: m.eventId, typeId: m.typeId, squads: (snapshot.matches?.find(sm => sm.name === m.name))?.squads || [] }))
    : [{ eventId: eventIds.eventId, typeId: eventIds.typeId, squads: snapshot.squads || [] }]

  for (const target of squadTargets) {
    if (target.squads.length === 0) continue

    progress('create_squads', `Creating ${target.squads.length} squads...`)
    
    let squadUrl
    
    const isSRA = snapshot.rule === 'sr' || discipline?.sportCode === 'sr' || discipline?.sport === 'SRA'
    if (target.typeId === '22' || target.typeId === '23' || isSRA) {
      // IPSC/SRA matches use generic event endpoint for squads
      squadUrl = `${SSI_BASE_URL}/event/${target.typeId}/${target.eventId}/add-squads/`
    } else {
      // Nordic/RESUL matches use specific endpoint
      squadUrl = `${SSI_BASE_URL}/nordic/match/${target.eventId}/add-squads/`
    }

    for (const squad of target.squads) {
      const squadBody = {
        quantity: '1',
        max_competitors: String(squad.maxCompetitors || 9),
        registration: 'aa',
        comment: squad.name || '',
        starts_date: schedule.regStartDate,
        starts_time: schedule.regStartTime,
        issue_dates: 'False',
        length: '60',
        split: '10',
        prematch: 'False',
        submit: 'Submit',
      }

      const squadArrayFields = {
        categories: ['-'],
        weapon_groups: ['-'],
        competence_classes: ['-'],
      }

      try {
        await postForm(squadUrl, squadBody, squadArrayFields, '', createResultCookies)
        log.info(`[event-creation] Squad created: ${squad.name} (max ${squad.maxCompetitors})`)
      } catch (err) {
        log.error(`[event-creation] Squad creation failed for ${squad.name}: ${err.message}`)
      }

      await new Promise(r => setTimeout(r, 300))
    }
  }

  progress('done', 'Event creation complete')

  // Return SSI references
  const ssiReferences = {
    cupId: eventIds.eventId,
    cupTypeId: eventIds.typeId,
    cupUrl: eventUrl,
    cupName: eventName,
    isCup,
    matches: createdMatches.map(m => ({
      id: m.eventId,
      typeId: m.typeId,
      url: m.url,
      name: m.name,
    })),
  }

  log.info(`[event-creation] Complete: ${eventName} — ${isCup ? `${createdMatches.length} matches, ` : ''}event ID ${eventIds.eventId}`)

  return ssiReferences
}
