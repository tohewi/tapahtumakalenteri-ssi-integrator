// ============================================================
// Nordic Cup Builder (RESUL Cup + Component Matches)
//
// Hybrid approach:
//   Cup:     Created via web form POST (handles multi-value fields
//            like weapon_groups, categories correctly)
//   Matches: Created via web form POST (same as cup, template-driven)
//   Linking: Web scraping (no GraphQL mutation exists)
//   Squads:  Web scraping (no GraphQL mutation exists)
//
// Cup:    rule='rl', serie_type='cp'
// Match:  rule='rl'
// ============================================================

import { ssiLogin } from '../../ssi-core/client.js'
import { SSI_BASE_URL } from '../../ssi-core/constants.js'
import { parseFormFields, fetchCsrf, postForm, extractEventIds, extractFormErrors, extractPageTitle } from '../event-creation-service.js'
import { log } from '../../logger.js'

/**
 * Fetch SSI form page for CSRF token and scalar field defaults.
 * Does NOT manipulate multi-value fields — those come from the template snapshot.
 */
async function fetchFormPage(createUrl, cookies) {
  const { html, csrfToken, cookies: pageCookies } = await fetchCsrf(createUrl, cookies)
  const { fields, arrayFields } = parseFormFields(html)
  return { fields, arrayFields, csrfToken, cookies: pageCookies }
}

/**
 * Apply template form field values to the form data.
 * Sources (in priority order):
 *   1. overrides.formFields — manual configuration (simple arrays)
 *   2. snapshot.formFields — captured from SSI during seed import
 *
 * Accepts two formats per field:
 *   - Snapshot format: { selected: [...], values: [...] }
 *   - Simple array: [...]
 *
 * @param {object} body - Scalar form fields (will have multi-value keys removed)
 * @param {object} arrayFields - Array form fields (will be updated)
 * @param {object} snapshotFormFields - From snapshot.formFields (may be null)
 * @param {object} overrideFormFields - From overrides.formFields (may be null, takes priority)
 */
export function applyTemplateFormFields(body, arrayFields, snapshotFormFields, overrideFormFields) {
  // Merge: overrides take priority over snapshot
  const merged = {}
  if (snapshotFormFields) {
    for (const [field, data] of Object.entries(snapshotFormFields)) {
      merged[field] = Array.isArray(data) ? data : data.selected
    }
  }
  if (overrideFormFields) {
    for (const [field, data] of Object.entries(overrideFormFields)) {
      merged[field] = Array.isArray(data) ? data : data.selected
    }
  }

  for (const [field, values] of Object.entries(merged)) {
    if (!values || values.length === 0) continue
    if (field in body) delete body[field]
    arrayFields[field] = values
    log.info(`[event-creation] Template → ${field}: [${values.join(',')}]`)
  }
}

/**
 * Build a RESUL cup + component matches.
 *
 * Hybrid approach:
 *   - Cup: web form POST (SSI GraphQL ignores multi-value fields like
 *     weapon_groups/categories — they fall back to defaults)
 *   - Matches: GraphQL API (faster, multi-value fields less critical
 *     for component matches within a cup)
 *
 * Returns eventIds, eventUrl, cookies (for subsequent web scraping),
 * and createdMatches (so event-creation-service.js skips web match creation).
 */
export async function buildNordicCupWithMatches({ snapshot, overrides, schedule, credentials, discipline, progress, eventName }) {
  progress('auth', 'Authenticating with SSI...')

  const groupId = discipline?.ssiGroupId || snapshot.settings?.groupId || 'xxx'
  const organizerId = discipline?.ssiOrganizerId || snapshot.settings?.organizerId || ''

  // ---- Step 0: Web login + fetch form page ----
  // We need the SSI creation form for CSRF token and scalar defaults.
  // Multi-value fields (weapon_groups, categories, competence_classes)
  // come from the template snapshot — NOT from the creation form.
  const cupCreateUrl = discipline?.ssiCreateUrl
    ? (discipline.ssiCreateUrl.startsWith('http') ? discipline.ssiCreateUrl : `${SSI_BASE_URL}${discipline.ssiCreateUrl}`)
    : `${SSI_BASE_URL}/series/nordic/create-resul-cup/`

  log.info(`[event-creation] Fetching cup form page from: ${cupCreateUrl}`)
  const cookies = await ssiLogin(credentials.email, credentials.password)
  const { fields: cupDefaults, arrayFields: cupDefaultArrays, csrfToken: cupCsrf, cookies: cupPageCookies } = await fetchFormPage(cupCreateUrl, cookies)

  log.info(`[event-creation] Cup form page: ${Object.keys(cupDefaults).length} scalar fields, ${Object.keys(cupDefaultArrays).length} array fields`)

  // ---- Step 1: Create the Cup via web form POST ----
  // Web form POST correctly handles multi-value fields (weapon_groups,
  // categories, competence_classes) which SSI's GraphQL mutation ignores.

  // Build scalar body (form defaults + our overrides)
  const cupBody = {
    ...cupDefaults,
    csrfmiddlewaretoken: cupCsrf || cupDefaults.csrfmiddlewaretoken || '',
    name: eventName,
    group: groupId,
    organizer: organizerId,
    status: 'on',
    has_accepted_event_data_ass_agreement: 'on',
    timezone: 'Europe/Helsinki',

    // Content
    description: (overrides.description || snapshot.description || '').trim(),
    information: (overrides.information || snapshot.information || '').trim(),
    venue: (overrides.venue || snapshot.venue || '').trim(),
    url: overrides.url || snapshot.url || '',
    url_display: overrides.urlDisplay || snapshot.urlDisplay || '',

    // Dates
    starts_date: schedule.isoDate,
    starts_time: schedule.startTime,
    ends_date: schedule.isoDate,
    ends_time: schedule.endTime,
    reg_start_date: schedule.regStartDate,
    reg_start_time: schedule.regStartTime,
    reg_close_date: schedule.regCloseDate,
    reg_close_time: schedule.regCloseTime,
    sq_start_date: schedule.regStartDate,
    sq_start_time: schedule.regStartTime,
    sq_close_date: schedule.isoDate,
    sq_close_time: schedule.endTime,
    pm_reg_start_date: schedule.regStartDate,
    pm_reg_start_time: schedule.regStartTime,
    pm_reg_close_date: schedule.regCloseDate,
    pm_reg_close_time: schedule.regCloseTime,
    pm_sq_start_date: schedule.regStartDate,
    pm_sq_start_time: schedule.regStartTime,

    // Cup-specific settings from snapshot
    visibility: snapshot.settings?.visibility || 'pub',
    registration: snapshot.settings?.registration || 'op',
    results: snapshot.settings?.results || 'cmp',
    max_competitors: String(snapshot.settings?.maxCompetitors || 50),
    region: snapshot.settings?.region || 'FIN',
    currency: snapshot.settings?.currency || 'EUR',
    scoring_mode: snapshot.settings?.scoringMode || 'pts',
    match_registration_mode: snapshot.settings?.matchRegistrationMode || 'all',
    count: String(snapshot.settings?.count || 3),
  }

  // Array fields: start with form page defaults, then override with template snapshot values.
  // The snapshot is the source of truth for weapon_groups, categories, competence_classes.
  const cupArrayFields = { ...cupDefaultArrays }
  applyTemplateFormFields(cupBody, cupArrayFields, snapshot.formFields, overrides.formFields)

  progress('create_event', `Creating RESUL cup: ${eventName}`)
  log.info(`[event-creation] Creating RESUL cup via web POST: ${eventName} (${Object.keys(cupBody).length} scalar + ${Object.keys(cupArrayFields).length} array fields)`)

  const createResult = await postForm(cupCreateUrl, cupBody, cupArrayFields, cupCsrf, cupPageCookies)
  const eventIds = extractEventIds(createResult.finalUrl)

  if (!eventIds) {
    const ssiErrors = extractFormErrors(createResult.html)
    const pageTitle = extractPageTitle(createResult.html)
    log.error(`[event-creation] Cup creation failed. HTTP ${createResult.status}, page: "${pageTitle}", errors: ${ssiErrors.length > 0 ? ssiErrors.join('; ') : 'none'}`)
    throw new Error(ssiErrors.length > 0 ? `SSI rejected cup creation: ${ssiErrors.join('; ')}` : `Cup creation failed (HTTP ${createResult.status}, page: "${pageTitle}")`)
  }

  const eventUrl = `${SSI_BASE_URL}/event/${eventIds.typeId}/${eventIds.eventId}/`
  log.info(`[event-creation] Cup created via web POST: ${eventName} → ${eventUrl}`)
  progress('event_created', `Cup created: ${eventUrl}`)

  // Use cookies from the cup creation response for subsequent requests
  const activeCookies = createResult.cookies

  // ---- Step 2: Create Component Matches ----
  const createdMatches = []

  if (snapshot.matches && snapshot.matches.length > 0) {
    // Fetch match form page for CSRF token, scalar defaults, and cookies.
    // Multi-value fields come from snapshot.matchFormFields.
    const matchCreateUrl = `${SSI_BASE_URL}/nordic/create-resul-25-kuvio-pistol/`
    const { fields: matchDefaults, arrayFields: matchDefaultArrays, csrfToken: matchCsrf, cookies: matchPageCookies } = await fetchFormPage(matchCreateUrl, cookies)
    log.info(`[event-creation] Match form page: ${Object.keys(matchDefaults).length} scalar, ${Object.keys(matchDefaultArrays).length} array fields`)

    // Build match base name: strip "CUP" from the cup name since matches
    // don't belong to a "CUP" series. SSI has a 40-char name limit.
    const matchBaseName = eventName.replace(/\s*CUP\s*/i, ' ').replace(/\s{2,}/g, ' ').trim()

    for (const seedMatch of snapshot.matches) {
      // Build match name: try replacing cup name with match name in matchBaseName.
      // If snapshot.name isn't a substring, extract the distinguishing suffix
      // from the seed match name instead.
      let matchName = matchBaseName.replace(snapshot.name, seedMatch.name)
      if (matchName === matchBaseName) {
        // Replacement failed — extract suffix from seed match name
        // e.g., "TEST Kupittaa 08.02.2026 Tarkkuus" → suffix "Tarkkuus"
        const withoutDate = seedMatch.name.replace(/\d{2}\.\d{2}\.\d{4}/, '').trim()
        const words = withoutDate.split(/\s+/)
        const suffix = words[words.length - 1]
        matchName = `${matchBaseName} ${suffix}`
      }
      matchName = matchName.replace(/\{date\}/gi, schedule.displayDate)

      // SSI enforces a 40-character limit on event names
      if (matchName.length > 40) {
        log.warn(`[event-creation] Match name too long (${matchName.length} chars), truncating: "${matchName}"`)
        matchName = matchName.substring(0, 40).trim()
      }

      progress('create_match', `Creating match: ${matchName}`)
      log.info(`[event-creation] Creating Nordic match via web POST: ${matchName}`)

      // Build match body from form defaults + template overrides
      const matchBody = {
        ...matchDefaults,
        csrfmiddlewaretoken: matchCsrf || matchDefaults.csrfmiddlewaretoken || '',
        name: matchName,
        group: groupId,
        organizer: organizerId,
        status: 'on',
        has_accepted_event_data_ass_agreement: 'on',
        timezone: 'Europe/Helsinki',
        description: (seedMatch.description || '').trim(),
        information: (seedMatch.information || '').trim(),
        venue: (overrides.venue || snapshot.venue || '').trim(),
        url: overrides.url || snapshot.url || '',
        url_display: overrides.urlDisplay || snapshot.urlDisplay || '',

        // Dates
        starts_date: schedule.isoDate,
        starts_time: schedule.startTime,
        ends_date: schedule.isoDate,
        ends_time: schedule.endTime,
        reg_start_date: schedule.regStartDate,
        reg_start_time: schedule.regStartTime,
        reg_close_date: schedule.isoDate,
        reg_close_time: schedule.endTime,

        // Match-level settings
        visibility: snapshot.settings?.visibility || 'pub',
        results: 'org',
        registration: snapshot.settings?.registration || 'op',
        max_competitors: String(seedMatch.maxCompetitors || snapshot.settings?.maxCompetitors || 50),
        region: snapshot.settings?.region || 'FIN',
        currency: snapshot.settings?.currency || 'EUR',
      }

      // Array fields: form defaults + template snapshot override
      const matchArrays = { ...matchDefaultArrays }
      applyTemplateFormFields(matchBody, matchArrays, snapshot.matchFormFields, overrides.matchFormFields)

      try {
        const matchResult = await postForm(matchCreateUrl, matchBody, matchArrays, matchCsrf, matchPageCookies)
        const matchIds = extractEventIds(matchResult.finalUrl)

        if (!matchIds) {
          const errs = extractFormErrors(matchResult.html)
          throw new Error(errs.length > 0 ? errs.join('; ') : `redirect to ${matchResult.finalUrl}`)
        }

        createdMatches.push({
          name: matchName,
          seedName: seedMatch.name,
          typeId: matchIds.typeId,
          eventId: matchIds.eventId,
          url: `${SSI_BASE_URL}/event/${matchIds.typeId}/${matchIds.eventId}/`,
        })

        log.info(`[event-creation] Match created via web POST: "${matchName}" → ID ${matchIds.eventId}`)
      } catch (err) {
        log.error(`[event-creation] Match creation failed for ${seedMatch.name}: ${err.message}`)
        throw new Error(`Component match creation failed for "${seedMatch.name}": ${err.message}`)
      }

      // Brief pause between creations
      await new Promise(r => setTimeout(r, 300))
    }
  }

  // ---- Step 3: Return cookies for linking + squads ----
  // Use activeCookies from cup creation (most recent session state)
  return { eventIds, eventUrl, cookies: activeCookies, createdMatches }
}
