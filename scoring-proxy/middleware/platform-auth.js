// ============================================================
// Platform Auth Middleware
//
// Authenticates platform account sessions (separate from SSI auth).
// Platform accounts sign up with email+password and get their own
// session cookie distinct from the SSI scoring sessions.
// ============================================================

import { getPlatformSession, getAccount, getTenant, getTenantMembership, hasRequiredRole } from '../lib/db/platform-store.js'
import { log } from '../lib/logger.js'
import { AppError } from '../lib/errors/AppError.js'

const PLATFORM_COOKIE = 'platform_sid'

/** Cookie options for the platform session cookie */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
}

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

/**
 * Middleware factory: verify the caller has an active membership in the tenant
 * and at least one of the required roles. Sets req.tenant and req.membership.
 *
 * Usage:
 *   requireTenantRole('owner')                          // owner only (billing, SSI creds)
 *   requireTenantRole('owner', 'tenant_admin')          // owner or tenant_admin
 *   requireTenantRole(...TENANT_ROLES)                  // any member (read-only)
 *
 * Note: hasRequiredRole() handles implicit escalation:
 *   - owner satisfies ALL roles
 *   - tenant_admin satisfies all except owner-only actions
 */
export function requireTenantRole(...requiredRoles) {
  return async (req, res, next) => {
    const tenantId = req.params.tenantId || req.params.id
    const tenant = await getTenant(tenantId)
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' })

    // Check membership
    const membership = await getTenantMembership(tenantId, req.account.id)

    // Backward compatibility: if no membership exists but account owns the tenant,
    // treat as owner (for tenants created before RBAC migration)
    if (!membership && tenant.accountId === req.account.id) {
      req.tenant = tenant
      req.membership = { roles: ['owner'], id: null, tenantId, accountId: req.account.id }
      return next()
    }

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (!hasRequiredRole(membership.roles, requiredRoles)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' })
    }

    req.tenant = tenant
    req.membership = membership
    next()
  }
}
