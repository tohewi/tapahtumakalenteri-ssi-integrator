import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { ssiGraphQL, ssiLogin, ssiRefreshJWT } from './lib/ssi-client.js'
import { log } from './lib/logger.js'
import { createScoringRouter } from './routes/scoring.js'
import { createRegistrationRouter } from './routes/registration.js'
import { createReportsRouter } from './routes/reports.js'
import { createManagementRouter } from './routes/management.js'
import { createStaffingRouter } from './routes/staffing.js'
import { initRedis, getActiveSessionCount, isUsingRedis, touchSession } from './lib/session/index.js'
import { requireAuthV7 } from './middleware/auth-v7.js'
import { createAuthV7Router } from './routes/auth-v7.js'

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
// Session store: V7 dual-session (Redis or in-memory fallback)
// Sessions are managed by lib/session/store.js via initRedis()
// Legacy session Map removed — all state in Redis/memory store
// ============================================================

// Auth middleware — used by all protected routes
const requireAuth = requireAuthV7

// Execute GraphQL with automatic JWT refresh on auth failure.
// Works with the legacy-compatible session view from toLegacySession:
// session.jwt and session.refreshToken are write-through getters/setters.
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
        // Persist refreshed tokens back to V7 session store
        if (session._v7SessionId) {
          await touchSession(session._v7SessionId, {
            userSSI: {
              jwt: newTokens.token,
              refreshToken: newTokens.refreshToken,
              expiresAt: Date.now() + 15 * 60 * 1000,
              lastRefreshed: Date.now(),
            },
          }).catch(() => {}) // best-effort persistence
        }
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
app.get('/api/health', async (req, res) => {
  let activeSessions = 0
  try { activeSessions = await getActiveSessionCount() } catch { /* ignore */ }
  res.json({
    status: 'ok',
    activeSessions,
    sessionBackend: isUsingRedis() ? 'redis' : 'memory',
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
let adminCookieTime = 0
let adminJwtTime = 0
const ADMIN_COOKIE_TTL = 4 * 60 * 60 * 1000 // 4 hours — SSI web cookies
const ADMIN_JWT_TTL = 14 * 60 * 1000         // 14 min — SSI JWTs expire ~15 min

async function getAdminSession() {
  const email = process.env.SSI_ADMIN_EMAIL
  const password = process.env.SSI_ADMIN_PASSWORD
  const apiKey = process.env.SSI_ADMIN_API_KEY || null
  if (!email || !password) {
    throw new Error('Registration not configured: SSI_ADMIN_EMAIL and SSI_ADMIN_PASSWORD required')
  }

  const now = Date.now()

  // Full re-login if cookies expired
  if (!adminCookies || (now - adminCookieTime) >= ADMIN_COOKIE_TTL) {
    log.debug('[admin] Full login (cookies expired or first init)...')
    adminCookies = await ssiLogin(email, password)
    adminCookieTime = now

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
    adminJwtTime = now

    log.debug('[admin] Session ready (fresh login)')
    return { cookies: adminCookies, jwt: adminJwt, refreshToken: adminRefreshToken }
  }

  // Proactively refresh JWT if near expiry (cookies still valid)
  if (!adminJwt || (now - adminJwtTime) >= ADMIN_JWT_TTL) {
    log.debug('[admin] Refreshing JWT (expired after ~14 min)...')
    try {
      if (adminRefreshToken) {
        const newTokens = await ssiRefreshJWT(adminRefreshToken)
        adminJwt = newTokens.token
        adminRefreshToken = newTokens.refreshToken
        adminJwtTime = now
        log.debug('[admin] JWT refreshed via refresh token')
      } else {
        // No refresh token — full re-auth for JWT
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
        adminJwtTime = now
        log.debug('[admin] JWT refreshed via re-auth')
      }
    } catch (err) {
      console.error('[admin] JWT refresh failed, doing full re-login:', err.message)
      // Full re-login as fallback
      adminCookies = await ssiLogin(email, password)
      adminCookieTime = now
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
      adminJwtTime = now
    }
  }

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
// Mount route modules
// ============================================================

// Auth routes (V7 — Redis/memory backed dual sessions)
const authRouter = createAuthV7Router({ loginLimiter, getAdminSession })
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
  adminGraphQL,
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

// Staffing routes
const staffingRouter = createStaffingRouter({
  requireAuth,
  graphqlWithRefresh,
  getAdminSession,
})
app.use('/api/staffing', staffingRouter)

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
  // Initialize session store before accepting requests (Redis or in-memory fallback)
  await initRedis()

  app.listen(PORT, () => {
    console.log(`Scoring proxy running on http://localhost:${PORT}`)
    console.log(`Mode: ${IS_PROD ? 'production' : 'development'}`)
    console.log(`Session backend: ${isUsingRedis() ? 'redis' : 'memory'}`)
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
