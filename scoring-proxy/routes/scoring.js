import express from 'express'
import { ssiGetScoringPage, ssiSubmitScore } from '../lib/ssi-client.js'
import { log } from '../lib/logger.js'

const router = express.Router()

export function createScoringRouter({ requireAuth, graphqlWithRefresh }) {
  // ============================================================
  // GET /api/cups?search=Kupittaa — Search for cups by name
  // Uses SSI events(search:) query, filters to CT=136 (cups)
  // ============================================================
  router.get('/cups', requireAuth('scoring'), async (req, res) => {
    const search = req.query.search
    if (!search || search.length < 2) {
      return res.json({ cups: [] })
    }

    try {
      const result = await graphqlWithRefresh(req.ssiSession, `
        query SearchCups($search: String!) {
          events(search: $search) {
            id name starts status get_content_type_key
          }
        }
      `, { search })

      // Filter to cups (CT=136) only
      const cups = (result.events || [])
        .filter(e => e.get_content_type_key === 136)
        .map(c => ({
          id: c.id,
          name: c.name,
          starts: c.starts,
          status: c.status,
        }))

      // Sort by date: closest to today first (ascending by absolute distance)
      const now = Date.now()
      cups.sort((a, b) => {
        const da = Math.abs(new Date(a.starts).getTime() - now)
        const db = Math.abs(new Date(b.starts).getTime() - now)
        return da - db
      })

      res.json({ cups })
    } catch (err) {
      console.error('Failed to search cups:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /api/cup/:id — Get cup with its component matches
  // ============================================================
  router.get('/cup/:id', requireAuth('scoring'), async (req, res) => {
    try {
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

      // Extract actual match data from component_matches wrapper
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
    } catch (err) {
      console.error('Failed to fetch cup:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /api/match/:id — Get match with squads and competitors
  // ============================================================
  router.get('/match/:id', requireAuth('scoring'), async (req, res) => {
    try {
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
    } catch (err) {
      console.error('Failed to fetch match:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /api/competitor/:id — Get single competitor scores
  // ============================================================
  router.get('/competitor/:id', requireAuth('scoring'), async (req, res) => {
    try {
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
    } catch (err) {
      console.error('Failed to fetch competitor:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /api/competitor/:id/score — Submit scores via form POST
  // ============================================================
  router.post('/competitor/:id/score', requireAuth('scoring'), async (req, res) => {
    const session = req.ssiSession
    if (!session.ssiCookies) return res.status(401).json({ error: 'No SSI session. Login first.' })

    const { scores, warning, dqReason, comment } = req.body
    // scores = { 0: { X: 0, '10': 3, '9': 2, ... }, 1: { ... }, ... } (6 series)

    if (!scores || typeof scores !== 'object') {
      return res.status(400).json({ error: 'scores object required' })
    }

    const competitorId = req.params.id

    try {
      // 1. GET the scoring page to extract CSRF token and form structure
      const { csrfToken, formAction } = await ssiGetScoringPage(competitorId, session.ssiCookies)

      // 2. Build the Django formset data
      const ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']
      const ZONE_KEYS = ['xxx', 'ten', 'nine', 'eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one', 'miss']
      const numStrings = Object.keys(scores).length || 6

      const formData = new URLSearchParams()
      formData.append('csrfmiddlewaretoken', csrfToken)
      formData.append('form-TOTAL_FORMS', String(numStrings))
      formData.append('form-INITIAL_FORMS', String(numStrings))
      formData.append('form-MIN_NUM_FORMS', '0')
      formData.append('form-MAX_NUM_FORMS', '1')

      for (let i = 0; i < numStrings; i++) {
        const series = scores[i] || {}
        for (let z = 0; z < ZONES.length; z++) {
          const val = series[ZONES[z]] || 0
          formData.append(`form-${i}-${ZONE_KEYS[z]}`, String(val))
        }
        formData.append(`form-${i}-max_hits`, '5')
      }

      // Optional fields
      formData.append('warning', warning ? 'on' : '')
      formData.append('dq_reason', dqReason || 'no')
      formData.append('score_comment', comment || '')
      formData.append('asynchronous', 'False')
      formData.append('custom_data', '{}')

      // 3. POST to SSI
      const result = await ssiSubmitScore(competitorId, formData, session.ssiCookies, csrfToken)

      // 4. Read back the updated scores via GraphQL to confirm
      if (session.jwt) {
        const updated = await graphqlWithRefresh(session, `
          query Verify($id: String!) {
            competitor(content_type: 93, id: $id) {
              id first_name last_name
              ... on NordicCompetitorNode {
                s1 s2 s3 s4 s5 s6
                s1_points s2_points s3_points s4_points s5_points s6_points
                tot_hits tot_inner_hits tot_precision_points
              }
            }
          }
        `, { id: competitorId })

        res.json({
          success: result.success,
          message: result.message,
          competitor: updated.competitor,
        })
      } else {
        res.json(result)
      }
    } catch (err) {
      console.error('Score submission failed:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /api/matches — Search matches across all time windows
  // ============================================================
  router.get('/matches', requireAuth(['scoring', 'reporting']), async (req, res) => {
    const search = req.query.search
    if (!search || search.length < 2) {
      return res.json({ matches: [] })
    }

    try {
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
    } catch (err) {
      console.error('Failed to search matches:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
