import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import crypto from 'node:crypto'
import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { ssiGraphQL, ssiLogin, ssiSubmitScore, ssiGetScoringPage, ssiRefreshJWT, ssiSearchAndAddParticipant, ssiSetParticipantSquad, ssiFindCompetitorInMatch, ssiFindAndApproveCupParticipant } from './lib/ssi-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const IS_PROD = process.env.NODE_ENV === 'production'

// ============================================================
// Security middleware
// ============================================================

// Helmet: security headers (relaxed CSP for Tailwind inline styles)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

// CORS: locked to own origin in production
const ALLOWED_ORIGINS = IS_PROD
  ? [process.env.APP_URL || 'https://ssi-scoring.onrender.com']
  : true
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))

app.use(express.json())
app.use(cookieParser())

// Rate limit on login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
})

// In production, serve the built UI
const uiDist = path.join(__dirname, '..', 'scoring-ui', 'dist')
app.use(express.static(uiDist))

// ============================================================
// Session store: per-user isolation for multi-user scoring
//
// Map<sessionId, {
//   jwt, refreshToken, apiKey, ssiCookies,
//   createdAt, lastUsed
// }>
// ============================================================

const sessions = new Map()
const SESSION_TTL = 8 * 60 * 60 * 1000 // 8 hours
const SESSION_COOKIE = 'ssi_session'

// Cleanup expired sessions every 15 minutes
setInterval(() => {
  const now = Date.now()
  let cleaned = 0
  for (const [id, s] of sessions) {
    if (now - s.lastUsed > SESSION_TTL) {
      sessions.delete(id)
      cleaned++
    }
  }
  if (cleaned > 0 && !IS_PROD) {
    console.log(`[session] Cleaned ${cleaned} expired session(s). Active: ${sessions.size}`)
  }
}, 15 * 60 * 1000)

// Get session from request cookie
function getSession(req) {
  const id = req.cookies?.[SESSION_COOKIE]
  if (!id) return null
  const session = sessions.get(id)
  if (!session) return null
  if (Date.now() - session.lastUsed > SESSION_TTL) {
    sessions.delete(id)
    return null
  }
  session.lastUsed = Date.now()
  return session
}

// Middleware: require authenticated session
function requireAuth(req, res, next) {
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not authenticated. Please login.' })
  req.ssiSession = session
  next()
}

// Set session cookie on response
function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/api',
    maxAge: SESSION_TTL,
  })
}

// Execute GraphQL with automatic JWT refresh on auth failure
async function graphqlWithRefresh(session, query, variables = {}) {
  try {
    return await ssiGraphQL(session.jwt, query, variables)
  } catch (err) {
    // If it looks like a token expiry, try refreshing
    if (session.refreshToken && (
      err.message.includes('Signature') ||
      err.message.includes('expired') ||
      err.message.includes('401')
    )) {
      try {
        const newTokens = await ssiRefreshJWT(session.refreshToken)
        session.jwt = newTokens.token
        session.refreshToken = newTokens.refreshToken
        return await ssiGraphQL(session.jwt, query, variables)
      } catch {
        throw new Error('Session expired. Please login again.')
      }
    }
    throw err
  }
}

// ============================================================
// GET /api/health — Health check
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    uptime: Math.round(process.uptime()),
  })
})

// ============================================================
// POST /api/auth/login — Login to SSI (both JWT + session)
// ============================================================
app.post('/api/auth/login', loginLimiter, async (req, res) => {
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

    const jwt = authResult.token_auth.token.token
    const refreshToken = authResult.token_auth.refresh_token.token

    // 2. Get session cookies via web login
    const ssiCookies = await ssiLogin(email, password)

    // 3. Create a proxy session
    const sessionId = crypto.randomUUID()
    const now = Date.now()
    sessions.set(sessionId, {
      jwt,
      refreshToken,
      apiKey: apiKey || null,
      ssiCookies,
      createdAt: now,
      lastUsed: now,
    })

    setSessionCookie(res, sessionId)

    if (!IS_PROD) {
      console.log(`[session] New session created. Active: ${sessions.size}`)
    }

    res.json({
      success: true,
      hasJwt: true,
      hasSession: !!ssiCookies,
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
  const session = getSession(req)
  res.json({
    authenticated: !!session,
    hasJwt: !!session?.jwt,
    hasSession: !!session?.ssiCookies,
  })
})

// ============================================================
// POST /api/auth/logout — Destroy session
// ============================================================
app.post('/api/auth/logout', (req, res) => {
  const id = req.cookies?.[SESSION_COOKIE]
  if (id) sessions.delete(id)
  res.clearCookie(SESSION_COOKIE, { path: '/api' })
  res.json({ success: true })
})

// ============================================================
// GET /api/cups?search=Kupittaa — Search for cups by name
// Uses SSI events(search:) query, filters to CT=136 (cups)
// ============================================================
app.get('/api/cups', requireAuth, async (req, res) => {
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
app.get('/api/cup/:id', requireAuth, async (req, res) => {
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
app.get('/api/match/:id', requireAuth, async (req, res) => {
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
app.get('/api/competitor/:id', requireAuth, async (req, res) => {
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
app.post('/api/competitor/:id/score', requireAuth, async (req, res) => {
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
// Registration: Admin session (singleton, lazy-init)
// Uses SSI_ADMIN_EMAIL + SSI_ADMIN_PASSWORD env vars
// ============================================================

let adminCookies = null
let adminJwt = null
let adminRefreshToken = null
let adminLoginTime = 0
const ADMIN_SESSION_TTL = 4 * 60 * 60 * 1000 // 4 hours

async function getAdminSession() {
  const email = process.env.SSI_ADMIN_EMAIL
  const password = process.env.SSI_ADMIN_PASSWORD
  const apiKey = process.env.SSI_ADMIN_API_KEY || null
  if (!email || !password) {
    throw new Error('Registration not configured: SSI_ADMIN_EMAIL and SSI_ADMIN_PASSWORD required')
  }

  // Reuse if still fresh
  if (adminCookies && (Date.now() - adminLoginTime) < ADMIN_SESSION_TTL) {
    return { cookies: adminCookies, jwt: adminJwt, refreshToken: adminRefreshToken }
  }

  // Login as admin
  if (!IS_PROD) console.log('[register] Admin login...')
  adminCookies = await ssiLogin(email, password)

  // Get JWT for GraphQL reads
  const authResult = await ssiGraphQL(null, `
    mutation Auth($email: String!, $password: String!) {
      token_auth(email: $email, password: $password) {
        token { token }
        refresh_token { token }
      }
    }
  `, { email, password }, apiKey)
  adminJwt = authResult.token_auth?.token?.token || null
  adminRefreshToken = authResult.token_auth?.refresh_token?.token || null
  adminLoginTime = Date.now()

  if (!IS_PROD) console.log('[register] Admin session ready')
  return { cookies: adminCookies, jwt: adminJwt, refreshToken: adminRefreshToken }
}

// GraphQL query using admin JWT
async function adminGraphQL(query, variables = {}) {
  const admin = await getAdminSession()
  try {
    return await ssiGraphQL(admin.jwt, query, variables)
  } catch (err) {
    if (admin.refreshToken && (err.message.includes('expired') || err.message.includes('Signature'))) {
      const newTokens = await ssiRefreshJWT(admin.refreshToken)
      adminJwt = newTokens.token
      adminRefreshToken = newTokens.refreshToken
      return await ssiGraphQL(adminJwt, query, variables)
    }
    throw err
  }
}

// ============================================================
// Registration: Captcha store
// Simple math challenge: a + b = ?
// ============================================================

const captchaChallenges = new Map()
const CAPTCHA_TTL = 15 * 60 * 1000 // 15 minutes (multi-step form needs breathing room)

// Cleanup expired captchas every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [id, c] of captchaChallenges) {
    if (now - c.created > CAPTCHA_TTL) captchaChallenges.delete(id)
  }
}, 5 * 60 * 1000)

// Rate limit for registration: 5 submit attempts per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Liian monta yritystä. Yritä uudelleen tunnin kuluttua.' },
})

// Rate limit for captcha: 30 per hour per IP (prevents enumeration)
const captchaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Liian monta pyyntöä.' },
})

// Rate limit for cup/squad reads: 60 per hour per IP
const registerReadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Liian monta pyyntöä.' },
})

// Request body size limit for registration endpoints (1 KB max)
const registerBodyLimit = express.json({ limit: '1kb' })

// ============================================================
// Registration: Input validation helpers (RSEC3, RSEC5)
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LEN = 254

function validateRegistrationInput({ cupId, squadNumber, email, captchaId, captchaAnswer }) {
  const errors = []

  // cupId: must be a string of digits (SSI event ID)
  if (typeof cupId !== 'string' && typeof cupId !== 'number') errors.push('cupId: required')
  else if (!/^\d{1,10}$/.test(String(cupId))) errors.push('cupId: invalid format')

  // squadNumber: small positive integer (1-99)
  if (squadNumber == null) errors.push('squadNumber: required')
  else if (!Number.isInteger(Number(squadNumber)) || Number(squadNumber) < 1 || Number(squadNumber) > 99) errors.push('squadNumber: invalid')

  // email: valid format, max 254 chars
  if (typeof email !== 'string') errors.push('email: required')
  else if (email.length > MAX_EMAIL_LEN) errors.push('email: too long')
  else if (!EMAIL_RE.test(email)) errors.push('email: invalid format')

  // captchaId: UUID
  if (typeof captchaId !== 'string') errors.push('captchaId: required')
  else if (!UUID_RE.test(captchaId)) errors.push('captchaId: invalid format')

  // captchaAnswer: small integer (-999 to 999)
  if (captchaAnswer == null) errors.push('captchaAnswer: required')
  else if (!Number.isInteger(Number(captchaAnswer)) || Math.abs(Number(captchaAnswer)) > 999) errors.push('captchaAnswer: invalid')

  return errors
}

// ============================================================
// GET /api/register/captcha — Generate math challenge
// ============================================================
app.get('/api/register/captcha', captchaLimiter, (req, res) => {
  const a = Math.floor(Math.random() * 20) + 1
  const b = Math.floor(Math.random() * 20) + 1
  const id = crypto.randomUUID()
  captchaChallenges.set(id, { answer: a + b, created: Date.now() })
  res.json({ id, question: `${a} + ${b} = ?` })
})

// ============================================================
// GET /api/register/cups — List open cups (public, no auth)
// Searches for "Kupittaa CUP", returns future cups with
// registration open and capacity info
// ============================================================
app.get('/api/register/cups', registerReadLimiter, async (req, res) => {
  try {
    const result = await adminGraphQL(`
      query {
        events(search: "Kupittaa CUP") {
          id name starts status get_content_type_key
          max_competitors
          number_of_prematch_competitors_registered
          registration
          ... on NordicSerieNode {
            registration_starts
            registration_closes
          }
        }
      }
    `)

    const now = new Date()
    const cups = (result.events || [])
      .filter(e => e.get_content_type_key === 136)
      .filter(e => new Date(e.starts) > now) // future only
      .filter(e => e.status === 'on')         // active only
      .map(c => {
        const full = (c.number_of_prematch_competitors_registered || 0) >= (c.max_competitors || 25)
        const regStarts = c.registration_starts ? new Date(c.registration_starts) : null
        const regCloses = c.registration_closes ? new Date(c.registration_closes) : null
        // registrationOpen = mode allows it AND within time window AND not full
        const registrationOpen = (c.registration === 'op' || c.registration === 'aa')
          && (!regStarts || now >= regStarts)
          && (!regCloses || now <= regCloses)
          && !full
        return {
          id: c.id,
          name: c.name,
          starts: c.starts,
          maxCompetitors: c.max_competitors || 25,
          registered: c.number_of_prematch_competitors_registered || 0,
          full,
          registrationOpen,
        }
      })
      .sort((a, b) => new Date(a.starts) - new Date(b.starts))

    res.json({ cups })
  } catch (err) {
    console.error('[register] Failed to list cups:', err.message)
    res.status(500).json({ error: 'Ilmoittautumispalvelu ei ole käytettävissä.' })
  }
})

// ============================================================
// GET /api/register/cup/:id — Cup squads with capacity (public)
// Returns squad info aggregated across all matches in the cup
// ============================================================
app.get('/api/register/cup/:id', registerReadLimiter, async (req, res) => {
  // Validate cup ID format (RSEC3)
  if (!/^\d{1,10}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Virheellinen Cup-tunniste.' })
  }

  try {
    const result = await adminGraphQL(`
      query CupDetail($id: String!) {
        event(content_type: 136, id: $id) {
          id name starts status
          max_competitors
          number_of_prematch_competitors_registered
          ... on NordicSerieNode {
            component_matches {
              number included
              match {
                id name starts status
                squads {
                  id number comment
                  ... on NordicSquadNode {
                    max_competitors
                    competitors { id status }
                  }
                }
              }
            }
          }
        }
      }
    `, { id: req.params.id })

    if (!result.event) {
      return res.status(404).json({ error: 'Cup not found' })
    }

    const cup = result.event
    const componentMatches = (cup.component_matches || [])
      .filter(cm => cm.included && cm.match)
      .sort((a, b) => a.number - b.number)

    // Aggregate squads across matches: use first match's squads as reference
    // Capacity = minimum available across all matches for that squad position
    const firstMatch = componentMatches[0]?.match
    if (!firstMatch) {
      return res.status(404).json({ error: 'No matches in cup' })
    }

    const squads = (firstMatch.squads || []).map((sq, idx) => {
      // Count active competitors across all matches for this squad position
      const counts = componentMatches.map(cm => {
        const matchSquad = cm.match.squads?.[idx]
        if (!matchSquad) return { current: 0, max: 0 }
        const active = (matchSquad.competitors || []).filter(c => c.status === 'a').length
        return { current: active, max: matchSquad.max_competitors || 0 }
      })

      // Use max of current counts and min of max across matches
      const maxCurrent = Math.max(...counts.map(c => c.current))
      const minMax = Math.min(...counts.map(c => c.max))

      return {
        number: sq.number,
        name: sq.comment || `Squad ${sq.number}`,
        current: maxCurrent,
        max: minMax,
        full: maxCurrent >= minMax,
      }
    })

    res.json({
      id: cup.id,
      name: cup.name,
      starts: cup.starts,
      status: cup.status,
      maxCompetitors: cup.max_competitors || 25,
      registered: cup.number_of_prematch_competitors_registered || 0,
      squads,
    })
  } catch (err) {
    console.error('[register] Failed to get cup:', err.message)
    res.status(500).json({ error: 'Ilmoittautumispalvelu ei ole käytettävissä.' })
  }
})

// ============================================================
// POST /api/register/submit — Register shooter to cup + squad
// Body: { cupId, squadNumber, email, captchaId, captchaAnswer }
// ============================================================
app.post('/api/register/submit', registerBodyLimit, registerLimiter, async (req, res) => {
  const { cupId, squadNumber, email, captchaId, captchaAnswer } = req.body || {}

  // Strict schema validation (RSEC3)
  const validationErrors = validateRegistrationInput({ cupId, squadNumber, email, captchaId, captchaAnswer })
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: 'Virheelliset tiedot.' })
  }

  // Validate captcha
  const challenge = captchaChallenges.get(captchaId)
  if (!challenge) {
    return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
  }
  captchaChallenges.delete(captchaId)
  if (Date.now() - challenge.created > CAPTCHA_TTL) {
    return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
  }
  if (Number(captchaAnswer) !== challenge.answer) {
    return res.status(400).json({ error: 'Väärä vastaus. Yritä uudelleen.' })
  }

  try {
    const admin = await getAdminSession()

    // 1. Get cup details to find match IDs and squad IDs
    const cupData = await adminGraphQL(`
      query CupDetail($id: String!) {
        event(content_type: 136, id: $id) {
          id name
          ... on NordicSerieNode {
            component_matches {
              number included
              match {
                id
                squads {
                  id number comment
                  ... on NordicSquadNode {
                    max_competitors
                    competitors { id status }
                  }
                }
              }
            }
          }
        }
      }
    `, { id: cupId })

    if (!cupData.event) {
      return res.status(404).json({ error: 'Cupia ei löydy.' })
    }

    const componentMatches = (cupData.event.component_matches || [])
      .filter(cm => cm.included && cm.match)
      .sort((a, b) => a.number - b.number)

    if (componentMatches.length === 0) {
      return res.status(400).json({ error: 'Cupissa ei ole osakilpailuja.' })
    }

    // 2. Add participant to Cup via web scraping
    if (!IS_PROD) console.log(`[register] Adding ${email} to cup ${cupId}`)
    const addResult = await ssiSearchAndAddParticipant(136, cupId, email, admin.cookies)

    const isReRegistration = addResult.success && addResult.message === 'Already registered'

    if (!addResult.success) {
      if (addResult.message === 'user_not_found') {
        return res.status(404).json({
          error: 'user_not_found',
          message: 'Sähköpostiosoitetta ei löydy SSI-järjestelmästä. Rekisteröidy ensin SSI:hin.',
          registerUrl: 'https://shootnscoreit.com/register/',
        })
      }
      return res.status(400).json({ error: addResult.message })
    }

    // 3. Get the shooter's name from the registration confirmation form
    //    _handleRegisterResponse extracts it from the shooter select element.
    //    Fallback to email prefix if not available.
    const shooterName = addResult.shooterName || email.split('@')[0].replace(/[+._-]/g, ' ')
    if (!IS_PROD) console.log(`[register] ${isReRegistration ? 'Re-registration' : 'New registration'} (${addResult.message}), shooter: "${shooterName}"`)

    // 4. Approve the CUP participant (default state is Pending)
    //    Switch to streaming (NDJSON) so the frontend can show progress
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    const sendProgress = (data) => res.write(JSON.stringify(data) + '\n')

    const totalMatches = componentMatches.length
    sendProgress({ type: 'progress', step: 'approve', current: 0, total: totalMatches, message: 'Cup-hyväksyntä...' })

    if (!IS_PROD) console.log(`[register] Approving CUP participant...`)
    const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, admin.cookies)
    if (!IS_PROD) console.log(`[register] Approve result: ${approveResult.message}`)
    if (!approveResult.success) {
      sendProgress({ type: 'result', success: false, message: `Ilmoittautuminen onnistui mutta hyväksyntä epäonnistui: ${approveResult.message}` })
      return res.end()
    }

    // 5. For each component match: register user, then find + approve + assign squad
    //    SSI does not auto-propagate CUP participants to matches when approved after pending.
    //    We must add the user to each match individually via participant-search-and-add (ct=91).
    const squadResults = []
    for (let i = 0; i < componentMatches.length; i++) {
      const cm = componentMatches[i]
      const matchId = cm.match.id
      sendProgress({ type: 'progress', step: 'match', current: i + 1, total: totalMatches, message: `Osakilpailu ${i + 1}/${totalMatches}...` })

      if (!IS_PROD) console.log(`[register] Adding ${email} to match ${matchId}`)

      // 5a. Register to match (search-and-add with contentType=91)
      const matchAddResult = await ssiSearchAndAddParticipant(91, matchId, email, admin.cookies)
      if (!IS_PROD) console.log(`[register] Match ${matchId} add result: ${matchAddResult.message}`)

      // 5b. Find competitor in the match
      const participantId = await ssiFindCompetitorInMatch(matchId, shooterName, admin.cookies)
      if (!participantId) {
        if (!IS_PROD) console.log(`[register] Competitor not found in match ${matchId}`)
        squadResults.push({ matchId, success: false, message: 'Competitor not found in match' })
        continue
      }

      // 5c. Assign squad + set status to approved via edit form
      if (!IS_PROD) console.log(`[register] Assigning squad ${squadNumber} to participant ${participantId} in match ${matchId}`)
      const editResult = await ssiSetParticipantSquad(participantId, squadNumber, admin.cookies)
      squadResults.push({ matchId, ...editResult })
    }

    const allSuccess = squadResults.every(r => r.success)
    const squadded = squadResults.filter(r => r.success).length
    const total = squadResults.length

    // RSEC8: Never expose internal IDs, URLs, or debug details in production
    sendProgress({
      type: 'result',
      success: allSuccess,
      isReRegistration,
      message: allSuccess
        ? (isReRegistration ? 'Squad päivitetty!' : 'Ilmoittautuminen ja squadiin asettelu onnistui!')
        : `${isReRegistration ? 'Squad-päivitys' : 'Ilmoittautuminen'} onnistui osittain. Squadiin asettelu: ${squadded}/${total} osakilpailua.`,
      ...(IS_PROD ? {} : { details: squadResults }),
    })
    res.end()
  } catch (err) {
    console.error('[register] Registration failed:', err.message)
    res.status(500).json({ error: 'Ilmoittautuminen epäonnistui. Yritä myöhemmin uudelleen.' })
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
  console.log(`Mode: ${IS_PROD ? 'production' : 'development'}`)
  console.log(`Session TTL: ${SESSION_TTL / 3600000}h`)
  console.log('Endpoints:')
  console.log('  POST /api/auth/login     { email, password, apiKey }')
  console.log('  GET  /api/auth/status')
  console.log('  POST /api/auth/logout')
  console.log('  GET  /api/health')
  console.log('  GET  /api/cups?search=')
  console.log('  GET  /api/cup/:id')
  console.log('  GET  /api/match/:id')
  console.log('  GET  /api/competitor/:id')
  console.log('  POST /api/competitor/:id/score  { scores, warning, dqReason, comment }')
  console.log('  GET  /api/register/captcha')
  console.log('  GET  /api/register/cups')
  console.log('  GET  /api/register/cup/:id')
  console.log('  POST /api/register/submit     { cupId, squadNumber, email, captchaId, captchaAnswer }')
  if (existsSync(indexPath)) {
    console.log(`  UI served from ${uiDist}`)
  }
})
