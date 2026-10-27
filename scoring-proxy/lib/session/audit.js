// ============================================================
// Audit Logger — V7.0 Session & Impersonation Auditing
//
// Logs all authentication events, session operations, and
// SSI impersonation actions with structured JSON output.
// ============================================================

import crypto from 'node:crypto'

const IS_PROD = process.env.NODE_ENV === 'production'

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

export function serializeAuditLogJson(entry) {
  const payload = {
    level: entry.level,
    id: entry.id,
    timestamp: entry.timestamp,
    eventType: entry.eventType,
    user: entry.user,
    scope: entry.scope,
    operation: entry.operation,
    success: entry.success,
    duration: entry.duration,
    ip: entry.ip,
    ...(entry.error ? { error: entry.error } : {}),
    ...(entry.details ? { details: entry.details } : {}),
  }
  return JSON.stringify(payload)
}

export function logAudit(eventType, data = {}) {
  const isSuccess = data.success !== undefined ? Boolean(data.success) : true
  const entry = {
    level: isSuccess ? 'info' : 'error',
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    user: data.user || null,
    scope: data.scope || null,
    operation: data.operation || null,
    success: isSuccess,
    duration: data.duration || null,
    ip: data.ip || null,
    ...(data.error ? { error: data.error } : {}),
    details: data.details || null,
  }

  if (IS_PROD) {
    const jsonLine = serializeAuditLogJson(entry)
    if (isSuccess) {
      console.log(jsonLine)
    } else {
      console.error(jsonLine)
    }
  } else {
    const icon = entry.success ? '✓' : '✗'
    const userStr = entry.user ? ` [${entry.user}]` : ''
    const opStr = entry.operation ? ` ${entry.operation}` : ''
    const durStr = entry.duration ? ` (${entry.duration}ms)` : ''
    const errStr = entry.error ? ` — ${entry.error}` : ''
    console.log(`[audit] ${icon} ${entry.eventType}${userStr}${opStr}${durStr}${errStr}`)
  }

  return entry
}

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

export function auditMutation({
  requestId = crypto.randomUUID(),
  endpoint,
  operation,
  initiatingUserId,
  initiatingUserEmail = initiatingUserId,
  executionIdentityUserId = null,
  executionIdentityEmail = executionIdentityUserId,
  targetEntity = {},
  result = 'success',
  errorCode = null,
}) {
  const details = {
    requestId,
    endpoint,
    operation,
    initiatingUserId: initiatingUserId || null,
    initiatingUserEmail: initiatingUserEmail || null,
    executionIdentityUserId: executionIdentityUserId || null,
    executionIdentityEmail: executionIdentityEmail || null,
    targetEntity,
    result,
    ...(errorCode ? { errorCode } : {}),
  }
  return logAudit(
    result === 'success' ? AuditEvent.SSI_OPERATION : AuditEvent.SSI_OPERATION_FAILURE,
    {
      user: initiatingUserEmail || initiatingUserId || null,
      operation: `${operation}:${endpoint}`,
      success: result === 'success',
      ...(errorCode ? { error: errorCode } : {}),
      details,
    }
  )
}

export function createAuditMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now()

    res.on('finish', () => {
      const duration = Date.now() - startTime
      const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)
      const isSSIPath = req.path.includes('/scoring') ||
                        req.path.includes('/manage') ||
                        req.path.includes('/register') ||
                        req.path.includes('/staffing') ||
                        req.path.includes('/guns')

      if (isMutation && isSSIPath) {
        const user = req._v7Session?.userId || req.ssiSession?.userId || req.ssiSession?._userId || null
        const ip = req.ip || req.socket?.remoteAddress || 'unknown'
        const success = res.statusCode >= 200 && res.statusCode < 400

        logAudit(
          success ? AuditEvent.SSI_OPERATION : AuditEvent.SSI_OPERATION_FAILURE,
          {
            user,
            scope: req._v7Session?.scope || null,
            operation: `${req.method} ${req.path}`,
            success,
            duration,
            ip,
            ...(success ? {} : { error: `HTTP ${res.statusCode}` }),
          }
        )
      }
    })

    next()
  }
}
