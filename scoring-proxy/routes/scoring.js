import express from 'express'
import { createError, asyncHandler } from '../middleware/errorHandler.js'
import scoringService from '../lib/services/scoring-service.js'
import { log } from '../lib/logger.js'

export function createScoringRouter({ requireAuth, graphqlWithRefresh }) {
  const router = express.Router()

  // ============================================================
  // GET /api/cups?search=Kupittaa — Search for cups by name
  // Uses SSI events(search:) query, filters to CT=136 (cups)
  // ============================================================
  router.get('/cups', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const cups = await scoringService.searchCups(
      req.query.search,
      req.ssiSession,
      graphqlWithRefresh
    )
    res.json({ cups })
  }))

  // ============================================================
  // GET /api/cup/:id — Get cup with its component matches
  // ============================================================
  router.get('/cup/:id', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const cup = await scoringService.getCupDetails(
      req.params.id,
      req.ssiSession,
      graphqlWithRefresh
    )
    res.json(cup)
  }))

  // ============================================================
  // GET /api/match/:id — Get match with squads and competitors
  // ============================================================
  router.get('/match/:id', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const match = await scoringService.getMatchDetails(
      req.params.id,
      req.ssiSession,
      graphqlWithRefresh
    )
    res.json(match)
  }))

  // ============================================================
  // GET /api/competitor/:id — Get single competitor scores
  // ============================================================
  router.get('/competitor/:id', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const competitor = await scoringService.getCompetitorDetails(
      req.params.id,
      req.ssiSession,
      graphqlWithRefresh
    )
    res.json(competitor)
  }))

  // ============================================================
  // POST /api/competitor/:id/score — Submit scores via form POST
  // ============================================================
  router.post('/competitor/:id/score', requireAuth('scoring'), asyncHandler(async (req, res) => {
    const session = req.ssiSession
    if (!session.ssiCookies) {
      throw createError('authentication', 'No SSI session. Login first.')
    }

    const { scores, warning, dqReason, comment } = req.body
    const competitorId = req.params.id

    // Get match configuration for validation
    const competitor = await scoringService.getCompetitorDetails(
      competitorId,
      session,
      graphqlWithRefresh
    )

    // Submit scores
    const result = await scoringService.submitScores(
      competitorId,
      scores,
      session,
      competitor.match
    )

    // Read back updated scores for verification
    if (session.jwt) {
      const updated = await scoringService.getCompetitorDetails(
        competitorId,
        session,
        graphqlWithRefresh
      )
      res.json({
        success: true,
        competitor: updated,
        ...result
      })
    } else {
      res.json(result)
    }
  }))

  // ============================================================
  // GET /api/matches — Search matches across all time windows
  // ============================================================
  router.get('/matches', requireAuth(['scoring', 'reporting']), asyncHandler(async (req, res) => {
    const search = req.query.search
    if (!search || search.length < 2) {
      return res.json({ matches: [] })
    }

    // SSI GraphQL events() is hard-capped at 100 results per call.
    // To get all matches we split into date windows and merge results.
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

    // Build date windows: each ~6 months, going back 5 years + future
    const now = new Date()
    const windows = []
    // Future window (now → +1 year)
    const futureEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    windows.push({ after: now.toISOString().split('T')[0], before: futureEnd.toISOString().split('T')[0] })
    // Past windows: 6-month chunks going back 5 years
    for (let i = 0; i < 10; i++) {
      const end = new Date(now)
      end.setMonth(end.getMonth() - i * 6)
      const start = new Date(now)
      start.setMonth(start.getMonth() - (i + 1) * 6)
      windows.push({
        after: start.toISOString().split('T')[0],
        before: end.toISOString().split('T')[0],
      })
    }

    // Run all windows in parallel
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

    // Merge and deduplicate by event ID
    const seen = new Set()
    const allEvents = []
    for (const result of results) {
      for (const e of (result.events || [])) {
        if (!seen.has(e.id)) {
          seen.add(e.id)
          allEvents.push(e)
        }
      }
    }

    const matches = allEvents.map(e => {
      const item = {
        id: e.id,
        name: e.name,
        starts: e.starts,
        status: e.status,
        rule: e.rule || null,
        contentType: e.get_content_type_key,
      }
      if (e.get_content_type_key === 136 && e.component_matches) {
        item.componentMatches = (e.component_matches || [])
          .filter(cm => cm.included && cm.match)
          .map(cm => ({
            id: cm.match.id,
            name: cm.match.name,
            starts: cm.match.starts,
            status: cm.match.status,
            rule: cm.match.rule || null,
          }))
      }
      return item
    })

    // Sort by date descending (newest first)
    matches.sort((a, b) => new Date(b.starts) - new Date(a.starts))

    log.debug(`[search] "${search}": ${windows.length} windows → ${matches.length} events`)

    res.json({ matches })
  }))

  return router
}
