// ============================================================
// Legacy Web Scraping Builder
//
// Creates cups and matches using HTML form POSTs.
// This is the fallback builder for disciplines not yet migrated
// to the GraphQL API.
// ============================================================

import { SSI_BASE_URL } from '../../ssi-core/constants.js'
import { ssiLogin } from '../../ssi-core/client.js'
import { log } from '../../logger.js'

export async function buildLegacyWebScrapingEvent({ snapshot, overrides, schedule, credentials, discipline, progress, eventName, createUrl, fetchCsrf, parseFormFields, postForm, extractEventIds, extractFormErrors, extractPageTitle }) {
  progress('auth', 'Authenticating with SSI Web...')
  log.info(`[event-creation] Authenticating as ${credentials.email} for Web Form creation`)
  const cookies = await ssiLogin(credentials.email, credentials.password)

  // Determine group and organizer
  const groupId = discipline?.ssiGroupId || snapshot.settings?.groupId || 'xxx'
  const organizerId = discipline?.ssiOrganizerId || snapshot.settings?.organizerId || ''

  // Step 3: Fetch creation page and extract form defaults
  const { csrfToken, cookies: pageCookies, html: formHtml } = await fetchCsrf(createUrl, cookies)

  // Parse ALL form fields from the SSI page — discipline-specific defaults preserved
  const { fields: formDefaults, arrayFields: formDefaultArrays } = parseFormFields(formHtml)

  // Discover the actual agreement checkbox name from the HTML.
  const agreementMatch = formHtml.match(/<input[^>]*type="checkbox"[^>]*name="([^"]*(?:agree|accept)[^"]*)"/i)
    || formHtml.match(/<input[^>]*name="([^"]*(?:agree|accept)[^"]*)"[^>]*type="checkbox"/i)
  const agreementFieldName = agreementMatch ? agreementMatch[1] : 'has_accepted_event_data_ass_agreement'

  // Build the form body — SSI defaults + our overrides for common fields
  const body = {
    ...formDefaults,
    csrfmiddlewaretoken: csrfToken || formDefaults.csrfmiddlewaretoken || '',
    name: eventName,
    // Group and organizer
    group: groupId,
    organizer: organizerId,
    // Status and agreement (agreement field name discovered from form HTML)
    status: 'on',
    [agreementFieldName]: 'on',
    // Dates and times
    starts_date: schedule.isoDate,
    starts_time: schedule.startTime,
    ends_date: schedule.isoDate,
    ends_time: schedule.endTime,
    reg_start_date: schedule.regStartDate,
    reg_start_time: schedule.regStartTime,
    reg_close_date: schedule.regCloseDate,
    reg_close_time: schedule.regCloseTime,
    timezone: 'Europe/Helsinki',
    // Content
    description: (overrides.description || snapshot.description || '').trim(),
    information: (overrides.information || snapshot.information || '').trim(),
    venue: (overrides.venue || snapshot.venue || '').trim(),
    url: overrides.url || snapshot.url || '',
    url_display: overrides.urlDisplay || snapshot.urlDisplay || '',
    // Settings from snapshot (override only if present)
    ...(snapshot.settings?.visibility && { visibility: snapshot.settings.visibility }),
    ...(snapshot.settings?.registration && { registration: snapshot.settings.registration }),
    ...(snapshot.settings?.results && { results: snapshot.settings.results }),
    ...(snapshot.settings?.maxCompetitors && { max_competitors: String(snapshot.settings.maxCompetitors) }),
    ...(snapshot.settings?.region && { region: snapshot.settings.region }),
    ...(snapshot.settings?.currency && { currency: snapshot.settings.currency }),
    ...(snapshot.settings?.scoringMode && { scoring_mode: snapshot.settings.scoringMode }),
    ...(snapshot.settings?.matchRegistrationMode && { match_registration_mode: snapshot.settings.matchRegistrationMode }),
    ...(snapshot.settings?.count && { count: String(snapshot.settings.count) }),
  }

  // Array fields: use SSI page defaults (discipline-specific weapon_groups, categories, etc.)
  const arrayFields = { ...formDefaultArrays }

  // Step 4: Submit the creation form
  const createResult = await postForm(createUrl, body, arrayFields, csrfToken, pageCookies)
  const eventIds = extractEventIds(createResult.finalUrl)
  
  if (!eventIds) {
    const ssiErrors = extractFormErrors(createResult.html)
    const pageTitle = extractPageTitle(createResult.html)
    
    log.error(`[event-creation] Web Form Event creation failed. HTTP ${createResult.status}, page: "${pageTitle}", finalUrl: ${createResult.finalUrl}, errors: ${ssiErrors.length > 0 ? ssiErrors.join('; ') : 'none'}`)
    
    if (ssiErrors.length > 0) {
      throw new Error(`SSI rejected event creation: ${ssiErrors.join('; ')}`)
    }
    throw new Error(`Event creation failed (HTTP ${createResult.status}, page: "${pageTitle}") — redirect URL: ${createResult.finalUrl}`)
  }

  const eventUrl = `${SSI_BASE_URL}/event/${eventIds.typeId}/${eventIds.eventId}/`
  log.info(`[event-creation] Match/Cup created via Web Form: ${eventName} → ${eventUrl}`)
  
  return { eventIds, eventUrl, cookies: createResult.cookies }
}
