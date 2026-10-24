import express from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { log } from '../lib/logger.js'
import { auditMutation } from '../lib/session/index.js'
import {
  isDebugModeEnabled,
  getTodayStart,
  startsOnOrAfterDate,
  sortByProximityToNow,
  isUnsupportedStatusFilterError,
  buildMatchSearchWindows,
  mergeAndFormatEvents,
  submitCompetitorScore,
} from '../lib/services/scoring-service.js'

const SEARCH_CUPS_DEBUG_QUERY = `
  query SearchCupsDebug($search: String!) {
    events(search: $search) {
      id name starts status get_content_type_key
    }
  }
`

const SEARCH_CUPS_FILTERED_QUERY = `
  query SearchCups($search: String!, $startsAfter: String!, $status: String!) {
    events(search: $search, starts_after: $startsAfter, status: $status) {
      id name starts status get_content_type_key
    }
  }
`

const SEARCH_CUPS_FALLBACK_QUERY = `
  query SearchCupsFallback($search: String!, $startsAfter: String!) {
    events(search: $search, starts_after: $startsAfter) {
      id name starts status get_content_type_key
    }
  }
`

export function createScoringRouter({ requireAuth, graphqlWithRefresh }) {
  const router = express.Router()

  router.get('/cups', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const search = req.query.search
    const debugMode = isDebugModeEnabled(req.query.debug)
    if (!search || search.length < 2) {
      return res.json({ cups: [] })
    }

    const todayStart = getTodayStart()
    let statusFilterFallback = false
    let result

    if (debugMode) {
      result = await graphqlWithRefresh(req.ssiSession, SEARCH_CUPS_DEBUG_QUERY, { search })
    } else {
      try {
        result = await graphqlWithRefresh(req.ssiSession, SEARCH_CUPS_FILTERED_QUERY, {
          search,
          startsAfter: todayStart.toISOString(),
          status: 'on',
        })
      } catch (err) {
        if (!isUnsupportedStatusFilterError(err)) {
          throw err
        }

        statusFilterFallback = true
        log.warn('[scoring] events(status:) unsupported by SSI GraphQL, applying status filter locally')
        result = await graphqlWithRefresh(req.ssiSession, SEARCH_CUPS_FALLBACK_QUERY, {
          search,
          startsAfter: todayStart.toISOString(),
        })
      }
    }

    const rawCups = (result.events || [])
      .filter(e => e.get_content_type_key === 136)
      .map(c => ({
        id: c.id,
        name: c.name,
        starts: c.starts,
        status: c.status,
      }))

    const upcomingByDate = rawCups
      .filter(c => startsOnOrAfterDate(c.starts, todayStart))
    const activeUpcoming = upcomingByDate
      .filter(c => c.status === 'on')

    const filteredCups = statusFilterFallback
      ? activeUpcoming
      : upcomingByDate

    const cups = (debugMode ? rawCups : filteredCups)
      .sort(sortByProximityToNow())

    if (debugMode) {
      return res.json({
        cups,
        debug: {
          enabled: true,
          totalRaw: rawCups.length,
          activeUpcoming: activeUpcoming.length,
          filteredOut: rawCups.length - activeUpcoming.length,
        },
      })
    }

    res.json({ cups })
  }))

  router.get('/cup/:id', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const result = await graphqlWithRefresh(req.ssiSession, `
      query CupDetail($id: String!) {
        event(content_type: 136, id: $id) {
          id name starts status
          ... on NordicSerieNode {
            component_matches {
              number included
              match {
                id name starts status
                uses_strings number_of_strings number_of_rounds_per_string
              }
            }
          }
        }
      }
    `, { id: req.params.id })

    if (!result.event) {
      return res.status(404).json({ error: 'Cup not found' })
    }

    const matches = (result.event.component_matches || [])
      .filter(cm => cm.included && cm.match)
      .map(cm => ({ ...cm.match, componentNumber: cm.number }))
      .sort((a, b) => (a.componentNumber || 0) - (b.componentNumber || 0))

    res.json({
      id: result.event.id,
      name: result.event.name,
      starts: result.event.starts,
      status: result.event.status,
      matches,
    })
  }))

  router.get('/match/:id', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const result = await graphqlWithRefresh(req.ssiSession, `
      query Match($id: String!) {
        event(content_type: 91, id: $id) {
          id
          name
          starts
          rule
          status
          uses_strings
          number_of_strings
          number_of_rounds_per_string
          squads {
            id
            number
            comment
            ... on NordicSquadNode {
              competitors {
                id
                first_name
                last_name
                number
                status
                did_not_finish
                is_scoring_started
                is_verified
                ... on NordicCompetitorNode {
                  weapon_group
                  category
                  classification
                  s1 s2 s3 s4 s5 s6
                  s1_points s2_points s3_points s4_points s5_points s6_points
                  tot_hits tot_inner_hits tot_precision_points
                  warning
                  dq_reason
                  score_comment
                }
              }
            }
          }
        }
      }
    `, { id: req.params.id })

    res.json(result.event)
  }))

  router.get('/competitor/:id', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const result = await graphqlWithRefresh(req.ssiSession, `
      query Competitor($id: String!) {
        competitor(content_type: 93, id: $id) {
          id
          first_name
          last_name
          number
          status
          ... on NordicCompetitorNode {
            s1 s2 s3 s4 s5 s6
            s1_points s2_points s3_points s4_points s5_points s6_points
            tot_hits tot_inner_hits tot_precision_points
            warning dq_reason score_comment
          }
        }
      }
    `, { id: req.params.id })

    res.json(result.competitor)
  }))

  router.post('/competitor/:id/score', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const session = req.ssiSession
    if (!session.ssiCookies) return res.status(401).json({ error: 'No SSI session. Login first.' })

    const { scores, warning, dqReason, comment } = req.body
    if (!scores || typeof scores !== 'object') {
      return res.status(400).json({ error: 'scores object required' })
    }

    let payload
    try {
      payload = await submitCompetitorScore({
        competitorId: req.params.id,
        scores,
        warning,
        dqReason,
        comment,
        session,
        graphqlWithRefresh,
      })
    } catch (err) {
      auditMutation({
        endpoint: `/api/v1/scoring/competitor/${req.params.id}/score`,
        operation: 'submit_score',
        initiatingUserId: session._userId || 'unknown',
        targetEntity: { competitorId: req.params.id },
        result: 'failure',
        errorCode: err.code || 'SSI_OPERATION_FAILED',
      })
      throw err
    }

    auditMutation({
      endpoint: `/api/v1/scoring/competitor/${req.params.id}/score`,
      operation: 'submit_score',
      initiatingUserId: session.userId || 'unknown',
      targetEntity: { competitorId: req.params.id },
      result: payload.success === false ? 'failure' : 'success',
    })

    res.json(payload)
  }))

  router.get('/matches', requireAuth(['scoring', 'reporting']), asyncHandler(async (req, res) => {
    const search = req.query.search
    if (!search || search.length < 2) {
      return res.json({ matches: [] })
    }

    const QUERY = `
      query SearchEvents($search: String!, $after: String, $before: String) {
        events(search: $search, starts_after: $after, starts_before: $before) {
          id name starts status rule get_content_type_key
          ... on NordicSerieNode {
            component_matches {
              number included
              match { id name starts status rule }
            }
          }
        }
      }
    `

    const windows = buildMatchSearchWindows()
    const results = await Promise.all(
      windows.map(w =>
        graphqlWithRefresh(req.ssiSession, QUERY, {
          search,
          after: w.after,
          before: w.before,
        }).catch(err => {
          log.debug(`[search] Window ${w.after}→${w.before} failed: ${err.message}`)
          return { events: [] }
        })
      )
    )

    const matches = mergeAndFormatEvents(results)
    log.debug(`[search] "${search}": ${windows.length} windows → ${matches.length} events`)

    res.json({ matches })
  }))

  return router
}
