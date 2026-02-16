// ============================================================
// Session Store — V7.0 Dual-Session Pattern
//
// Each session contains:
//   - User's SSI tokens (JWT + refresh + cookies)
//   - Admin SSI delegation (JWT + refresh + cookies)
//   - Scope, metadata, and audit context
//
// Admin tokens are only accessible when user context is valid.
// ============================================================

import crypto from 'node:crypto'
import { getRedisClient } from './redis.js'
import { sessionConfig, getSessionTTLForScope } from './config.js'

const PREFIX = sessionConfig.redis.prefix

// ---- Session CRUD ----

// Create a new session after successful user login
export async function createSession({ userId, userSSI, adminSSI, scope, metadata }) {
  const redis = getRedisClient()
  const sessionId = crypto.randomUUID()
  const now = Date.now()
  const ttl = getSessionTTLForScope(scope)
  const inputMetadata = metadata && typeof metadata === 'object' ? metadata : {}

  const sessionData = {
    userId,
    userSSI: {
      jwt: userSSI.jwt,
      refreshToken: userSSI.refreshToken,
      cookies: userSSI.cookies || null,
      apiKey: userSSI.apiKey || null,
      expiresAt: userSSI.expiresAt || now + 15 * 60 * 1000, // default 15 min
      lastRefreshed: now,
    },
    adminSSI: adminSSI ? {
      jwt: adminSSI.jwt,
      refreshToken: adminSSI.refreshToken,
      cookies: adminSSI.cookies || null,
      expiresAt: adminSSI.expiresAt || now + 4 * 60 * 60 * 1000, // default 4h
      lastRefreshed: now,
    } : null,
    scope: scope || 'scoring',
    metadata: {
      ...inputMetadata,
      ipAddress: inputMetadata.ipAddress || null,
      userAgent: inputMetadata.userAgent || null,
      loginTime: now,
      lastActivity: now,
    },
    createdAt: now,
    lastUsed: now,
  }

  const key = `${PREFIX}${sessionId}`
  const ttlSeconds = Math.ceil(ttl / 1000)
  await redis.set(key, JSON.stringify(sessionData), { EX: ttlSeconds })

  return { sessionId, sessionData }
}

// Get a session by ID, returns null if expired or missing
export async function getSession(sessionId) {
  if (!sessionId) return null
  const redis = getRedisClient()
  const key = `${PREFIX}${sessionId}`
  const raw = await redis.get(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    // Corrupted session data — delete it
    await redis.del(key)
    return null
  }
}

// Update a session (touch lastUsed + renew TTL)
export async function touchSession(sessionId, updates = {}) {
  const session = await getSession(sessionId)
  if (!session) return null

  const redis = getRedisClient()
  const key = `${PREFIX}${sessionId}`
  const now = Date.now()

  session.lastUsed = now
  session.metadata.lastActivity = now

  // Apply any additional updates (e.g. refreshed tokens)
  if (updates.userSSI) Object.assign(session.userSSI, updates.userSSI)
  if (updates.adminSSI) Object.assign(session.adminSSI, updates.adminSSI)

  const ttl = getSessionTTLForScope(session.scope)
  const ttlSeconds = Math.ceil(ttl / 1000)
  await redis.set(key, JSON.stringify(session), { EX: ttlSeconds })

  return session
}

// Delete a specific session (logout)
export async function deleteSession(sessionId) {
  if (!sessionId) return false
  const redis = getRedisClient()
  const key = `${PREFIX}${sessionId}`
  const result = await redis.del(key)
  return result > 0
}

// List all sessions for a given user (for monitoring / revocation)
export async function getUserSessions(userId) {
  const redis = getRedisClient()
  const keys = await redis.keys(`${PREFIX}*`)
  const sessions = []

  for (const key of keys) {
    const raw = await redis.get(key)
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      if (data.userId === userId) {
        const sid = key.replace(PREFIX, '')
        sessions.push({ sessionId: sid, ...data })
      }
    } catch {
      // Skip corrupted entries
    }
  }
  return sessions
}

// Revoke all sessions for a user (password change, security event)
export async function revokeAllUserSessions(userId) {
  const redis = getRedisClient()
  const keys = await redis.keys(`${PREFIX}*`)
  let revoked = 0

  for (const key of keys) {
    const raw = await redis.get(key)
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      if (data.userId === userId) {
        await redis.del(key)
        revoked++
      }
    } catch {
      // Skip corrupted
    }
  }
  return revoked
}

// ---- Token Validation ----

// Check if user SSI token is still valid
export function isUserTokenValid(session) {
  if (!session?.userSSI?.jwt) return false
  return session.userSSI.expiresAt > Date.now()
}

// Check if user SSI token needs refresh (within refresh window)
export function userTokenNeedsRefresh(session) {
  if (!session?.userSSI?.expiresAt) return false
  return session.userSSI.expiresAt < Date.now() + sessionConfig.tokenRefresh.userRefreshWindow
}

// Check if admin SSI token needs refresh
export function adminTokenNeedsRefresh(session) {
  if (!session?.adminSSI?.expiresAt) return false
  return session.adminSSI.expiresAt < Date.now() + sessionConfig.tokenRefresh.adminRefreshWindow
}

// ---- Impersonation Context ----

// Build impersonation context from session — only if user token is valid
export function getImpersonationContext(session) {
  if (!session) return null
  if (!isUserTokenValid(session)) return null

  return {
    user: session.userId,
    scope: session.scope,
    userSSI: session.userSSI,
    adminSSI: session.adminSSI,
    metadata: session.metadata,
  }
}

// ---- Session Count (for health check) ----

export async function getActiveSessionCount() {
  const redis = getRedisClient()
  const keys = await redis.keys(`${PREFIX}*`)
  return keys.length
}
