// ============================================================
// SSI Core — Seed Event Import
//
// Fetches the structure of an SSI event (cup + matches + squads)
// via GraphQL to create a template snapshot. This snapshot serves
// as the blueprint for creating new events.
//
// Supported event types:
//   CT 136 = NordicSerie (Cup with component matches)
//   CT 160 = IPSC/SRA match (future)
//
// Usage:
//   const snapshot = await ssiFetchEventStructure({
//     contentType: '136', eventId: '160',
//     email, password, apiKey
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

// GraphQL query to fetch a NordicSerie (Cup) with its component matches and squads
const CUP_STRUCTURE_QUERY = `
query CupStructure($ct: Int!, $id: String!) {
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
    ... on NordicSerieNode {
      scoring_mode
      match_registration_mode
      timezone
    }
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
      squads {
        id
        max_competitors
        ... on NordicSquadNode {
          name
          starts
          competitors {
            id
          }
        }
      }
    }
    squads {
      id
      max_competitors
      ... on NordicSquadNode {
        name
        starts
      }
    }
  }
}
`

// GraphQL query to fetch a single match (non-cup event)
const MATCH_STRUCTURE_QUERY = `
query MatchStructure($ct: Int!, $id: String!) {
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
    ... on NordicSerieNode {
      scoring_mode
      timezone
    }
    squads {
      id
      max_competitors
      ... on NordicSquadNode {
        name
        starts
        competitors {
          id
        }
      }
    }
  }
}
`

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

  // Choose query based on content type
  const isCup = contentType === '136'
  const query = isCup ? CUP_STRUCTURE_QUERY : MATCH_STRUCTURE_QUERY

  const data = await ssiGraphQL(jwt, query, {
    ct: parseInt(contentType, 10),
    id: eventId,
  })

  if (!data.event) {
    throw new Error(`SSI event not found: CT=${contentType} ID=${eventId}`)
  }

  const event = data.event

  // Build structured snapshot
  const snapshot = {
    importedAt: new Date().toISOString(),
    sourceUrl: ssiEventUrl,
    contentType,
    eventId,
    isCup,

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

    // Squads (cup-level or match-level)
    squads: (event.squads || []).map(sq => ({
      id: sq.id,
      name: sq.name,
      maxCompetitors: sq.max_competitors,
      starts: sq.starts,
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
