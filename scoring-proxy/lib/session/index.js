// ============================================================
// Session Module — V7.0 Barrel Export
// ============================================================

export { sessionConfig, getSessionTTLForScope } from './config.js'
export { initRedis, getRedisClient, isUsingRedis, closeRedis, _setClient } from './redis.js'
export {
  createSession,
  getSession,
  touchSession,
  deleteSession,
  getUserSessions,
  revokeAllUserSessions,
  isUserTokenValid,
  userTokenNeedsRefresh,
  adminTokenNeedsRefresh,
  getImpersonationContext,
  getActiveSessionCount,
} from './store.js'
export {
  AuditEvent,
  logAudit,
  auditLogin,
  auditLogout,
  auditSSIOperation,
  auditTokenRefresh,
  auditSecurityViolation,
} from './audit.js'
export {
  executeSSI,
  executeSSIAsUser,
  executeSSIWithCookies,
} from './impersonation.js'
