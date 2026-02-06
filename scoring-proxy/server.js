import express from 'express'
import cors from 'cors'
import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { ssiGraphQL, ssiLogin, ssiSubmitScore, ssiGetScoringPage } from './lib/ssi-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// In production, serve the built UI
const uiDist = path.join(__dirname, '..', 'scoring-ui', 'dist')
app.use(express.static(uiDist))

// ============================================================
// State: JWT token for GraphQL reads, session cookies for writes
// ============================================================
let jwtToken = null
let jwtRefreshToken = null
let sessionCookies = null

// ============================================================
// POST /api/auth/login — Login to SSI (both JWT + session)
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password, apiKey } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' })
  }

  try {
    // 1. Get JWT token via GraphQL
    const authResult = await ssiGraphQL(null, `
      mutation Auth($email: String!, $password: String!) {
        token_auth(email: $email, password: $password) {
          token {
            token
          }
          refresh_token {
            token
          }
        }
      }
    `, { email, password }, apiKey)

    if (!authResult.token_auth?.token?.token) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    jwtToken = authResult.token_auth.token.token
    jwtRefreshToken = authResult.token_auth.refresh_token.token

    // 2. Get session cookies via web login
    sessionCookies = await ssiLogin(email, password)

    res.json({
      success: true,
      hasJwt: !!jwtToken,
      hasSession: !!sessionCookies,
    })
  } catch (err) {
    console.error('Login failed:', err.message)
    res.status(401).json({ error: err.message })
  }
})

// ============================================================
// GET /api/auth/status — Check auth status
// ============================================================
app.get('/api/auth/status', (req, res) => {
  res.json({
    hasJwt: !!jwtToken,
    hasSession: !!sessionCookies,
  })
})

// ============================================================
// GET /api/cups?search=Kupittaa — Search for cups by name
// Uses SSI events(search:) query, filters to CT=136 (cups)
// ============================================================
app.get('/api/cups', async (req, res) => {
  if (!jwtToken) return res.status(401).json({ error: 'Not authenticated' })

  const search = req.query.search
  if (!search || search.length < 2) {
    return res.json({ cups: [] })
  }

  try {
    const result = await ssiGraphQL(jwtToken, `
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
app.get('/api/cup/:id', async (req, res) => {
  if (!jwtToken) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const result = await ssiGraphQL(jwtToken, `
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
      .sort((a, b) =>
        (a.starts || '').localeCompare(b.starts || '') || a.name.localeCompare(b.name)
      )

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
app.get('/api/match/:id', async (req, res) => {
  if (!jwtToken) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const result = await ssiGraphQL(jwtToken, `
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
app.get('/api/competitor/:id', async (req, res) => {
  if (!jwtToken) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const result = await ssiGraphQL(jwtToken, `
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
app.post('/api/competitor/:id/score', async (req, res) => {
  if (!sessionCookies) return res.status(401).json({ error: 'No SSI session. Login first.' })

  const { scores, warning, dqReason, comment } = req.body
  // scores = { 0: { X: 0, '10': 3, '9': 2, ... }, 1: { ... }, ... } (6 series)

  if (!scores || typeof scores !== 'object') {
    return res.status(400).json({ error: 'scores object required' })
  }

  const competitorId = req.params.id

  try {
    // 1. GET the scoring page to extract CSRF token and form structure
    const { csrfToken, formAction } = await ssiGetScoringPage(competitorId, sessionCookies)

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
    const result = await ssiSubmitScore(competitorId, formData, sessionCookies, csrfToken)

    // 4. Read back the updated scores via GraphQL to confirm
    if (jwtToken) {
      const updated = await ssiGraphQL(jwtToken, `
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
// SPA fallback — serve index.html for non-API routes (production)
// ============================================================
const indexPath = path.join(uiDist, 'index.html')
if (existsSync(indexPath)) {
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(indexPath)
  })
}

// ============================================================
// Start server
// ============================================================
app.listen(PORT, () => {
  console.log(`Scoring proxy running on http://localhost:${PORT}`)
  console.log('Endpoints:')
  console.log('  POST /api/auth/login     { email, password, apiKey }')
  console.log('  GET  /api/auth/status')
  console.log('  GET  /api/cups?search=')
  console.log('  GET  /api/cup/:id')
  console.log('  GET  /api/match/:id')
  console.log('  GET  /api/competitor/:id')
  console.log('  POST /api/competitor/:id/score  { scores, warning, dqReason, comment }')
  if (existsSync(indexPath)) {
    console.log(`  UI served from ${uiDist}`)
  }
})
