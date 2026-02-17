// ============================================================
// V7.0 Auth Routes — Dual-Session Login/Logout/Status
//
// Creates sessions with both user SSI tokens and admin SSI
// delegation. Uses the V7 session store (Redis or in-memory).
// ============================================================

import express from 'express'
import { ssiGraphQL, ssiLogin } from '../lib/ssi-client.js'
import { log } from '../lib/logger.js'
import { isAdminEmail } from '../lib/staffing/config-loader.js'
import {
  createSession,
  getSession,
  deleteSession,
  getActiveSessionCount,
  sessionConfig,
  auditLogin,
  auditLogout,
} from '../lib/session/index.js'

const SESSION_COOKIE = sessionConfig.session.cookieName

// SSI GraphQL auth mutation
const AUTH_MUTATION = `
  mutation Auth($email: String!, $password: String!) {
    token_auth(email: $email, password: $password) {
      token { token }
      refresh_token { token }
    }
  }
`

export function createAuthV7Router({ loginLimiter, getAdminSession, requireAuth, graphqlWithRefresh }) {
  const router = express.Router()

  // ============================================================
  // POST /api/auth/login — V7 Login (dual session)
  // ============================================================
  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password, apiKey, scope } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' })
    }

    // Validate scope
    const validScopes = ['scoring', 'manage', 'reporting', 'staffing']
    const sessionScope = scope && validScopes.includes(scope) ? scope : 'scoring'

    // Staffing scope: cross-check email against instructor allowlist
    if (sessionScope === 'staffing' && !isAdminEmail(email)) {
      auditLogin(email, req.ip, false, 'Not on instructor list')
      return res.status(403).json({ error: 'Not authorized. You are not on the instructor list.' })
    }

    try {
      // 1. Authenticate user — get user's own SSI tokens
      const authResult = await ssiGraphQL(null, AUTH_MUTATION, { email, password }, apiKey)

      if (!authResult.token_auth?.token?.token) {
        auditLogin(email, req.ip, false, 'Invalid credentials')
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const userJwt = authResult.token_auth.token.token
      const userRefreshToken = authResult.token_auth.refresh_token.token

      // 2. Get user's web session cookies
      const userCookies = await ssiLogin(email, password)

      // 3. Get admin SSI delegation for impersonation
      let adminSSI = null
      try {
        const admin = await getAdminSession()
        adminSSI = {
          jwt: admin.jwt,
          refreshToken: admin.refreshToken,
          cookies: admin.cookies,
          expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
        }
      } catch (err) {
        // Admin session optional for some scopes — log but don't fail
        log.debug('[auth-v7] Admin session not available:', err.message)
      }

      // 4. Create V7 dual session
      const { sessionId } = await createSession({
        userId: email,
        userSSI: {
          jwt: userJwt,
          refreshToken: userRefreshToken,
          cookies: userCookies,
          apiKey: apiKey || null,
          expiresAt: Date.now() + 15 * 60 * 1000, // SSI JWT ~15 min
        },
        adminSSI,
        scope: sessionScope,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
        },
      })

      // 5. Set session cookie
      const ttl = sessionConfig.scopeTTL[sessionScope] || sessionConfig.session.ttl
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: sessionConfig.session.sameSite,
        secure: sessionConfig.session.secure,
        path: sessionConfig.session.cookiePath,
        maxAge: ttl,
      })

      auditLogin(email, req.ip, true)

      if (log.isEnabled('debug')) {
        const count = await getActiveSessionCount()
        log.debug(`[auth-v7] New ${sessionScope} session created. Active: ${count}`)
      }

      res.json({
        success: true,
        hasJwt: true,
        hasSession: !!userCookies,
        hasAdminDelegation: !!adminSSI,
        scope: sessionScope,
      })
    } catch (err) {
      auditLogin(email, req.ip, false, err.message)
      console.error('[auth-v7] Login failed:', err.message)
      res.status(401).json({ error: 'Login failed' })
    }
  })

  // ============================================================
  // GET /api/auth/status — V7 Session status
  // ============================================================
  router.get('/status', async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE]
    if (!sessionId) {
      return res.json({
        authenticated: false,
        hasJwt: false,
        hasSession: false,
        remainingMs: 0,
      })
    }

    const session = await getSession(sessionId)
    if (!session) {
      return res.json({
        authenticated: false,
        hasJwt: false,
        hasSession: false,
        remainingMs: 0,
      })
    }

    const ttl = sessionConfig.scopeTTL[session.scope] || sessionConfig.session.ttl
    const elapsed = Date.now() - session.lastUsed
    const remainingMs = Math.max(0, ttl - elapsed)

    res.json({
      authenticated: true,
      hasJwt: !!session.userSSI?.jwt,
      hasSession: !!session.userSSI?.cookies,
      hasAdminDelegation: !!session.adminSSI?.jwt,
      scope: session.scope,
      remainingMs,
    })
  })

  // ============================================================
  // POST /api/auth/logout — V7 Destroy session
  // ============================================================
  router.post('/logout', async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE]
    if (sessionId) {
      const session = await getSession(sessionId)
      const userId = session?.userId || 'unknown'
      await deleteSession(sessionId)
      auditLogout(userId, req.ip)
    }
    res.clearCookie(SESSION_COOKIE, { path: sessionConfig.session.cookiePath })
    res.json({ success: true })
  })

  // ============================================================
  // GET /api/auth/me — Get current user info from SSI
  // ============================================================
  router.get('/me', requireAuth, async (req, res) => {
    try {
      const meData = await graphqlWithRefresh(req.ssiSession, '{ me { email first_name last_name } }')
      const me = meData.me
      console.log('[auth-v7] /me: SSI returned:', { 
        email: me?.email, 
        first_name: me?.first_name, 
        last_name: me?.last_name 
      })
      if (!me?.email) {
        console.warn('[auth-v7] /me: No email in response')
        return res.status(401).json({ error: 'Could not get user info' })
      }
      const responseData = {
        email: me.email,
        firstName: me.first_name || '',
        lastName: me.last_name || '',
      }
      console.log('[auth-v7] /me: Sending response:', responseData)
      res.json(responseData)
    } catch (err) {
      console.error('[auth-v7] /me error:', err)
      res.status(500).json({ error: 'Failed to fetch user info' })
    }
  })

  return router
}
