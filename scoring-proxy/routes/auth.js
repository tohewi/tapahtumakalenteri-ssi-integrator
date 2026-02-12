import express from 'express'
import crypto from 'node:crypto'
import { ssiGraphQL, ssiLogin } from '../lib/ssi-client.js'
import { isAdminEmail } from '../lib/staffing/config-loader.js'

export function createAuthRouter({ sessions, getSession, setSessionCookie, SESSION_COOKIE, SESSION_TTL, IS_PROD, loginLimiter }) {
  const router = express.Router()
  // ============================================================
  // POST /api/auth/login — Login to SSI (both JWT + session)
  // ============================================================
  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password, apiKey, scope } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' })
    }

    // Validate scope - must be one of: scoring, manage, reporting, staffing
    const validScopes = ['scoring', 'manage', 'reporting', 'staffing']
    const sessionScope = scope && validScopes.includes(scope) ? scope : 'scoring'

    // Staffing scope: cross-check email against instructor allowlist
    if (sessionScope === 'staffing' && !isAdminEmail(email)) {
      return res.status(403).json({ error: 'Not authorized. You are not on the instructor list.' })
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

      // 3. Create a proxy session with scope
      const sessionId = crypto.randomUUID()
      const now = Date.now()
      sessions.set(sessionId, {
        jwt,
        refreshToken,
        apiKey: apiKey || null,
        ssiCookies,
        scope: sessionScope,
        createdAt: now,
        lastUsed: now,
      })

      setSessionCookie(res, sessionId)

      if (!IS_PROD) {
        console.log(`[session] New ${sessionScope} session created. Active: ${sessions.size}`)
      }

      res.json({
        success: true,
        hasJwt: true,
        hasSession: !!ssiCookies,
        scope: sessionScope,
      })
    } catch (err) {
      console.error('Login failed:', err)
      res.status(401).json({ error: 'Login failed' })
    }
  })

  // ============================================================
  // GET /api/auth/status — Check auth status
  // ============================================================
  router.get('/status', (req, res) => {
    const session = getSession(req)
    if (session) {
      const now = Date.now()
      const remainingMs = SESSION_TTL - (now - session.lastUsed)
      res.json({
        authenticated: true,
        hasJwt: !!session.jwt,
        hasSession: !!session.ssiCookies,
        remainingMs: Math.max(0, remainingMs),
      })
    } else {
      res.json({
        authenticated: false,
        hasJwt: false,
        hasSession: false,
        remainingMs: 0,
      })
    }
  })

  // ============================================================
  // POST /api/auth/logout — Destroy session
  // ============================================================
  router.post('/logout', (req, res) => {
    const id = req.cookies?.[SESSION_COOKIE]
    if (id) sessions.delete(id)
    res.clearCookie(SESSION_COOKIE, { path: '/api' })
    res.json({ success: true })
  })

  return router
}
