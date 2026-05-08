// ============================================================
// V7.0 Auth Routes — Dual-Session Login/Logout/Status
//
// Creates sessions with both user SSI tokens and admin SSI
// delegation. Uses the V7 session store (Redis or in-memory).
// ============================================================

import express from 'express'
import { ssiGraphQL, ssiLogin } from '../lib/ssi-core/graphql.js'
import { log } from '../lib/logger.js'
import { isAdminEmail } from '../lib/staffing/config-loader.js'
import { AppError } from '../lib/errors/AppError.js'
import { createDeviceToken, validateDeviceToken, listDeviceTokens, revokeDeviceToken } from '../lib/device-tokens.js'
import {
  createSession,
  getSession,
  deleteSession,
  getActiveSessionCount,
  sessionConfig,
  auditLogin,
  auditLogout,
} from '../lib/session/index.js'

const UPSTREAM_UNAVAILABLE_CODE = 'UPSTREAM_UNAVAILABLE'
const UPSTREAM_UNAVAILABLE_MESSAGE = 'SSI service temporarily unavailable. Please retry.'

function isUpstreamUnavailableError(err) {
  if (!err) return false
  if (err.code === UPSTREAM_UNAVAILABLE_CODE || err.isUpstreamTransient === true) return true

  const message = String(err.message || '')
  return (
    /GraphQL HTTP (502|503|504):/i.test(message)
    || message.toLowerCase().includes('fetch failed')
  )
}

function internalError(message) {
  return new AppError(message, 500, 'INTERNAL_ERROR')
}

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
      if (isUpstreamUnavailableError(err)) {
        auditLogin(email, req.ip, false, UPSTREAM_UNAVAILABLE_CODE)
        log.warn('[auth-v7] Login failed due upstream availability issue:', {
          error: err.message,
          upstreamStatus: err.upstreamStatus,
          attempts: err.attempts,
        })
        return res.status(503).json({
          error: UPSTREAM_UNAVAILABLE_MESSAGE,
          code: UPSTREAM_UNAVAILABLE_CODE,
        })
      }

      auditLogin(email, req.ip, false, err.message)
      log.error('[auth-v7] Login failed:', err.message)
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
  // No scope restriction — all authenticated users can fetch their own info
  // ============================================================
  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const meData = await graphqlWithRefresh(req.ssiSession, '{ me { email first_name last_name } }')
      const me = meData.me
      if (!me?.email) {
        return res.status(401).json({ error: 'Could not get user info' })
      }
      const responseData = {
        email: me.email,
        firstName: me.first_name || '',
        lastName: me.last_name || '',
      }
      res.json(responseData)
    } catch (err) {
      log.error('[auth-v7] /me error:', err.message)
      return next(internalError('Failed to fetch user info'))
    }
  })

  // ============================================================
  // Device Token Routes (R7.7 — QR Code Login)
  // ============================================================

  // POST /api/auth/device-tokens — Create a device token (requires manage scope)
  router.post('/device-tokens', requireAuth, async (req, res) => {
    // Only allow manage-scope sessions to create tokens
    if (req.ssiSession?.scope !== 'manage') {
      return res.status(403).json({ error: 'Manage session required to create device tokens' })
    }

    const { ssiEmail, ssiPassword, label, expiresInDays } = req.body
    if (!ssiEmail || !ssiPassword) {
      return res.status(400).json({ error: 'ssiEmail and ssiPassword are required' })
    }
    if (!label || label.trim().length < 1) {
      return res.status(400).json({ error: 'Device label is required' })
    }

    try {
      const { tokenId, token } = await createDeviceToken({
        ssiEmail: ssiEmail.trim(),
        ssiPassword,
        label: label.trim(),
        createdBy: req.ssiSession?.userId || 'unknown',
        expiresInDays: expiresInDays || 5,
      })
      res.status(201).json({ success: true, tokenId, token })
    } catch (err) {
      log.error('[auth-v7] Failed to create device token:', err.message)
      res.status(500).json({ error: 'Failed to create device token' })
    }
  })

  // GET /api/auth/device-tokens — List device tokens (requires manage scope)
  router.get('/device-tokens', requireAuth, async (req, res) => {
    if (req.ssiSession?.scope !== 'manage') {
      return res.status(403).json({ error: 'Manage session required' })
    }
    try {
      const tokens = await listDeviceTokens()
      res.json({ tokens })
    } catch (err) {
      log.error('[auth-v7] Failed to list device tokens:', err.message)
      res.status(500).json({ error: 'Failed to list device tokens' })
    }
  })

  // DELETE /api/auth/device-tokens/:id — Revoke a device token (requires manage scope)
  router.delete('/device-tokens/:id', requireAuth, async (req, res) => {
    if (req.ssiSession?.scope !== 'manage') {
      return res.status(403).json({ error: 'Manage session required' })
    }
    try {
      const deleted = await revokeDeviceToken(req.params.id)
      if (!deleted) return res.status(404).json({ error: 'Token not found' })
      res.json({ success: true })
    } catch (err) {
      log.error('[auth-v7] Failed to revoke device token:', err.message)
      res.status(500).json({ error: 'Failed to revoke device token' })
    }
  })

  // POST /api/auth/token-login — Login with a device token (QR code)
  // No session required — the token IS the credential
  router.post('/token-login', loginLimiter, async (req, res) => {
    const { token } = req.body
    if (!token) {
      return res.status(400).json({ error: 'Token is required' })
    }

    try {
      const validated = await validateDeviceToken(token)
      if (!validated) {
        log.warn(`[auth-v7] Invalid/expired device token attempt from ${req.ip}`)
        return res.status(401).json({ error: 'Invalid or expired device token' })
      }

      // Authenticate with SSI using decrypted credentials (same as password login)
      const authResult = await ssiGraphQL(null, AUTH_MUTATION, {
        email: validated.ssiEmail,
        password: validated.ssiPassword,
      })

      if (!authResult.token_auth?.token?.token) {
        log.error(`[auth-v7] Device token SSI auth failed for ${validated.ssiEmail}`)
        return res.status(401).json({ error: 'SSI authentication failed — credentials may have changed' })
      }

      const userJwt = authResult.token_auth.token.token
      const userRefreshToken = authResult.token_auth.refresh_token.token

      // Get web session cookies
      const userCookies = await ssiLogin(validated.ssiEmail, validated.ssiPassword)

      // Get admin SSI delegation
      let adminSSI = null
      try {
        const admin = await getAdminSession()
        adminSSI = {
          jwt: admin.jwt,
          refreshToken: admin.refreshToken,
          cookies: admin.cookies,
          expiresAt: Date.now() + 4 * 60 * 60 * 1000,
        }
      } catch (err) {
        log.debug('[auth-v7] Admin session not available for token login:', err.message)
      }

      // Create scoring session
      const { sessionId } = await createSession({
        userId: validated.ssiEmail,
        userSSI: {
          jwt: userJwt,
          refreshToken: userRefreshToken,
          cookies: userCookies,
          expiresAt: Date.now() + 15 * 60 * 1000,
        },
        adminSSI,
        scope: 'scoring',
        metadata: {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
          loginMethod: 'device_token',
          deviceLabel: validated.label,
        },
      })

      const ttl = sessionConfig.scopeTTL['scoring'] || sessionConfig.session.ttl
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: sessionConfig.session.sameSite,
        secure: sessionConfig.session.secure,
        path: sessionConfig.session.cookiePath,
        maxAge: ttl,
      })

      auditLogin(validated.ssiEmail, req.ip, true, `device_token:${validated.label}`)
      log.info(`[auth-v7] QR login: ${validated.ssiEmail} (${validated.label}) from ${req.ip}`)

      res.json({
        success: true,
        scope: 'scoring',
        label: validated.label,
      })
    } catch (err) {
      if (isUpstreamUnavailableError(err)) {
        log.warn('[auth-v7] Token login failed due upstream availability issue:', {
          error: err.message,
          upstreamStatus: err.upstreamStatus,
          attempts: err.attempts,
        })
        return res.status(503).json({
          error: UPSTREAM_UNAVAILABLE_MESSAGE,
          code: UPSTREAM_UNAVAILABLE_CODE,
        })
      }

      log.error('[auth-v7] Token login failed:', err.message)
      // Distinguish auth failures from internal errors
      const status = err.message?.includes('credentials') || err.message?.includes('auth') ? 401 : 500
      res.status(status).json({ error: status === 401 ? 'Token login failed' : 'Internal error during token login' })
    }
  })

  return router
}
