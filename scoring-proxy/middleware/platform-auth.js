// ============================================================
// Platform Auth Middleware
//
// Authenticates platform account sessions (separate from SSI auth).
// Platform accounts sign up with email+password and get their own
// session cookie distinct from the SSI scoring sessions.
// ============================================================

import { getPlatformSession, getAccount } from '../lib/db/platform-store.js'
import { log } from '../lib/logger.js'

const PLATFORM_COOKIE = 'platform_sid'

/**
 * Middleware that requires a valid platform account session.
 * Sets req.account (account profile) and req.platformSessionId.
 */
export function requirePlatformAuth() {
  return async (req, res, next) => {
    const sessionId = req.cookies?.[PLATFORM_COOKIE]
    if (!sessionId) {
      return res.status(401).json({
        error: 'Platform authentication required.',
        platformSessionExpired: true,
      })
    }

    try {
      const session = await getPlatformSession(sessionId)
      if (!session) {
        return res.status(401).json({
          error: 'Platform session expired. Please sign in again.',
          platformSessionExpired: true,
        })
      }

      const account = await getAccount(session.accountId)
      if (!account) {
        return res.status(401).json({
          error: 'Account not found.',
          platformSessionExpired: true,
        })
      }

      req.account = account
      req.platformSessionId = sessionId
      next()
    } catch (err) {
      log.error('[platform-auth] Middleware error:', err.message)
      res.status(500).json({ error: 'Authentication error' })
    }
  }
}

export { PLATFORM_COOKIE }
