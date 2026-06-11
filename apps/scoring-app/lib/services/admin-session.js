// ============================================================
// Admin Session Singleton — SSI admin credential management
//
// Extracted from server.js to make the admin session lifecycle
// independently testable and importable by any route that needs
// admin-level SSI access (registration, staffing, management).
//
// Manages two independent TTL windows:
//   - Web cookies (4 h) — obtained via ssiLogin (form POST)
//   - JWT (14 min)      — obtained via GraphQL token_auth mutation
//
// Usage:
//   import { getAdminSession, adminGraphQL } from '../lib/services/admin-session.js'
//   const sess = await getAdminSession()          // { cookies, jwt, refreshToken }
//   const data = await adminGraphQL(query, vars)  // JWT-authed GraphQL call
// ============================================================

import { ssiGraphQL, ssiLogin, ssiRefreshJWT } from '../ssi-core/graphql.js'
import { log } from '../logger.js'

const ADMIN_COOKIE_TTL = 4 * 60 * 60 * 1000  // 4 hours — SSI web cookie lifetime
const ADMIN_JWT_TTL    = 14 * 60 * 1000       // 14 min  — SSI JWTs expire ~15 min

// Module-level singleton state
let adminCookies      = null
let adminJwt          = null
let adminRefreshToken = null
let adminCookieTime   = 0
let adminJwtTime      = 0

/**
 * Return a live admin session, refreshing credentials as needed.
 * Throws if required environment variables are missing.
 *
 * @returns {{ cookies: object, jwt: string, refreshToken: string }}
 */
export async function getAdminSession() {
  const email  = process.env.SSI_ADMIN_EMAIL
  const password = process.env.SSI_ADMIN_PASSWORD
  const apiKey = (process.env.SSI_ADMIN_API_KEY || '').trim() || null

  if (!email || !password) {
    throw new Error('Admin session not configured: SSI_ADMIN_EMAIL and SSI_ADMIN_PASSWORD required')
  }
  if (!apiKey) {
    throw new Error('Admin session not configured: SSI_ADMIN_API_KEY required')
  }

  const now = Date.now()

  // Full re-login if cookies expired or this is the first call
  if (!adminCookies || (now - adminCookieTime) >= ADMIN_COOKIE_TTL) {
    log.debug('[admin] Full login (cookies expired or first init)...')
    adminCookies = await ssiLogin(email, password)
    adminCookieTime = now

    const authResult = await ssiGraphQL(null, AUTH_MUTATION, { email, password }, apiKey)
    adminJwt = authResult.token_auth?.token?.token || null
    adminRefreshToken = authResult.token_auth?.refresh_token?.token || null
    adminJwtTime = now

    log.debug('[admin] Session ready (fresh login)')
    return { cookies: adminCookies, jwt: adminJwt, refreshToken: adminRefreshToken }
  }

  // Proactively refresh JWT if near expiry (web cookies still valid)
  if (!adminJwt || (now - adminJwtTime) >= ADMIN_JWT_TTL) {
    log.debug('[admin] Refreshing JWT (expired after ~14 min)...')
    try {
      if (adminRefreshToken) {
        const newTokens = await ssiRefreshJWT(adminRefreshToken, apiKey)
        adminJwt = newTokens.token
        adminRefreshToken = newTokens.refreshToken
        adminJwtTime = now
        log.debug('[admin] JWT refreshed via refresh token')
      } else {
        // No refresh token — full re-auth for JWT only (cookies are still valid)
        const authResult = await ssiGraphQL(null, AUTH_MUTATION, { email, password }, apiKey)
        adminJwt = authResult.token_auth?.token?.token || null
        adminRefreshToken = authResult.token_auth?.refresh_token?.token || null
        adminJwtTime = now
        log.debug('[admin] JWT refreshed via re-auth')
      }
    } catch (err) {
      log.error('[admin] JWT refresh failed, doing full re-login:', err.message)
      // Full re-login as fallback
      adminCookies = await ssiLogin(email, password)
      adminCookieTime = now
      const authResult = await ssiGraphQL(null, AUTH_MUTATION, { email, password }, apiKey)
      adminJwt = authResult.token_auth?.token?.token || null
      adminRefreshToken = authResult.token_auth?.refresh_token?.token || null
      adminJwtTime = now
    }
  }

  return { cookies: adminCookies, jwt: adminJwt, refreshToken: adminRefreshToken }
}

/**
 * Execute a GraphQL query using the admin JWT, with automatic token refresh on expiry.
 *
 * @param {string} query - GraphQL query/mutation string
 * @param {object} variables - Query variables
 * @returns {Promise<object>} GraphQL response data
 */
export async function adminGraphQL(query, variables = {}) {
  const apiKey = (process.env.SSI_ADMIN_API_KEY || '').trim()
  const admin = await getAdminSession()
  try {
    return await ssiGraphQL(admin.jwt, query, variables, apiKey)
  } catch (err) {
    if (admin.refreshToken && (err.message.includes('expired') || err.message.includes('Signature'))) {
      const newTokens = await ssiRefreshJWT(admin.refreshToken, apiKey)
      adminJwt = newTokens.token
      adminRefreshToken = newTokens.refreshToken
      return await ssiGraphQL(adminJwt, query, variables, apiKey)
    }
    throw err
  }
}

/**
 * Reset the singleton state — used in tests to clear cached credentials.
 * Not exported for production use.
 */
export function _resetAdminSession() {
  adminCookies = null
  adminJwt = null
  adminRefreshToken = null
  adminCookieTime = 0
  adminJwtTime = 0
}

// ---- Private ----

const AUTH_MUTATION = `
  mutation Auth($email: String!, $password: String!) {
    token_auth(email: $email, password: $password) {
      token { token }
      refresh_token { token }
    }
  }
`
