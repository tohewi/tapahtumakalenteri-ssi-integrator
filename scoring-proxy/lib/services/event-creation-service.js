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
import { log } from '../logger.js'

// ---- CSRF + Form Helpers ----

/**
 * GET a page, extract CSRF token from cookie or hidden form field.
 * Returns { cookies (merged), csrfToken, html }.
 */
async function fetchCsrf(url, cookies) {
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`SSI page HTTP ${resp.status} for ${url}`)

  const html = await resp.text()
  const setCookies = resp.headers.getSetCookie?.() || []
  const newCookies = parseCookies(setCookies)
  const merged = { ...cookies, ...newCookies }

  // CSRF token from cookie or hidden field
  const csrfToken = merged.csrftoken
    || html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1]
    || null

  return { cookies: merged, csrfToken, html }
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
  // Build URL-encoded body
  const pairs = []
  pairs.push(`csrfmiddlewaretoken=${encodeURIComponent(csrfToken)}`)
  for (const [key, val] of Object.entries(body)) {
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(val ?? '')}`)
  }
  for (const [key, values] of Object.entries(arrayFields || {})) {
    for (const v of values) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
    }
  }
  const encodedBody = pairs.join('&')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': url,
      'Origin': SSI_BASE_URL,
      'X-CSRFToken': csrfToken,
    },
    body: encodedBody,
    redirect: 'follow',
  })

  const html = await resp.text()
  const setCookies = resp.headers.getSetCookie?.() || []
  const newCookies = parseCookies(setCookies)
  const merged = { ...cookies, ...newCookies }

  // Final URL after redirects
  const finalUrl = resp.url || url

  return { finalUrl, html, cookies: merged }
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

// ---- Date/Time Helpers ----

/**
 * Format a date string (YYYY-MM-DD) for display in Finnish format (dd.MM.yyyy).
 */
function formatDisplayDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Convert Finnish time format (hh.mm) to SSI API format (HH:mm).
 */
function toSsiTime(finnishTime) {
  if (!finnishTime) return ''
  return finnishTime.replace('.', ':')
}

/**
 * Calculate registration dates and times from template overrides and event date.
 */
function calculateSchedule(eventDate, overrides) {
  const startTime = toSsiTime(overrides.startTime || '09.00')
  const endTime = toSsiTime(overrides.endTime || '12.00')
  const regDaysBefore = overrides.registrationDaysBeforeEvent || 7
  const regStartTime = toSsiTime(overrides.registrationStartTime || '00.00')

  const eventDateObj = new Date(eventDate + 'T00:00:00')
  const regStartDateObj = new Date(eventDateObj)
  regStartDateObj.setDate(regStartDateObj.getDate() - regDaysBefore)
  const regStartDate = regStartDateObj.toISOString().split('T')[0]

  // Registration closes 12 hours before start
  const [startH, startM] = startTime.split(':').map(Number)
  const regCloseDateObj = new Date(eventDateObj)
  regCloseDateObj.setHours(startH - 12, startM, 0, 0)
  const regCloseDate = regCloseDateObj.toISOString().split('T')[0]
  const regCloseTime = `${String(regCloseDateObj.getHours()).padStart(2, '0')}:${String(regCloseDateObj.getMinutes()).padStart(2, '0')}`

  return {
    isoDate: eventDate,
    displayDate: formatDisplayDate(eventDate),
    startTime, endTime,
    regStartDate, regStartTime,
    regCloseDate, regCloseTime,
  }
}

// Exported for unit testing
export { extractEventIds, formatDisplayDate, toSsiTime, calculateSchedule }

// ---- Main Service ----

/**
 * Create an SSI event (cup + matches + squads) from a template for a specific date.
 *
 * @param {object} params
 * @param {object} params.template - match_templates row (with ssiSeedSnapshot + overrides)
 * @param {string} params.eventDate - YYYY-MM-DD
 * @param {object} params.credentials - { email, password } for SSI login
 * @param {function} params.onProgress - optional callback: (step, detail) => void
 * @returns {object} ssiReferences - { cupId, cupUrl, cupTypeId, matches: [{ id, url, typeId, name }] }
 */
export async function createSsiEvent({ template, eventDate, credentials, onProgress }) {
  const snapshot = template.ssiSeedSnapshot
  if (!snapshot) throw new Error('Template has no imported seed snapshot')

  const overrides = template.overrides || {}
  const schedule = calculateSchedule(eventDate, overrides)
  const progress = onProgress || (() => {})

  // Step 1: Authenticate
  progress('auth', 'Authenticating with SSI...')
  log.info(`[event-creation] Authenticating as ${credentials.email}`)
  const cookies = await ssiLogin(credentials.email, credentials.password)

  // Step 2: Build cup name from template
  const nameTemplate = overrides.nameTemplate || snapshot.name
  const cupName = nameTemplate
    .replace(/\{date\}/gi, schedule.displayDate)
    .replace(/\{displayDate\}/gi, schedule.displayDate)
    .replace(/\{isoDate\}/gi, schedule.isoDate)

  progress('create_cup', `Creating cup: ${cupName}`)
  log.info(`[event-creation] Creating cup: ${cupName} for ${schedule.isoDate}`)

  // Step 3: Create Cup
  const cupCreateUrl = `${SSI_BASE_URL}/series/nordic/create-resul-cup/`
  const { csrfToken: cupCsrf, cookies: cupPageCookies } = await fetchCsrf(cupCreateUrl, cookies)

  const cupBody = {
    group: snapshot.settings?.groupId || '',
    name: cupName,
    organizer: snapshot.settings?.organizerId || '',
    visibility: snapshot.settings?.visibility || 'pub',
    status: 'on',
    results: snapshot.settings?.results || 'cmp',
    registration: snapshot.settings?.registration || 'op',
    max_competitors: String(snapshot.settings?.maxCompetitors || 25),
    description: (overrides.description || snapshot.description || '').trim(),
    information: (overrides.information || snapshot.information || '').trim(),
    region: snapshot.settings?.region || 'FIN',
    scoring_mode: snapshot.settings?.scoringMode || 'pts',
    match_registration_mode: snapshot.settings?.matchRegistrationMode || 'all',
    has_accepted_event_data_ass_agreement: 'on',
    count: String(snapshot.matchCount || 3),
    starts_date: schedule.isoDate,
    starts_time: schedule.startTime,
    ends_date: schedule.isoDate,
    ends_time: schedule.endTime,
    reg_start_date: schedule.regStartDate,
    reg_start_time: schedule.regStartTime,
    reg_close_date: schedule.regCloseDate,
    reg_close_time: schedule.regCloseTime,
    timezone: snapshot.settings?.timezone || 'Europe/Helsinki',
    currency: snapshot.settings?.currency || 'EUR',
    venue: (overrides.venue || snapshot.venue || '').trim(),
    url: overrides.url || snapshot.url || '',
    url_display: overrides.urlDisplay || snapshot.urlDisplay || '',
    sq_start_date: '',
    sq_start_time: '',
    sq_close_date: '',
    sq_close_time: '',
    pm_sq_start_date: '',
    pm_sq_start_time: '',
    imported: '',
  }

  const cupArrayFields = {
    weapon_groups: ['STD'],
    categories: ['Open'],
    competence_classes: ['1', '2', '3', 'D1', 'D2', 'D3', 'J1', 'J2', 'J3', 'VY', 'VO'],
  }

  const cupResult = await postForm(cupCreateUrl, cupBody, cupArrayFields, cupCsrf, cupPageCookies)
  const cupIds = extractEventIds(cupResult.finalUrl)
  if (!cupIds) {
    throw new Error(`Cup creation failed — redirect URL did not contain event IDs: ${cupResult.finalUrl}`)
  }

  const cupUrl = `${SSI_BASE_URL}/event/${cupIds.typeId}/${cupIds.eventId}/`
  log.info(`[event-creation] Cup created: ${cupName} → ${cupUrl}`)
  progress('cup_created', `Cup created: ${cupUrl}`)

  // Step 4: Create component matches
  const createdMatches = []
  if (snapshot.matches && snapshot.matches.length > 0) {
    for (const seedMatch of snapshot.matches) {
      const matchName = cupName.replace(snapshot.name, seedMatch.name)
        .replace(/\{date\}/gi, schedule.displayDate)

      progress('create_match', `Creating match: ${matchName}`)
      log.info(`[event-creation] Creating match: ${matchName}`)

      // Determine the match creation URL from the seed's content type
      // Default: Nordic 25m Kuvio Pistol
      const matchCreateUrl = `${SSI_BASE_URL}/nordic/create-resul-25-kuvio-pistol/`

      const { csrfToken: matchCsrf, cookies: matchCookies } = await fetchCsrf(matchCreateUrl, cupResult.cookies)

      const matchBody = {
        group: cupBody.group,
        name: matchName,
        organizer: cupBody.organizer,
        visibility: cupBody.visibility,
        status: 'on',
        results: 'org',
        registration: cupBody.registration,
        max_competitors: cupBody.max_competitors,
        description: (seedMatch.description || '').trim(),
        information: (seedMatch.information || '').trim(),
        region: cupBody.region,
        level: 'tr',
        has_accepted_event_data_ass_agreement: 'on',
        layouts: '6+SO',
        precision_strings: '6',
        precision_shots_per_string: '5',
        string_scoring_format: '110X',
        number_of_team_members: '3',
        result_from_team_members: '3',
        prematch: 'no',
        max_prematch_competitors: '0',
        verify_using: 'xxx',
        starts_date: schedule.isoDate,
        starts_time: schedule.startTime,
        ends_date: schedule.isoDate,
        ends_time: schedule.endTime,
        reg_start_date: schedule.regStartDate,
        reg_start_time: schedule.regStartTime,
        reg_close_date: schedule.isoDate,
        reg_close_time: schedule.endTime,
        sq_start_date: schedule.regStartDate,
        sq_start_time: schedule.regStartTime,
        sq_close_date: schedule.isoDate,
        sq_close_time: schedule.startTime,
        pm_sq_start_date: '',
        pm_sq_start_time: '',
        timezone: cupBody.timezone,
        currency: cupBody.currency,
        venue: cupBody.venue,
        url: '',
        url_display: '',
        imported: '',
      }

      const matchArrayFields = {
        weapon_groups: ['STD'],
        categories: ['Open'],
        competence_classes: ['1', '2', '3', 'D1', 'D2', 'D3', 'J1', 'J2', 'J3', 'VY', 'VO'],
      }

      const matchResult = await postForm(matchCreateUrl, matchBody, matchArrayFields, matchCsrf, matchCookies)
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

      // Small delay between requests
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // Step 5: Link matches to cup
  if (createdMatches.length > 0) {
    progress('link_matches', `Linking ${createdMatches.length} matches to cup...`)
    const linkUrl = `${SSI_BASE_URL}/event/${cupIds.typeId}/${cupIds.eventId}/add-existing-match/`
    let matchNumber = 1

    for (const match of createdMatches) {
      const { csrfToken: linkCsrf, cookies: linkCookies } = await fetchCsrf(linkUrl, cupResult.cookies)

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

  // Step 6: Create squads for each match
  if (snapshot.matches) {
    for (const match of createdMatches) {
      const seedMatch = snapshot.matches.find(m => m.name === match.name)
      if (!seedMatch?.squads || seedMatch.squads.length === 0) continue

      progress('create_squads', `Creating squads for ${match.name}...`)
      const squadUrl = `${SSI_BASE_URL}/nordic/match/${match.eventId}/add-squads/`

      for (const squad of seedMatch.squads) {
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
          await postForm(squadUrl, squadBody, squadArrayFields, '', cupResult.cookies)
          log.info(`[event-creation] Squad created: ${squad.name} (max ${squad.maxCompetitors}) for ${match.name}`)
        } catch (err) {
          log.error(`[event-creation] Squad creation failed for ${squad.name}: ${err.message}`)
        }

        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  progress('done', 'Event creation complete')

  // Return SSI references
  const ssiReferences = {
    cupId: cupIds.eventId,
    cupTypeId: cupIds.typeId,
    cupUrl,
    cupName,
    matches: createdMatches.map(m => ({
      id: m.eventId,
      typeId: m.typeId,
      url: m.url,
      name: m.name,
    })),
  }

  log.info(`[event-creation] Complete: ${cupName} — ${createdMatches.length} matches, cup ID ${cupIds.eventId}`)

  return ssiReferences
}
