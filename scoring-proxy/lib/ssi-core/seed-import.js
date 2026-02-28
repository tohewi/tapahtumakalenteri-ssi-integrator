// ============================================================
// SSI Core — Seed Event Import
//
// Fetches the structure of an SSI event (cup + matches + squads)
// via GraphQL to create a template snapshot. This snapshot serves
// as the blueprint for creating new events.
//
// Two-step discovery approach:
//   1. Lightweight query to discover __typename of event and
//      component_matches (discipline-agnostic)
//   2. Type-specific query using correct inline fragments for the
//      discovered node types
//
// SSI Schema Key Facts (from introspection 2026-02-27):
//   - EventInterface has: name, starts, ends, status, rule, description,
//     information, venue, url, url_display, max_competitors, region,
//     visibility, registration, results, currency, squads, component_matches
//   - ComponentMatchInterface is a LINK record — only has: id, number,
//     included, match (→ EventInterface), serie (→ EventInterface).
//     Actual match data is accessed via the `match` field.
//   - SquadInterface has: id, number, max_competitors, comment, registration
//     NO `name` field — use `comment` or `get_squad_display`
//   - NordicSquadNode adds: starts, stops, competitors, weapon_groups, etc.
//   - NO `timezone` field exists anywhere in the schema
//   - Serie types declare `squads` in schema but backend CRASHES when
//     queried (SSI bug). Do NOT query squads on Serie/Cup types.
//
// Serie types: NordicSerieNode, PrecisionSerieNode, IpscSerieNode, PpcSerieNode
// Squad types: NordicSquadNode, PrecisionSquadNode, CmpSquadNode, GenericSquadNode,
//              IpscSquadNode, PpcSquadNode, IdpaSquadNode, SteelSquadNode, SassSquadNode
//
// Usage:
//   const snapshot = await ssiFetchEventStructure({
//     ssiEventUrl: 'https://shootnscoreit.com/event/136/160/',
//     credentials: { email, password, apiKey }
//   })
// ============================================================

import { ssiGraphQL } from './graphql.js'
import { SSI_BASE_URL } from './constants.js'
import { log } from '../logger.js'

// ---- SSI Event Search ----

// GraphQL query for searching events.
// SSI `events(search:)` does text search on event names.
// Additional filtering (rule/sport, date range, region) is applied client-side.
const SEARCH_EVENTS_QUERY = `
query SearchEvents($search: String!) {
  events(search: $search) {
    id
    name
    starts
    ends
    status
    rule
    region
    visibility
    get_full_absolute_url
    get_content_type_key
  }
}
`

/**
 * Search SSI events via GraphQL with client-side filtering.
 *
 * SSI GraphQL only supports text-based search (name). Filters for
 * sport/rule, date range, and region are applied after fetching results.
 *
 * @param {object} params
 * @param {object} params.credentials - { email, password, apiKey }
 * @param {string} params.search - Text search term (name)
 * @param {string} [params.sport] - Filter by rule code (e.g. 'rl' for RESUL, 'ip' for IPSC/SRA)
 * @param {string} [params.startsAfter] - ISO date string, exclude events starting before this
 * @param {string} [params.startsBefore] - ISO date string, exclude events starting after this
 * @param {string} [params.region] - Filter by region code (e.g. 'FIN', 'SWE')
 * @returns {Array<object>} Filtered list of SSI events
 */
export async function ssiSearchEvents({ credentials, search, sport, startsAfter, startsBefore, region }) {
  if (!search || search.trim().length < 2) {
    throw new Error('Search term must be at least 2 characters')
  }

  // Authenticate with SSI
  const jwt = await authenticateSSI(credentials)

  log.info(`[ssi-search] Searching SSI events: "${search}" sport=${sport || 'any'} region=${region || 'any'}`)

  const data = await ssiGraphQL(jwt, SEARCH_EVENTS_QUERY, { search: search.trim() })
  let events = data.events || []

  log.info(`[ssi-search] SSI returned ${events.length} events for "${search}"`)

  // Client-side filtering
  if (sport) {
    events = events.filter(e => e.rule && e.rule.toLowerCase() === sport.toLowerCase())
  }

  if (region) {
    events = events.filter(e => e.region && e.region.toLowerCase() === region.toLowerCase())
  }

  if (startsAfter) {
    const afterDate = new Date(startsAfter)
    events = events.filter(e => e.starts && new Date(e.starts) >= afterDate)
  }

  if (startsBefore) {
    const beforeDate = new Date(startsBefore)
    events = events.filter(e => e.starts && new Date(e.starts) <= beforeDate)
  }

  log.info(`[ssi-search] After filtering: ${events.length} events`)

  // Normalize results
  return events.map(e => ({
    ssiEventId: e.id,
    name: e.name,
    starts: e.starts,
    ends: e.ends,
    status: e.status,
    rule: e.rule,
    region: e.region,
    visibility: e.visibility,
    url: e.get_full_absolute_url
      ? (e.get_full_absolute_url.startsWith('http') ? e.get_full_absolute_url
        : e.get_full_absolute_url.startsWith('/') ? `${SSI_BASE_URL}${e.get_full_absolute_url}`
        : `${SSI_BASE_URL}/${e.get_full_absolute_url}`)
      : null,
    contentTypeKey: e.get_content_type_key,
  }))
}

// SSI GraphQL auth mutation (same as auth-v7.js)
const AUTH_MUTATION = `
  mutation Auth($email: String!, $password: String!) {
    token_auth(email: $email, password: $password) {
      token { token }
      refresh_token { token }
    }
  }
`

// Step 1: Lightweight discovery query — get __typename and structure shape.
// NOTE: component_matches returns LINK records (ComponentMatchInterface).
// We only need __typename here. The link's `match` field (→ EventInterface)
// is queried in step 2 for actual match data.
// Do NOT query `squads` on Serie types — backend crashes (SSI bug).
const DISCOVERY_QUERY = `
query EventDiscovery($ct: Int!, $id: String!) {
  event(content_type: $ct, id: $id) {
    __typename
    id
    name
    component_matches {
      __typename
      id
      match { __typename id }
    }
  }
}
`

// Type-specific fields per SSI Serie node type.
// Note: NO timezone in SSI schema. These are fields on the concrete type
// that are NOT on EventInterface.
const SERIE_TYPE_FIELDS = {
  NordicSerieNode: 'scoring_mode match_registration_mode level count',
  PrecisionSerieNode: 'scoring_mode match_registration_mode count',
  IpscSerieNode: 'match_registration_mode count',
  PpcSerieNode: 'match_registration_mode count',
}

// Type-specific fields per squad node type.
// SquadInterface has: id, number, max_competitors, comment, registration
// These are ADDITIONAL fields on concrete squad types.
// Note: NO `name` on any squad type — use `comment` for display name.
// Note: `starts`/`stops` are NOT queried — SSI backend crashes with
//   "Cannot return null for non-nullable field NordicSquadNode.starts"
//   when squads have no start time set. Squad timing derived from match.
const SQUAD_TYPE_FIELDS = {
  NordicSquadNode: 'competitors { id }',
  PrecisionSquadNode: 'competitors { id }',
  IpscSquadNode: 'competitors { id }',
  PpcSquadNode: '',
  CmpSquadNode: '',
  GenericSquadNode: '',
}

// Map event __typename → expected squad __typename.
// Cups (Serie) declare squads in schema but crash when queried.
// This mapping lets us infer squad type for inline fragments.
const EVENT_TO_SQUAD_TYPE = {
  NordicSerieNode: 'NordicSquadNode',
  NordicMatchNode: 'NordicSquadNode',
  PrecisionSerieNode: 'PrecisionSquadNode',
  PrecisionMatchNode: 'PrecisionSquadNode',
  IpscSerieNode: 'IpscSquadNode',
  IpscMatchNode: 'IpscSquadNode',
  PpcSerieNode: 'PpcSquadNode',
  PpcMatchNode: 'PpcSquadNode',
}

/**
 * Build a type-specific structure query based on discovered __typename values.
 *
 * SSI schema notes:
 * - component_matches returns ComponentMatchInterface LINK records
 * - Actual match data is on link.match (→ EventInterface)
 * - Squads are on the match event, NOT on the component_match link
 * - Serie types crash when querying squads (SSI bug) — skip for cups
 * - Squad "name" is `comment` (no name field exists)
 *
 * @param {boolean} isCup - true if event has component_matches
 * @param {string} eventTypeName - __typename of the event (Serie/Match)
 * @param {string} matchTypeName - __typename of the actual match (from link.match)
 * @param {string} squadTypeName - inferred squad __typename
 * @returns {string} GraphQL query string
 */
function buildStructureQuery(isCup, eventTypeName, matchTypeName, squadTypeName) {
  const serieFields = SERIE_TYPE_FIELDS[eventTypeName] || ''
  const squadFields = SQUAD_TYPE_FIELDS[squadTypeName] || ''

  const serieFragment = serieFields
    ? `... on ${eventTypeName} { ${serieFields} }`
    : ''

  // SquadInterface fields: id, number, max_competitors, comment, registration
  // Type-specific fields via inline fragment (competitors only — starts/stops crash SSI)
  const squadFragment = (squadTypeName && squadFields)
    ? `... on ${squadTypeName} { ${squadFields} }`
    : ''

  // Common EventInterface fields for match events
  const matchEventFields = `
        id
        name
        starts
        ends
        status
        rule
        get_content_type_key
        get_content_type_model
        description
        information
        venue
        max_competitors
        region
        squads {
          id
          number
          max_competitors
          comment
          registration
          ${squadFragment}
        }`

  let matchesBlock = ''
  let eventSquadsBlock = ''

  if (isCup) {
    // Cup: component_matches are LINK records.
    // Match data accessed via `.match` (→ EventInterface)
    // Squads are on the match event, not on the cup or the link.
    matchesBlock = `
    component_matches {
      id
      number
      included
      match {
        ${matchEventFields}
      }
    }`
  } else {
    // Standalone match: squads are on the event itself
    eventSquadsBlock = `
    squads {
      id
      number
      max_competitors
      comment
      registration
      ${squadFragment}
    }`
  }

  return `
query EventStructure($ct: Int!, $id: String!) {
  event(content_type: $ct, id: $id) {
    id
    name
    starts
    ends
    status
    rule
    description
    information
    venue
    url
    url_display
    max_competitors
    region
    visibility
    registration
    results
    currency
    serie_type
    organizer { id }
    ${serieFragment}
    ${matchesBlock}
    ${eventSquadsBlock}
  }
}
`
}

/**
 * Authenticate with SSI and get a JWT token.
 * Uses tenant's stored SSI credentials.
 *
 * @param {{ email: string, password: string, apiKey?: string }} credentials
 * @returns {string} JWT token
 */
async function authenticateSSI({ email, password, apiKey }) {
  const result = await ssiGraphQL(null, AUTH_MUTATION, { email, password }, apiKey || null)

  if (!result.token_auth?.token?.token) {
    throw new Error('SSI authentication failed — check tenant SSI credentials')
  }

  return result.token_auth.token.token
}

/**
 * Parse an SSI event URL into content type and event ID.
 * Supports: https://shootnscoreit.com/event/{contentType}/{eventId}/
 *
 * @param {string} url - SSI event URL
 * @returns {{ contentType: string, eventId: string }} or throws
 */
// Exported for unit testing
export { buildStructureQuery, SERIE_TYPE_FIELDS, SQUAD_TYPE_FIELDS, EVENT_TO_SQUAD_TYPE, DISCOVERY_QUERY }

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
  const jwt = await authenticateSSI(credentials)

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

  return snapshot
}
