// ============================================================
// V7 Session Compatibility Layer
//
// Maps V7 dual-session structure to the legacy flat format
// so existing routes (scoring, management, staffing, reports)
// work without modification.
//
// Legacy routes expect: req.ssiSession.jwt, .refreshToken, .ssiCookies, .apiKey
// V7 sessions have:     req.ssiSession.userSSI.jwt, .adminSSI.jwt, etc.
//
// This module provides:
//   - toLegacySession(): maps V7 → legacy format
//   - graphqlWithRefreshV7(): drop-in replacement for graphqlWithRefresh
// ============================================================

import { ssiGraphQL, ssiRefreshJWT } from '../ssi-client.js'
import { touchSession } from './store.js'
import { auditSSIOperation, auditTokenRefresh } from './audit.js'

// Convert a V7 session to the flat legacy format that existing routes expect.
// The returned object acts as a view — mutations to jwt/refreshToken are
// written back to the V7 session's userSSI so token refresh persists.
export function toLegacySession(v7Session) {
  if (!v7Session?.userSSI) return null

  // Create a proxy-like object that maps legacy field accesses to V7 fields
  const legacy = {
    // Direct mappings for read
    get jwt() { return v7Session.userSSI.jwt },
    set jwt(val) { v7Session.userSSI.jwt = val },
    get refreshToken() { return v7Session.userSSI.refreshToken },
    set refreshToken(val) { v7Session.userSSI.refreshToken = val },
    get ssiCookies() { return v7Session.userSSI.cookies },
    get apiKey() { return v7Session.userSSI.apiKey },
    get scope() { return v7Session.scope },
    get createdAt() { return v7Session.createdAt },
    get lastUsed() { return v7Session.lastUsed },

    // V7-specific (available to routes that are V7-aware)
    get _v7() { return true },
    get _userSSI() { return v7Session.userSSI },
    get _adminSSI() { return v7Session.adminSSI },
    get _userId() { return v7Session.userId },
  }

  return legacy
}

// Drop-in replacement for graphqlWithRefresh that works with V7 sessions.
// Uses the user's JWT (same as legacy) but adds audit logging and
// properly refreshes tokens back into the V7 session store.
export function graphqlWithRefreshV7(sessionId) {
  return async function (session, query, variables = {}) {
    const user = session._userId || 'unknown'
    const startTime = Date.now()

    try {
      const result = await ssiGraphQL(session.jwt, query, variables)
      return result
    } catch (err) {
      // Token refresh on auth failure (same logic as legacy)
      if (session.refreshToken && (
        err.message.includes('Signature') ||
        err.message.includes('expired') ||
        err.message.includes('401')
      )) {
        try {
          const newTokens = await ssiRefreshJWT(session.refreshToken)
          session.jwt = newTokens.token
          session.refreshToken = newTokens.refreshToken

          // Persist refreshed tokens to session store
          if (sessionId) {
            await touchSession(sessionId, {
              userSSI: {
                jwt: newTokens.token,
                refreshToken: newTokens.refreshToken,
                expiresAt: Date.now() + 15 * 60 * 1000,
                lastRefreshed: Date.now(),
              },
            }).catch(() => {}) // best-effort persistence
          }

          auditTokenRefresh(user, 'user_ssi', true)
          return await ssiGraphQL(session.jwt, query, variables)
        } catch (refreshErr) {
          auditTokenRefresh(user, 'user_ssi', false, refreshErr.message)
          throw new Error('Session expired. Please login again.')
        }
      }
      throw err
    }
  }
}
