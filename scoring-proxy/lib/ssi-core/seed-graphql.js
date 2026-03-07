// ============================================================
// SSI Core — Seed GraphQL Queries & Search
//
// GraphQL constants and query builders for SSI event discovery
// and structure fetching. Extracted from seed-import.js (MOD-6).
//
// Exports used directly by seed-import.js:
//   DISCOVERY_QUERY, buildStructureQuery,
//   SERIE_TYPE_FIELDS, SQUAD_TYPE_FIELDS, EVENT_TO_SQUAD_TYPE
//   ssiSearchEvents
// ============================================================

import { ssiGraphQL, ssiGraphQLAuth } from './graphql.js'
import { SSI_BASE_URL } from './constants.js'
import { log } from '../logger.js'

// ---- SSI Event Search ----

// GraphQL query for searching events.
// SSI `events(search:)` does text search on event names.
// Additional filtering (rule/sport, date range, region) is applied client-side.
export const SEARCH_EVENTS_QUERY = `
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
    component_matches { id }
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
  const jwt = await ssiGraphQLAuth(credentials)

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
        : e.get_full_absolute_url.includes('.com/') ? `https://${e.get_full_absolute_url}`
        : `${SSI_BASE_URL}/${e.get_full_absolute_url}`)
      : null,
    contentTypeKey: e.get_content_type_key,
    componentMatchCount: (e.component_matches || []).length,
    isCup: (e.component_matches || []).length > 0,
  }))
}

// ---- Structure Query Constants ----

// Step 1: Lightweight discovery query — get __typename and structure shape.
// NOTE: component_matches returns LINK records (ComponentMatchInterface).
// We only need __typename here. The link's `match` field (→ EventInterface)
// is queried in step 2 for actual match data.
// Do NOT query `squads` on Serie types — backend crashes (SSI bug).
export const DISCOVERY_QUERY = `
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
export const SERIE_TYPE_FIELDS = {
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
export const SQUAD_TYPE_FIELDS = {
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
export const EVENT_TO_SQUAD_TYPE = {
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
export function buildStructureQuery(isCup, eventTypeName, matchTypeName, squadTypeName) {
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
