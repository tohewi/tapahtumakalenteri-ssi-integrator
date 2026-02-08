import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import crypto from 'node:crypto'
import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { ssiGraphQL, ssiLogin, ssiRefreshJWT } from './lib/ssi-client.js'
import { createAuthRouter } from './routes/auth.js'
import { createScoringRouter } from './routes/scoring.js'
import { createRegistrationRouter } from './routes/registration.js'
import { createReportsRouter } from './routes/reports.js'
import { createManagementRouter } from './routes/management.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const IS_PROD = process.env.NODE_ENV === 'production'

// Trust exactly one reverse proxy (Render). Without this, req.ip is always
// the Render proxy IP, making all rate limiters share a single counter.
if (IS_PROD) app.set('trust proxy', 1)

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
  ? [process.env.APP_URL || 'https://tapahtumakalenteri-ssi-integrator.onrender.com']
  : true
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))

app.use(express.json({ limit: '10kb' })) // global body size limit (RSEC4)
app.use(cookieParser())

// ============================================================
// Rate limit logging (RSEC11)
// Tracks IPs currently in "curfew" with first-throttled timestamp
// ============================================================
const rateLimitLog = new Map() // key: "limiterName:ip", value: { ip, limiter, firstThrottled }

function logRateLimit(limiterName, windowMs, ip, message) {
  const key = `${limiterName}:${ip}`
  const now = new Date()
  if (!rateLimitLog.has(key)) {
    rateLimitLog.set(key, { ip, limiter: limiterName, firstThrottled: now })
  }
  console.warn(`[rate-limit] ${limiterName}: IP ${ip} throttled at ${now.toISOString()}`)

  // Log all currently active throttled IPs
  const active = [...rateLimitLog.values()]
  if (active.length > 0) {
    console.warn(`[rate-limit] Currently throttled IPs (${active.length}):`)
    for (const entry of active) {
      console.warn(`  ${entry.limiter}: ${entry.ip} since ${entry.firstThrottled.toISOString()}`)
    }
  }

  return message
}

// Cleanup expired rate limit log entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitLog) {
    // Remove entries older than the longest window (15 min)
    if (now - entry.firstThrottled.getTime() > 15 * 60 * 1000) rateLimitLog.delete(key)
  }
}, 5 * 60 * 1000)

function rateLimitHandler(limiterName, windowMs, message) {
  return (req, res) => {
    logRateLimit(limiterName, windowMs, req.ip, message)
    res.status(429).json(message)
  }
}

// Rate limit on login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  handler: rateLimitHandler('login', 15 * 60 * 1000, { error: 'Too many login attempts. Try again in 15 minutes.' }),
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

// Rate limit for registration: 5 submit attempts per 10 min per IP
const registerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Liian monta yritystä. Yritä uudelleen 10 minuutin kuluttua.' },
  handler: rateLimitHandler('register-submit', 10 * 60 * 1000, { error: 'Liian monta yritystä. Yritä uudelleen 10 minuutin kuluttua.' }),
})

// Rate limit for captcha: 30 per 10 min per IP (prevents enumeration)
const captchaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Liian monta pyyntöä. Yritä uudelleen 10 minuutin kuluttua.' },
  handler: rateLimitHandler('captcha', 10 * 60 * 1000, { error: 'Liian monta pyyntöä. Yritä uudelleen 10 minuutin kuluttua.' }),
})

// Rate limit for cup/squad reads: 60 per 10 min per IP
const registerReadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Liian monta pyyntöä. Yritä uudelleen 10 minuutin kuluttua.' },
  handler: rateLimitHandler('register-read', 10 * 60 * 1000, { error: 'Liian monta pyyntöä. Yritä uudelleen 10 minuutin kuluttua.' }),
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
// Mount route modules
// ============================================================

// Auth routes
const authRouter = createAuthRouter({
  sessions,
  getSession,
  setSessionCookie,
  SESSION_COOKIE,
  IS_PROD,
  loginLimiter,
})
app.use('/api/auth', authRouter)

// Scoring routes
const scoringRouter = createScoringRouter({
  requireAuth,
  graphqlWithRefresh,
  IS_PROD,
})
app.use('/api', scoringRouter)

// Management routes
const managementRouter = createManagementRouter({
  requireAuth,
  graphqlWithRefresh,
  IS_PROD,
})
app.use('/api/manage', managementRouter)

// Registration routes
const registrationRouter = createRegistrationRouter({
  captchaChallenges,
  CAPTCHA_TTL,
  captchaLimiter,
  registerBodyLimit,
  registerReadLimiter,
  registerLimiter,
  getAdminSession,
  adminGraphQL,
  IS_PROD,
})
app.use('/api/register', registrationRouter)

// Reports routes
const reportsRouter = createReportsRouter({
  requireAuth,
  graphqlWithRefresh,
  IS_PROD,
})
app.use('/api/report', reportsRouter)

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
// Start server (only when run directly, not when imported for tests)
// ============================================================
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
  || process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
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
    console.log('  POST /api/register/verify-captcha  { captchaId, captchaAnswer }')
    console.log('  GET  /api/register/cups')
    console.log('  GET  /api/register/cup/:id')
    console.log('  POST /api/register/submit     { cupId, squadNumber, email, captchaId, captchaAnswer }')
    console.log('  GET  /api/manage/cup/:id')
    console.log('  POST /api/manage/cup/:id/assign-squad  { shooterName, squadNumber }')
    console.log('  POST /api/manage/cup/:id/fix-squad     { shooterName, targetSquad }')
    console.log('  POST /api/manage/cup/:id/add-to-cup    { shooterName }')
    console.log('  GET  /api/matches?search=')
    console.log('  POST /api/report/summary       { matches }')
    console.log('  POST /api/report/matches       { matchIds }')
    if (existsSync(indexPath)) {
      console.log(`  UI served from ${uiDist}`)
    }
  })
}

// Export for testing
export { app, captchaChallenges, CAPTCHA_TTL }
