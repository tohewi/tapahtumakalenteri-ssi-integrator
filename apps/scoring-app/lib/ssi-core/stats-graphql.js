// ============================================================
// SSI Core — Event Statistics via GraphQL
//
// Queries SSI GraphQL for participant counts and event metadata
// used by CAL-5 (Calendar Statistics Update) and future PEW-3
// (Post-Event Workflow — Tapahtumakalenteri Statistics Update).
//
// Key GraphQL fields (on NordicSerieNode / NordicMatchNode):
//   - number_of_mainmatch_competitors_approved: approved participants (excl. DNS/DQ)
//   - competitors_count: total registered participants
//   - count: number of component matches (cups only)
//   - stages_count: number of stages
//   - status: event status ('cp' = completed)
//
// These fields are type-specific (not on EventInterface), so
// inline fragments are required for each discipline's node type.
// Currently supports Nordic (NordicSerieNode / NordicMatchNode).
// ============================================================

import { ssiGraphQL, ssiGraphQLAuth } from './graphql.js'
import { log } from '../logger.js'

// ============================================================
// GraphQL query for cup-level statistics
// Uses inline fragments for discipline-specific count fields.
// Currently supports Nordic cups (NordicSerieNode).
// ============================================================
const CUP_STATS_QUERY = `
query CupStats($ct: Int!, $id: String!) {
  event(content_type: $ct, id: $id) {
    id
    name
    status
    starts
    ends
    competitors_count
    ... on NordicSerieNode {
      count
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
    ... on IpscSerieNode {
      count
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
    ... on PrecisionSerieNode {
      count
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
    ... on PpcSerieNode {
      count
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
    component_matches {
      id
      number
      match {
        id
        name
        status
        competitors_count
        ... on NordicMatchNode {
          number_of_mainmatch_competitors_approved
          number_of_mainmatch_competitors_pending
        }
        ... on IpscMatchNode {
          number_of_mainmatch_competitors_approved
          number_of_mainmatch_competitors_pending
        }
        ... on PrecisionMatchNode {
          number_of_mainmatch_competitors_approved
          number_of_mainmatch_competitors_pending
        }
        ... on PpcMatchNode {
          number_of_mainmatch_competitors_approved
          number_of_mainmatch_competitors_pending
        }
      }
    }
  }
}
`

// ============================================================
// GraphQL query for standalone match statistics (no cup)
// ============================================================
const MATCH_STATS_QUERY = `
query MatchStats($ct: Int!, $id: String!) {
  event(content_type: $ct, id: $id) {
    id
    name
    status
    starts
    ends
    competitors_count
    ... on NordicMatchNode {
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
    ... on IpscMatchNode {
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
    ... on PrecisionMatchNode {
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
    ... on PpcMatchNode {
      number_of_mainmatch_competitors_approved
      number_of_mainmatch_competitors_pending
    }
  }
}
`

/**
 * Fetch event statistics from SSI via GraphQL.
 *
 * For cups: queries the cup-level participant counts + per-match breakdown.
 * For standalone matches: queries match-level participant counts.
 *
 * @param {object} params
 * @param {object} params.credentials - { email, password } for SSI auth
 * @param {string|number} params.cupTypeId - SSI content type ID (e.g. 136 for cups)
 * @param {string|number} params.cupId - SSI event ID
 * @param {boolean} [params.isCup=true] - true for cups, false for standalone matches
 * @returns {Promise<object>} Event statistics
 * @returns {number} return.approvedCount - Approved participants (excl. DNS/DQ)
 * @returns {number} return.totalCount - Total registered participants
 * @returns {number} return.matchCount - Number of component matches (cups only, 0 for matches)
 * @returns {string} return.status - SSI event status ('cp' = completed)
 * @returns {string} return.eventName - Event name from SSI
 * @returns {Array<object>} return.matches - Per-match stats (cups only)
 */
export async function ssiGetEventStats({ credentials, cupTypeId, cupId, isCup = true }) {
  if (!credentials?.email || !credentials?.password) {
    throw new Error('[ssi-stats] SSI credentials required')
  }
  if (!cupTypeId || !cupId) {
    throw new Error('[ssi-stats] cupTypeId and cupId are required')
  }

  const ct = parseInt(cupTypeId, 10)
  const id = String(cupId)

  log.info(`[ssi-stats] Fetching stats: CT=${ct} ID=${id} isCup=${isCup}`)

  // Authenticate with SSI GraphQL
  const auth = await ssiGraphQLAuth(credentials)
  const jwt = auth.token

  // Select query based on event type
  const query = isCup ? CUP_STATS_QUERY : MATCH_STATS_QUERY
  const data = await ssiGraphQL(jwt, query, { ct, id })

  if (!data?.event) {
    throw new Error(`[ssi-stats] SSI event not found: CT=${ct} ID=${id}`)
  }

  const event = data.event
  const approvedCount = event.number_of_mainmatch_competitors_approved ?? 0
  const totalCount = event.competitors_count ?? 0

  const result = {
    approvedCount,
    totalCount,
    matchCount: isCup ? (event.count ?? event.component_matches?.length ?? 0) : 0,
    status: event.status,
    eventName: event.name,
    starts: event.starts,
    ends: event.ends,
    matches: [],
  }

  // Per-match breakdown (cups only)
  if (isCup && event.component_matches) {
    result.matches = event.component_matches.map(cm => ({
      id: cm.match?.id,
      number: cm.number,
      name: cm.match?.name,
      status: cm.match?.status,
      approvedCount: cm.match?.number_of_mainmatch_competitors_approved ?? 0,
      totalCount: cm.match?.competitors_count ?? 0,
    }))
  }

  log.info(`[ssi-stats] Stats for "${event.name}": ${approvedCount} approved / ${totalCount} total, ${result.matchCount} matches, status=${event.status}`)

  return result
}
