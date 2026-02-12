// ============================================================
// V7.0 Authentication Middleware
//
// Dual-session middleware that validates user SSI tokens,
// manages automatic token refresh, and provides impersonation
// context to downstream route handlers.
//
// Uses the V7.0 session store (Redis or in-memory fallback).
// ============================================================

import {
  getSession,
  touchSession,
  isUserTokenValid,
  userTokenNeedsRefresh,
  adminTokenNeedsRefresh,
  getImpersonationContext,
  sessionConfig,
  auditSecurityViolation,
  toLegacySession,
} from '../lib/session/index.js'

const SESSION_COOKIE = sessionConfig.session.cookieName

// ---- Main auth middleware ----

// Require authenticated session with valid user SSI token.
// Sets req.ssiSession and req.impersonation for downstream use.
export function requireAuthV7(allowedScopes = null) {
  return async (req, res, next) => {
    const sessionId = req.cookies?.[SESSION_COOKIE]
    if (!sessionId) {
      return res.status(401).json({
        error: 'Authentication required.',
        sessionExpired: true,
      })
    }

    try {
      // Retrieve session from store
      const session = await getSession(sessionId)
      if (!session) {
        return res.status(401).json({
          error: 'Session expired. Please login again.',
          sessionExpired: true,
        })
      }

      // Validate user SSI token — this is the core security gate
      if (!isUserTokenValid(session)) {
        return res.status(401).json({
          error: 'SSI token expired. Please login again.',
          sessionExpired: true,
        })
      }

      // Check scope if specified
      if (allowedScopes) {
        const scopes = Array.isArray(allowedScopes) ? allowedScopes : [allowedScopes]
        if (!scopes.includes(session.scope)) {
          return res.status(403).json({
            error: 'Access denied. Please login to this feature.',
            scopeMismatch: true,
            requiredScope: scopes,
            currentScope: session.scope,
          })
        }
      }

      // Build token updates if refresh is needed
      const tokenUpdates = {}
      if (userTokenNeedsRefresh(session) && req._ssiRefreshUserToken) {
        try {
          const refreshed = await req._ssiRefreshUserToken(session.userSSI.refreshToken)
          tokenUpdates.userSSI = {
            jwt: refreshed.token,
            refreshToken: refreshed.refreshToken,
            expiresAt: Date.now() + 15 * 60 * 1000,
            lastRefreshed: Date.now(),
          }
        } catch {
          // Token refresh failed — let it expire naturally
          console.warn('[auth-v7] User SSI token refresh failed')
        }
      }

      if (adminTokenNeedsRefresh(session) && req._ssiRefreshAdminToken) {
        try {
          const refreshed = await req._ssiRefreshAdminToken(session.adminSSI.refreshToken)
          tokenUpdates.adminSSI = {
            jwt: refreshed.token,
            refreshToken: refreshed.refreshToken,
            expiresAt: Date.now() + 4 * 60 * 60 * 1000,
            lastRefreshed: Date.now(),
          }
        } catch {
          console.warn('[auth-v7] Admin SSI token refresh failed')
        }
      }

      // Touch session (renew TTL + apply token updates)
      const updatedSession = await touchSession(sessionId, tokenUpdates)

      // Slide cookie forward
      const ttl = sessionConfig.scopeTTL[session.scope] || sessionConfig.session.ttl
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: sessionConfig.session.sameSite,
        secure: sessionConfig.session.secure,
        path: sessionConfig.session.cookiePath,
        maxAge: ttl,
      })

      // Attach session and impersonation context to request
      const finalSession = updatedSession || session
      req._v7Session = finalSession
      req._v7SessionId = sessionId
      // Legacy-compatible view so existing routes work without changes
      req.ssiSession = toLegacySession(finalSession)
      req.ssiSession._v7SessionId = sessionId
      // Impersonation context is optional — null when adminSSI isn't available.
      // Routes that need admin access get it separately via getAdminSession().
      req.impersonation = getImpersonationContext(finalSession)

      next()
    } catch (err) {
      console.error('[auth-v7] Middleware error:', err.message)
      res.status(500).json({ error: 'Authentication error' })
    }
  }
}

// ---- Scope validation middleware ----

export function requireScopeV7(requiredScope) {
  return (req, res, next) => {
    if (!req.ssiSession) {
      return res.status(401).json({ error: 'Authentication required.' })
    }
    const scopes = Array.isArray(requiredScope) ? requiredScope : [requiredScope]
    if (!scopes.includes(req.ssiSession.scope)) {
      return res.status(403).json({
        error: 'Access denied. Please login to this feature.',
        scopeMismatch: true,
      })
    }
    next()
  }
}
