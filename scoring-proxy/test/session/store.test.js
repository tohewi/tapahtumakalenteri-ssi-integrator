// ============================================================
// Session Store Unit Tests — V7.0
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initRedis, closeRedis } from '../../lib/session/redis.js'
import {
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
} from '../../lib/session/store.js'
import {
  createMockSessionInput,
  createExpiredUserSSI,
  createExpiringUserSSI,
  createExpiringAdminSSI,
} from '../fixtures/sessions.js'

// Use in-memory fallback (no REDIS_URL set in test env)
beforeEach(async () => {
  // Ensure no REDIS_URL so we get in-memory store
  delete process.env.REDIS_URL
  await initRedis()
})

afterEach(async () => {
  await closeRedis()
})

// ============================================================
// createSession
// ============================================================

describe('createSession', () => {
  it('should create session with valid data', async () => {
    const input = createMockSessionInput()
    const { sessionId, sessionData } = await createSession(input)

    expect(sessionId).toBeTruthy()
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(sessionData.userId).toBe('test@example.com')
    expect(sessionData.scope).toBe('scoring')
    expect(sessionData.userSSI.jwt).toBe('mock-user-jwt-token')
    expect(sessionData.adminSSI.jwt).toBe('mock-admin-jwt-token')
    expect(sessionData.createdAt).toBeGreaterThan(0)
    expect(sessionData.lastUsed).toBeGreaterThan(0)
  })

  it('should store session retrievable by ID', async () => {
    const input = createMockSessionInput()
    const { sessionId } = await createSession(input)

    const retrieved = await getSession(sessionId)
    expect(retrieved).not.toBeNull()
    expect(retrieved.userId).toBe('test@example.com')
    expect(retrieved.userSSI.jwt).toBe('mock-user-jwt-token')
  })

  it('should generate unique session IDs', async () => {
    const input = createMockSessionInput()
    const ids = new Set()

    for (let i = 0; i < 10; i++) {
      const { sessionId } = await createSession(input)
      ids.add(sessionId)
    }

    expect(ids.size).toBe(10)
  })

  it('should include admin SSI delegation', async () => {
    const input = createMockSessionInput()
    const { sessionData } = await createSession(input)

    expect(sessionData.adminSSI).not.toBeNull()
    expect(sessionData.adminSSI.jwt).toBe('mock-admin-jwt-token')
    expect(sessionData.adminSSI.refreshToken).toBe('mock-admin-refresh-token')
  })

  it('should handle null admin SSI', async () => {
    const input = createMockSessionInput({ adminSSI: null })
    // Remove adminSSI from input so createSession receives null
    input.adminSSI = null
    const { sessionData } = await createSession(input)

    expect(sessionData.adminSSI).toBeNull()
  })

  it('should set metadata correctly', async () => {
    const input = createMockSessionInput({
      metadata: { ipAddress: '10.0.0.1', userAgent: 'TestBrowser/1.0' },
    })
    const { sessionData } = await createSession(input)

    expect(sessionData.metadata.ipAddress).toBe('10.0.0.1')
    expect(sessionData.metadata.userAgent).toBe('TestBrowser/1.0')
    expect(sessionData.metadata.loginTime).toBeGreaterThan(0)
  })

  it('should preserve custom metadata fields', async () => {
    const input = createMockSessionInput({
      scope: 'staffing',
      metadata: {
        ipAddress: '10.0.0.1',
        userAgent: 'TestBrowser/1.0',
        staffingSiteKey: 'temppeli-sra',
      },
    })

    const { sessionData } = await createSession(input)

    expect(sessionData.metadata.staffingSiteKey).toBe('temppeli-sra')
  })
})

// ============================================================
// getSession
// ============================================================

describe('getSession', () => {
  it('should retrieve existing session', async () => {
    const { sessionId } = await createSession(createMockSessionInput())
    const session = await getSession(sessionId)

    expect(session).not.toBeNull()
    expect(session.userId).toBe('test@example.com')
  })

  it('should return null for non-existent session', async () => {
    const session = await getSession('non-existent-id')
    expect(session).toBeNull()
  })

  it('should return null for null/undefined session ID', async () => {
    expect(await getSession(null)).toBeNull()
    expect(await getSession(undefined)).toBeNull()
    expect(await getSession('')).toBeNull()
  })
})

// ============================================================
// touchSession
// ============================================================

describe('touchSession', () => {
  it('should update lastUsed timestamp', async () => {
    const { sessionId, sessionData } = await createSession(createMockSessionInput())
    const originalLastUsed = sessionData.lastUsed

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10))

    const updated = await touchSession(sessionId)
    expect(updated.lastUsed).toBeGreaterThanOrEqual(originalLastUsed)
    expect(updated.metadata.lastActivity).toBeGreaterThanOrEqual(originalLastUsed)
  })

  it('should return null for non-existent session', async () => {
    const result = await touchSession('non-existent')
    expect(result).toBeNull()
  })

  it('should apply token updates', async () => {
    const { sessionId } = await createSession(createMockSessionInput())

    const updated = await touchSession(sessionId, {
      userSSI: { jwt: 'new-user-jwt', expiresAt: Date.now() + 900000 },
    })

    expect(updated.userSSI.jwt).toBe('new-user-jwt')
    // Original fields should be preserved
    expect(updated.userSSI.refreshToken).toBe('mock-user-refresh-token')
  })
})

// ============================================================
// deleteSession
// ============================================================

describe('deleteSession', () => {
  it('should delete existing session', async () => {
    const { sessionId } = await createSession(createMockSessionInput())

    const deleted = await deleteSession(sessionId)
    expect(deleted).toBe(true)

    const session = await getSession(sessionId)
    expect(session).toBeNull()
  })

  it('should return false for non-existent session', async () => {
    const deleted = await deleteSession('non-existent')
    expect(deleted).toBe(false)
  })

  it('should return false for null session ID', async () => {
    const deleted = await deleteSession(null)
    expect(deleted).toBe(false)
  })
})

// ============================================================
// getUserSessions
// ============================================================

describe('getUserSessions', () => {
  it('should return all sessions for a user', async () => {
    const input = createMockSessionInput()
    await createSession(input)
    await createSession(input)
    await createSession(input)

    const sessions = await getUserSessions('test@example.com')
    expect(sessions.length).toBe(3)
    sessions.forEach(s => expect(s.userId).toBe('test@example.com'))
  })

  it('should not return sessions for other users', async () => {
    await createSession(createMockSessionInput({ userId: 'user1@example.com' }))
    await createSession(createMockSessionInput({ userId: 'user2@example.com' }))

    const sessions = await getUserSessions('user1@example.com')
    expect(sessions.length).toBe(1)
    expect(sessions[0].userId).toBe('user1@example.com')
  })

  it('should return empty array for unknown user', async () => {
    const sessions = await getUserSessions('nobody@example.com')
    expect(sessions.length).toBe(0)
  })
})

// ============================================================
// revokeAllUserSessions
// ============================================================

describe('revokeAllUserSessions', () => {
  it('should revoke all sessions for a user', async () => {
    const input = createMockSessionInput()
    await createSession(input)
    await createSession(input)

    const revoked = await revokeAllUserSessions('test@example.com')
    expect(revoked).toBe(2)

    const sessions = await getUserSessions('test@example.com')
    expect(sessions.length).toBe(0)
  })

  it('should not revoke sessions for other users', async () => {
    await createSession(createMockSessionInput({ userId: 'user1@example.com' }))
    await createSession(createMockSessionInput({ userId: 'user2@example.com' }))

    await revokeAllUserSessions('user1@example.com')

    const user2Sessions = await getUserSessions('user2@example.com')
    expect(user2Sessions.length).toBe(1)
  })
})

// ============================================================
// Token Validation
// ============================================================

describe('isUserTokenValid', () => {
  it('should return true for valid token', () => {
    const session = { userSSI: { jwt: 'token', expiresAt: Date.now() + 60000 } }
    expect(isUserTokenValid(session)).toBe(true)
  })

  it('should return false for expired token', () => {
    const session = { userSSI: { jwt: 'token', expiresAt: Date.now() - 60000 } }
    expect(isUserTokenValid(session)).toBe(false)
  })

  it('should return false for missing jwt', () => {
    const session = { userSSI: { jwt: null, expiresAt: Date.now() + 60000 } }
    expect(isUserTokenValid(session)).toBe(false)
  })

  it('should return false for null session', () => {
    expect(isUserTokenValid(null)).toBe(false)
  })
})

describe('userTokenNeedsRefresh', () => {
  it('should return true when token expires within refresh window', () => {
    // Token expires in 5 minutes, refresh window is 10 minutes
    const session = { userSSI: { expiresAt: Date.now() + 5 * 60 * 1000 } }
    expect(userTokenNeedsRefresh(session)).toBe(true)
  })

  it('should return false when token has plenty of time', () => {
    // Token expires in 30 minutes
    const session = { userSSI: { expiresAt: Date.now() + 30 * 60 * 1000 } }
    expect(userTokenNeedsRefresh(session)).toBe(false)
  })
})

describe('adminTokenNeedsRefresh', () => {
  it('should return true when admin token expires within refresh window', () => {
    const session = { adminSSI: { expiresAt: Date.now() + 5 * 60 * 1000 } }
    expect(adminTokenNeedsRefresh(session)).toBe(true)
  })

  it('should return false when admin token has plenty of time', () => {
    const session = { adminSSI: { expiresAt: Date.now() + 2 * 60 * 60 * 1000 } }
    expect(adminTokenNeedsRefresh(session)).toBe(false)
  })

  it('should return false when no admin SSI', () => {
    expect(adminTokenNeedsRefresh({ adminSSI: null })).toBe(false)
  })
})

// ============================================================
// Impersonation Context
// ============================================================

describe('getImpersonationContext', () => {
  it('should return context for valid session', () => {
    const session = {
      userId: 'test@example.com',
      scope: 'scoring',
      userSSI: { jwt: 'user-jwt', expiresAt: Date.now() + 60000 },
      adminSSI: { jwt: 'admin-jwt' },
      metadata: { ipAddress: '127.0.0.1' },
    }

    const ctx = getImpersonationContext(session)
    expect(ctx).not.toBeNull()
    expect(ctx.user).toBe('test@example.com')
    expect(ctx.userSSI.jwt).toBe('user-jwt')
    expect(ctx.adminSSI.jwt).toBe('admin-jwt')
  })

  it('should return null for expired user token', () => {
    const session = {
      userId: 'test@example.com',
      userSSI: { jwt: 'user-jwt', expiresAt: Date.now() - 60000 },
      adminSSI: { jwt: 'admin-jwt' },
    }

    const ctx = getImpersonationContext(session)
    expect(ctx).toBeNull()
  })

  it('should return null for null session', () => {
    expect(getImpersonationContext(null)).toBeNull()
  })
})

// ============================================================
// getActiveSessionCount
// ============================================================

describe('getActiveSessionCount', () => {
  it('should return 0 when no sessions exist', async () => {
    const count = await getActiveSessionCount()
    expect(count).toBe(0)
  })

  it('should return correct count', async () => {
    await createSession(createMockSessionInput())
    await createSession(createMockSessionInput())

    const count = await getActiveSessionCount()
    expect(count).toBe(2)
  })

  it('should decrease after deletion', async () => {
    const { sessionId } = await createSession(createMockSessionInput())
    await createSession(createMockSessionInput())

    await deleteSession(sessionId)

    const count = await getActiveSessionCount()
    expect(count).toBe(1)
  })
})
