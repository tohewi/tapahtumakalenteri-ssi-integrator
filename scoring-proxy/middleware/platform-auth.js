// ============================================================
// Platform Auth Middleware
//
// Authenticates platform account sessions (separate from SSI auth).
// Platform accounts sign up with email+password and get their own
// session cookie distinct from the SSI scoring sessions.
// ============================================================

import { getPlatformSession, getAccount } from '../lib/db/platform-store.js'
import { log } from '../lib/logger.js'
import { AppError } from '../lib/errors/AppError.js'

const PLATFORM_COOKIE = 'platform_sid'

/**
 * Middleware that requires a valid platform account session.
 * Sets req.account (account profile) and req.platformSessionId.
 */
export function requirePlatformAuth() {
  return async (req, res, next) => {
    const sessionId = req.cookies?.[PLATFORM_COOKIE]
    if (!sessionId) {
      const err = new AppError('Platform authentication required.', 401, 'UNAUTHORIZED')
      err.platformSessionExpired = true
      return next(err)
    }

    try {
      const session = await getPlatformSession(sessionId)
      if (!session) {
        const err = new AppError('Platform session expired. Please sign in again.', 401, 'SESSION_EXPIRED')
        err.platformSessionExpired = true
        return next(err)
      }

      // Block MFA-pending sessions from accessing protected routes
      if (session.mfaPending) {
        const err = new AppError('MFA verification required. Please complete the MFA challenge.', 401, 'MFA_REQUIRED')
        err.mfaRequired = true
        return next(err)
      }

      const account = await getAccount(session.accountId)
      if (!account) {
        const err = new AppError('Account not found.', 401, 'ACCOUNT_NOT_FOUND')
        err.platformSessionExpired = true
        return next(err)
      }

      req.account = account
      req.platformSessionId = sessionId
      next()
    } catch (err) {
      log.error('[platform-auth] Middleware error:', err.message)
      return next(new AppError('Authentication error', 500, 'INTERNAL_ERROR'))
    }
  }
}

export { PLATFORM_COOKIE }
