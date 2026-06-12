// ============================================================
// Impersonation Layer — V7.0
//
// Wraps SSI operations so that:
//   1. User context is always validated before admin operations
//   2. Every operation is audit-logged with user identity
//   3. Admin tokens are never accessible without valid user session
//
// Usage in routes:
//   const result = await executeSSI(req.impersonation, 'score_submit', async (adminJwt) => {
//     return await ssiGraphQL(adminJwt, query, variables)
//   })
// ============================================================

import { isUserTokenValid } from './store.js'
import { auditSSIOperation, auditSecurityViolation } from './audit.js'

// Execute an SSI operation using admin token, bound to user context.
// Returns the result of the operation function.
// Throws if user context is invalid or operation fails.
export async function executeSSI(impersonationCtx, operationName, operationFn) {
  const startTime = Date.now()
  const user = impersonationCtx?.user || 'unknown'

  // Guard: validate user context
  if (!impersonationCtx || !impersonationCtx.userSSI) {
    auditSecurityViolation(
      `SSI operation "${operationName}" attempted without user context`,
      null,
      user
    )
    throw new Error('Invalid user context for SSI operation')
  }

  // Guard: validate user token is still valid
  if (!isUserTokenValid({ userSSI: impersonationCtx.userSSI })) {
    auditSecurityViolation(
      `SSI operation "${operationName}" attempted with expired user token`,
      null,
      user
    )
    throw new Error('User SSI token expired — cannot perform SSI operation')
  }

  // Guard: validate admin token exists
  if (!impersonationCtx.adminSSI?.jwt) {
    auditSecurityViolation(
      `SSI operation "${operationName}" attempted without admin token`,
      null,
      user
    )
    throw new Error('Admin SSI token not available')
  }

  try {
    // Execute the operation with admin JWT
    const result = await operationFn(impersonationCtx.adminSSI.jwt)
    const duration = Date.now() - startTime

    auditSSIOperation(user, operationName, true, duration)
    return result
  } catch (err) {
    const duration = Date.now() - startTime
    auditSSIOperation(user, operationName, false, duration, err.message)
    throw err
  }
}

// Execute an SSI operation using the user's own JWT (not admin).
// Used for operations that should run as the user (e.g. reading their own data).
export async function executeSSIAsUser(impersonationCtx, operationName, operationFn) {
  const startTime = Date.now()
  const user = impersonationCtx?.user || 'unknown'

  if (!impersonationCtx || !impersonationCtx.userSSI?.jwt) {
    auditSecurityViolation(
      `User SSI operation "${operationName}" attempted without user context`,
      null,
      user
    )
    throw new Error('Invalid user context for SSI operation')
  }

  if (!isUserTokenValid({ userSSI: impersonationCtx.userSSI })) {
    throw new Error('User SSI token expired')
  }

  try {
    const result = await operationFn(impersonationCtx.userSSI.jwt)
    const duration = Date.now() - startTime
    auditSSIOperation(user, operationName, true, duration)
    return result
  } catch (err) {
    const duration = Date.now() - startTime
    auditSSIOperation(user, operationName, false, duration, err.message)
    throw err
  }
}

// Execute an SSI operation using admin cookies (for web scraping).
// Still bound to user context for audit trail.
export async function executeSSIWithCookies(impersonationCtx, operationName, operationFn) {
  const startTime = Date.now()
  const user = impersonationCtx?.user || 'unknown'

  if (!impersonationCtx || !impersonationCtx.userSSI) {
    auditSecurityViolation(
      `SSI cookie operation "${operationName}" attempted without user context`,
      null,
      user
    )
    throw new Error('Invalid user context for SSI operation')
  }

  if (!isUserTokenValid({ userSSI: impersonationCtx.userSSI })) {
    throw new Error('User SSI token expired')
  }

  if (!impersonationCtx.adminSSI?.cookies) {
    throw new Error('Admin SSI cookies not available')
  }

  try {
    const result = await operationFn(impersonationCtx.adminSSI.cookies)
    const duration = Date.now() - startTime
    auditSSIOperation(user, operationName, true, duration)
    return result
  } catch (err) {
    const duration = Date.now() - startTime
    auditSSIOperation(user, operationName, false, duration, err.message)
    throw err
  }
}
