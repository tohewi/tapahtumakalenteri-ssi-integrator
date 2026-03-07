// ============================================================
// Event Creation Service (MOD-5 — thin core)
//
// Creates SSI cups/matches/squads from a template + date.
// Actual helper functions live in sibling modules:
//   event-form-helpers.js  — CSRF fetch, form POST, parsing, dates
//   event-deletion-service.js — deleteSsiEvent
//
// This file re-exports from those modules for backward compatibility
// with callers that still import directly from event-creation-service.js.
// ============================================================

import { ssiLogin } from '../ssi-core/client.js'
import { createEventWithBuilder } from './event-builders/index.js'
import { log } from '../logger.js'
import {
  fetchCsrf,
  postForm,
  extractEventIds,
  extractFormErrors,
  extractPageTitle,
  parseFormFields,
  formatDisplayDate,
  toSsiTime,
  calculateSchedule,
  normalizeDate,
  subtractDays,
} from './event-form-helpers.js'
import { deleteSsiEvent } from './event-deletion-service.js'
import { SSI_BASE_URL } from '../ssi-core/constants.js'

// ---- Backward-compatibility re-exports ----
// (callers importing from event-creation-service.js continue to work)
export {
  fetchCsrf, postForm, extractEventIds, extractFormErrors, extractPageTitle, parseFormFields,
  formatDisplayDate, toSsiTime, calculateSchedule, normalizeDate, subtractDays,
  deleteSsiEvent,
}

// ---- Main Service ----

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

  const builderResult = await createEventWithBuilder(builderParams)
  const { eventIds, eventUrl, cookies: createResultCookies } = builderResult
  
  progress('event_created', `${isCup ? 'Cup' : 'Match'} created: ${eventUrl}`)

  // Step 5: Create component matches (cups only)
  // If the builder already created matches (e.g. GraphQL builders), use those.
  // Otherwise, fall back to web scraping match creation.
  let createdMatches = builderResult.createdMatches || []

  if (isCup && createdMatches.length === 0 && snapshot.matches && snapshot.matches.length > 0) {
    // Legacy web scraping path for component match creation
    for (const seedMatch of snapshot.matches) {
      // Build match name: try replacing cup name with match name.
      // If snapshot.name isn't in eventName, extract suffix from seed match name.
      let matchName = eventName.replace(snapshot.name, seedMatch.name)
      if (matchName === eventName) {
        const withoutDate = seedMatch.name.replace(/\d{2}\.\d{2}\.\d{4}/, '').trim()
        const words = withoutDate.split(/\s+/)
        const suffix = words[words.length - 1]
        matchName = `${eventName} ${suffix}`
      }
      matchName = matchName.replace(/\{date\}/gi, schedule.displayDate)

      progress('create_match', `Creating match: ${matchName}`)
      log.info(`[event-creation] Creating match via web scraping: ${matchName}`)

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
  } else if (isCup && createdMatches.length > 0) {
    log.info(`[event-creation] Builder provided ${createdMatches.length} pre-created matches — skipping web scraping match creation`)
  }

  // Step 6: Link matches to cup (always needed, regardless of how matches were created)
  if (isCup && createdMatches.length > 0) {
    progress('link_matches', `Linking ${createdMatches.length} matches to cup...`)
    const linkUrl = `${SSI_BASE_URL}/event/${eventIds.typeId}/${eventIds.eventId}/add-existing-match/`
    let matchNumber = 1

    for (const match of createdMatches) {
      const { csrfToken: linkCsrf, cookies: linkCookies, html: linkPageHtml } = await fetchCsrf(linkUrl, createResultCookies)

      // DEBUG: Log what page we landed on after fetchCsrf
      const pageTitle = linkPageHtml.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() || '(no title)'
      const hasLinkForm = linkPageHtml.includes('match') && linkPageHtml.includes('<form')
      log.info(`[event-creation] Link page: title="${pageTitle}" hasForm=${hasLinkForm} htmlLen=${linkPageHtml.length}`)

      const linkResult = await postForm(linkUrl, {
        number: String(matchNumber),
        match: match.eventId,
        match_content_type: match.typeId,
        included: 'on',
      }, {}, linkCsrf, linkCookies)

      // DEBUG: Check if the redirect target shows linked matches
      log.info(`[event-creation] Link POST result: status=${linkResult.status} → ${linkResult.finalUrl}`)
      if (linkResult.html) {
        const errors = linkResult.html.match(/(?:is-invalid|alert-danger|errorlist|text-danger)[^<]*/gi) || []
        if (errors.length) log.warn(`[event-creation] Link form errors: ${errors.slice(0, 3).join(' | ')}`)
      }

      log.info(`[event-creation] Linked ${match.name} (id=${match.eventId}, type=${match.typeId}) as component #${matchNumber}`)
      matchNumber++
      await new Promise(r => setTimeout(r, 500))
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
        registration: squad.registration || 'aa',
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
