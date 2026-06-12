// ============================================================
// SSI Core — Seed Event Import (MOD-6 — thin core)
//
// Orchestrates two-step GraphQL discovery + form field capture
// to create a template snapshot from an existing SSI event.
//
// Domain modules:
//   seed-graphql.js      — GraphQL queries, search, buildStructureQuery
//   seed-form-capture.js — Web-scraping for weapon_groups/categories
//
// Backward-compat re-exports ensure existing callers continue to work.
// ============================================================

import { ssiGraphQL, ssiGraphQLAuth } from './graphql.js'
import { ssiLogin } from './client.js'
import { SSI_BASE_URL } from './constants.js'
import { log } from '../logger.js'
import {
  DISCOVERY_QUERY,
  buildStructureQuery,
  SERIE_TYPE_FIELDS,
  SQUAD_TYPE_FIELDS,
  EVENT_TO_SQUAD_TYPE,
  ssiSearchEvents,
} from './seed-graphql.js'
import { captureEventFormFields } from './seed-form-capture.js'

// ---- Backward-compatibility re-exports ----
export {
  DISCOVERY_QUERY,
  buildStructureQuery,
  SERIE_TYPE_FIELDS,
  SQUAD_TYPE_FIELDS,
  EVENT_TO_SQUAD_TYPE,
  ssiSearchEvents,
}

/**
 * Parse an SSI event URL into content type and event ID.
 * Supports: https://shootnscoreit.com/event/{contentType}/{eventId}/
 *
 * @param {string} url - SSI event URL
 * @returns {{ contentType: string, eventId: string }} or throws
 */
export function parseSsiEventUrl(url) {
  const match = url.match(/shootnscoreit\.com\/event\/(\d+)\/(\d+)/)
  if (!match) {
    throw new Error(`Invalid SSI event URL: ${url}. Expected format: https://shootnscoreit.com/event/{type}/{id}/`)
  }
  return { contentType: match[1], eventId: match[2] }
}

/**
 * Map a squad GraphQL node to a snapshot squad object.
 * SquadInterface has NO `name` field — use `comment` for display name.
 * Type-specific fields (starts, stops, competitors) come from inline fragments.
 */
function mapSquad(sq) {
  return {
    id: sq.id,
    number: sq.number,
    name: sq.comment || sq.get_squad_display || `Squad ${sq.number || '?'}`,
    maxCompetitors: sq.max_competitors,
    registration: sq.registration || null,
    starts: sq.starts || null,
    // starts/stops not queried — SSI crashes when squad has no start time
    competitorCount: sq.competitors?.length || 0,
  }
}

/**
 * Fetch the full structure of an SSI event (cup or match) via GraphQL.
 * Authenticates with the tenant's SSI credentials, then queries for
 * the event structure including component matches and squads.
 *
 * @param {object} params
 * @param {string} params.ssiEventUrl - Full SSI event URL
 * @param {object} params.credentials - { email, password, apiKey }
 * @returns {object} Structured snapshot of the event
 */
export async function ssiFetchEventStructure({ ssiEventUrl, credentials }) {
  const { contentType, eventId } = parseSsiEventUrl(ssiEventUrl)

  log.info(`[seed-import] Fetching event structure: CT=${contentType} ID=${eventId}`)

  // Authenticate with SSI
  const jwt = await ssiGraphQLAuth(credentials)

  const vars = { ct: parseInt(contentType, 10), id: eventId }

  // Step 1: Discovery — get __typename of event, matches, squads
  log.info(`[seed-import] Step 1: Discovering event node types...`)
  const discovery = await ssiGraphQL(jwt, DISCOVERY_QUERY, vars)

  if (!discovery.event) {
    throw new Error(`SSI event not found: CT=${contentType} ID=${eventId}`)
  }

  const eventTypeName = discovery.event.__typename
  const isCup = (discovery.event.component_matches || []).length > 0

  // component_matches are LINK records; the actual match type is on .match.__typename
  const firstLink = (discovery.event.component_matches || [])[0]
  const matchTypeName = firstLink?.match?.__typename || null

  // Infer squad type from the actual match type (or event type for standalone matches)
  const squadTypeName = EVENT_TO_SQUAD_TYPE[matchTypeName] || EVENT_TO_SQUAD_TYPE[eventTypeName] || 'GenericSquadNode'

  log.info(`[seed-import] Discovered: event=${eventTypeName}, match=${matchTypeName}, squad=${squadTypeName} (inferred), isCup=${isCup}`)

  // Step 2: Type-specific structure query
  const structureQuery = buildStructureQuery(isCup, eventTypeName, matchTypeName, squadTypeName)
  const data = await ssiGraphQL(jwt, structureQuery, vars)

  if (!data.event) {
    throw new Error(`SSI event structure query returned empty for CT=${contentType} ID=${eventId}`)
  }

  const event = data.event

  // Build structured snapshot
  const snapshot = {
    importedAt: new Date().toISOString(),
    sourceUrl: ssiEventUrl,
    contentType,
    eventId,
    isCup,
    eventTypeName,
    squadTypeName,

    // Event details
    name: event.name,
    starts: event.starts,
    ends: event.ends,
    status: event.status,
    rule: event.rule,
    description: event.description || '',
    information: event.information || '',
    venue: event.venue || '',
    url: event.url || '',
    urlDisplay: event.url_display || '',

    // Serie type (resul, etc.) — from EventInterface
    serieType: event.serie_type || null,

    // Settings
    settings: {
      organizerId: event.organizer?.id || '',
      maxCompetitors: event.max_competitors,
      region: event.region,
      visibility: event.visibility,
      registration: event.registration,
      results: event.results,
      scoringMode: event.scoring_mode || null,
      matchRegistrationMode: event.match_registration_mode || null,
      level: event.level || null,
      count: event.count || null,
      currency: event.currency,
      // Note: timezone does NOT exist in SSI GraphQL schema
    },

    // Squads — only present for standalone matches (cups have squads on matches)
    // SquadInterface has no `name` field — use `comment` for display name
    squads: (event.squads || []).map(mapSquad),
  }

  // Component matches (cups only)
  // component_matches are LINK records (ComponentMatchInterface).
  // Actual match data is accessed via link.match (→ EventInterface).
  if (isCup && event.component_matches) {
    snapshot.matches = event.component_matches
      .filter(link => link.match) // skip broken links
      .map(link => {
        const m = link.match
        return {
          // Link metadata
          linkId: link.id,
          number: link.number,
          included: link.included,
          // Match event data (from link.match → EventInterface)
          id: m.id,
          name: m.name,
          contentTypeKey: m.get_content_type_key,
          contentTypeModel: m.get_content_type_model,
          starts: m.starts,
          ends: m.ends,
          status: m.status,
          rule: m.rule,
          description: m.description || '',
          information: m.information || '',
          venue: m.venue || '',
          maxCompetitors: m.max_competitors,
          region: m.region,
          squads: (m.squads || []).map(mapSquad),
        }
      })
    snapshot.matchCount = snapshot.matches.length
  }

  log.info(`[seed-import] Imported: "${event.name}" — ${isCup ? `${snapshot.matchCount} matches` : 'single match'}, ${snapshot.squads.length} squads`)

  // Step 3: Capture form-level fields via web scraping
  // weapon_groups, categories, competence_classes are NOT in GraphQL —
  // we must web-scrape the event's admin page to get the current values.
  try {
    log.info(`[seed-import] Step 3: Capturing form fields via web scraping...`)
    const cookies = await ssiLogin(credentials.email, credentials.password)

    // Capture cup/event form fields
    const eventPageUrl = `${SSI_BASE_URL}/event/${contentType}/${eventId}/`
    const cupFormFields = await captureEventFormFields(eventPageUrl, cookies)
    if (cupFormFields) {
      snapshot.formFields = cupFormFields
    }

    // For cups: also capture form fields from the first component match
    // (matches may have different form fields than cups)
    if (isCup && snapshot.matches && snapshot.matches.length > 0) {
      const firstMatch = snapshot.matches[0]
      const matchPageUrl = `${SSI_BASE_URL}/event/${firstMatch.contentTypeKey}/${firstMatch.id}/`
      const matchFormFields = await captureEventFormFields(matchPageUrl, cookies)
      if (matchFormFields) {
        snapshot.matchFormFields = matchFormFields
      }
    }
  } catch (err) {
    // Form field capture is optional — don't fail the import
    log.warn(`[seed-import] Form field capture step failed: ${err.message}`)
  }

  return snapshot
}
