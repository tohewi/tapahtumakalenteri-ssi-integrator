// ============================================================
// Audit Logger — V7.0 Session & Impersonation Auditing
//
// Logs all authentication events, session operations, and
// SSI impersonation actions with structured JSON output.
// Optionally stores recent entries in Redis for retrieval.
// ============================================================

import crypto from 'node:crypto'

const IS_PROD = process.env.NODE_ENV === 'production'

// Event types for categorization
export const AuditEvent = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  TOKEN_REFRESH_SUCCESS: 'TOKEN_REFRESH_SUCCESS',
  TOKEN_REFRESH_FAILURE: 'TOKEN_REFRESH_FAILURE',
  SSI_OPERATION: 'SSI_OPERATION',
  SSI_OPERATION_FAILURE: 'SSI_OPERATION_FAILURE',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  RATE_LIMIT_HIT: 'RATE_LIMIT_HIT',
}

// Log an audit event
export function logAudit(eventType, data = {}) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    user: data.user || null,
    scope: data.scope || null,
    operation: data.operation || null,
    success: data.success !== undefined ? data.success : true,
    duration: data.duration || null,
    ip: data.ip || null,
    error: data.error || null,
    details: data.details || null,
  }

  // Always log to console as structured JSON
  if (IS_PROD) {
    // Production: compact JSON (one line per entry for log aggregation)
    console.log(JSON.stringify(entry))
  } else {
    // Development: readable format
    const icon = entry.success ? '✓' : '✗'
    const userStr = entry.user ? ` [${entry.user}]` : ''
    const opStr = entry.operation ? ` ${entry.operation}` : ''
    const durStr = entry.duration ? ` (${entry.duration}ms)` : ''
    const errStr = entry.error ? ` — ${entry.error}` : ''
    console.log(`[audit] ${icon} ${entry.eventType}${userStr}${opStr}${durStr}${errStr}`)
  }

  return entry
}

// Convenience wrappers for common audit events
export function auditLogin(user, ip, success, error = null) {
  return logAudit(success ? AuditEvent.LOGIN_SUCCESS : AuditEvent.LOGIN_FAILURE, {
    user, ip, success, error,
  })
}

export function auditLogout(user, ip) {
  return logAudit(AuditEvent.LOGOUT, { user, ip })
}

export function auditSSIOperation(user, operation, success, duration = null, error = null) {
  return logAudit(success ? AuditEvent.SSI_OPERATION : AuditEvent.SSI_OPERATION_FAILURE, {
    user, operation, success, duration, error,
  })
}

export function auditTokenRefresh(user, tokenType, success, error = null) {
  return logAudit(success ? AuditEvent.TOKEN_REFRESH_SUCCESS : AuditEvent.TOKEN_REFRESH_FAILURE, {
    user, operation: `refresh_${tokenType}`, success, error,
  })
}

export function auditSecurityViolation(details, ip, user = null) {
  return logAudit(AuditEvent.SECURITY_VIOLATION, {
    user, ip, success: false, details,
  })
}
