// ============================================================
// SSI Core — Seed Event Import
//
// Fetches the structure of an SSI event (cup + matches + squads)
// via GraphQL to create a template snapshot. This snapshot serves
// as the blueprint for creating new events.
//
// Two-step discovery approach:
//   1. Lightweight query to discover __typename of event, matches,
//      and squads (discipline-agnostic)
//   2. Type-specific query using correct inline fragments for the
//      discovered node types
//
// Known SSI node types (from schema introspection):
//   Serie:  NordicSerieNode, PrecisionSerieNode, IpscSerieNode, PpcSerieNode
//   Squad:  NordicSquadNode, PrecisionSquadNode, CmpSquadNode, GenericSquadNode
//
// Usage:
//   const snapshot = await ssiFetchEventStructure({
//     ssiEventUrl: 'https://shootnscoreit.com/event/136/160/',
//     credentials: { email, password, apiKey }
//   })
// ============================================================

import { ssiGraphQL } from './graphql.js'
import { log } from '../logger.js'

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
// NOTE: Do NOT query `squads` here. Serie (Cup) types don't have squads
// at the event level — only their component matches do. Standalone matches
// have squads directly. The structure query in step 2 handles this.
const DISCOVERY_QUERY = `
query EventDiscovery($ct: Int!, $id: String!) {
  event(content_type: $ct, id: $id) {
    __typename
    id
    name
    component_matches {
      __typename
      id
    }
  }
}
`

// Type-specific fields per SSI node type (serie/cup types)
const SERIE_TYPE_FIELDS = {
  NordicSerieNode: 'scoring_mode match_registration_mode timezone',
  PrecisionSerieNode: 'scoring_mode match_registration_mode timezone',
  IpscSerieNode: 'match_registration_mode timezone',
  PpcSerieNode: 'match_registration_mode timezone',
}

// Type-specific fields per squad node type
const SQUAD_TYPE_FIELDS = {
  NordicSquadNode: 'name starts competitors { id }',
  PrecisionSquadNode: 'name starts competitors { id }',
  CmpSquadNode: 'name starts',
  GenericSquadNode: 'name starts',
}

// Map event __typename → expected squad __typename.
// Cups (Serie) don't have squads themselves, but their matches do.
// This mapping lets us infer squad type without querying it from the cup.
const EVENT_TO_SQUAD_TYPE = {
  NordicSerieNode: 'NordicSquadNode',
  NordicResulMatchNode: 'NordicSquadNode',
  PrecisionSerieNode: 'PrecisionSquadNode',
  PrecisionMatchNode: 'PrecisionSquadNode',
  IpscSerieNode: 'GenericSquadNode',
  IpscMatchNode: 'GenericSquadNode',
  PpcSerieNode: 'GenericSquadNode',
  PpcMatchNode: 'GenericSquadNode',
}

/**
 * Build a type-specific structure query based on discovered __typename values.
 * @param {boolean} isCup - true if event has component_matches
 * @param {string} eventTypeName - __typename of the event node
 * @param {string} squadTypeName - __typename of squad nodes (first found)
 * @returns {string} GraphQL query string
 */
function buildStructureQuery(isCup, eventTypeName, matchTypeName, squadTypeName) {
  const serieFields = SERIE_TYPE_FIELDS[eventTypeName] || ''
  const squadFields = SQUAD_TYPE_FIELDS[squadTypeName] || 'name starts'

  const serieFragment = serieFields
    ? `... on ${eventTypeName} { ${serieFields} }`
    : ''

  const squadFragment = `... on ${squadTypeName || 'GenericSquadNode'} { ${squadFields} }`

  // Business rule: Cups (Serie) do NOT have squads at the event level.
  // Only their component matches have squads (accessed via match-type inline fragment).
  // Standalone matches DO have squads directly on the event.

  let matchesBlock = ''
  let eventSquadsBlock = ''

  if (isCup) {
    // Cup: squads live on matches, not the cup itself
    matchesBlock = `
    component_matches {
      id
      name
      starts
      ends
      status
      rule
      get_content_type_key
      description
      information
      ${matchTypeName ? `... on ${matchTypeName} {
        squads {
          id
          max_competitors
          ${squadFragment}
        }
      }` : ''}
    }`
  } else {
    // Standalone match: squads are on the event itself
    eventSquadsBlock = `
    squads {
      id
      max_competitors
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
export { buildStructureQuery, SERIE_TYPE_FIELDS, SQUAD_TYPE_FIELDS, EVENT_TO_SQUAD_TYPE }

export function parseSsiEventUrl(url) {
  const match = url.match(/shootnscoreit\.com\/event\/(\d+)\/(\d+)/)
  if (!match) {
    throw new Error(`Invalid SSI event URL: ${url}. Expected format: https://shootnscoreit.com/event/{type}/{id}/`)
  }
  return { contentType: match[1], eventId: match[2] }
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

  const matchTypeName = (discovery.event.component_matches || [])[0]?.__typename || null

  // Infer squad type from event type (cups don't expose squads for discovery)
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

    // Settings
    settings: {
      maxCompetitors: event.max_competitors,
      region: event.region,
      visibility: event.visibility,
      registration: event.registration,
      results: event.results,
      scoringMode: event.scoring_mode,
      matchRegistrationMode: event.match_registration_mode || null,
      timezone: event.timezone,
      currency: event.currency,
    },

    // Squads — only present for standalone matches (cups have squads on matches)
    squads: (event.squads || []).map(sq => ({
      id: sq.id,
      name: sq.name || null,
      maxCompetitors: sq.max_competitors,
      starts: sq.starts || null,
    })),
  }

  // Component matches (cups only)
  if (isCup && event.component_matches) {
    snapshot.matches = event.component_matches.map(m => ({
      id: m.id,
      name: m.name,
      contentTypeKey: m.get_content_type_key,
      starts: m.starts,
      ends: m.ends,
      status: m.status,
      rule: m.rule,
      description: m.description || '',
      information: m.information || '',
      squads: (m.squads || []).map(sq => ({
        id: sq.id,
        name: sq.name,
        maxCompetitors: sq.max_competitors,
        starts: sq.starts,
        competitorCount: sq.competitors?.length || 0,
      })),
    }))
    snapshot.matchCount = snapshot.matches.length
  }

  log.info(`[seed-import] Imported: "${event.name}" — ${isCup ? `${snapshot.matchCount} matches` : 'single match'}, ${snapshot.squads.length} squads`)

  return snapshot
}
