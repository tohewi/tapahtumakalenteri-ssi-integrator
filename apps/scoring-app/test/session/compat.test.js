// ============================================================
// V7 Session Compatibility Layer Tests
//
// Verifies that V7 sessions are correctly mapped to the
// legacy format expected by existing scoring/management/
// staffing/reports routes.
// ============================================================

import { describe, it, expect } from 'vitest'
import { toLegacySession } from '../../lib/session/compat.js'
import { createMockUserSSI, createMockAdminSSI } from '../fixtures/sessions.js'

// ---- Helper: build a V7 session ----

function mockV7Session(overrides = {}) {
  return {
    userId: 'test@example.com',
    userSSI: createMockUserSSI(),
    adminSSI: createMockAdminSSI(),
    scope: 'scoring',
    createdAt: Date.now(),
    lastUsed: Date.now(),
    metadata: { ipAddress: '127.0.0.1' },
    ...overrides,
  }
}

// ============================================================
// toLegacySession — Field Mapping
// ============================================================

describe('toLegacySession — Field Mapping', () => {
  it('should map userSSI.jwt to legacy .jwt', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)

    expect(legacy.jwt).toBe('mock-user-jwt-token')
  })

  it('should map userSSI.refreshToken to legacy .refreshToken', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)

    expect(legacy.refreshToken).toBe('mock-user-refresh-token')
  })

  it('should map userSSI.cookies to legacy .ssiCookies', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)

    expect(legacy.ssiCookies).toEqual({ sessionid: 'mock-session-cookie' })
  })

  it('should map userSSI.apiKey to legacy .apiKey', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)

    expect(legacy.apiKey).toBe('mock-api-key')
  })

  it('should map scope directly', () => {
    const v7 = mockV7Session({ scope: 'manage' })
    const legacy = toLegacySession(v7)

    expect(legacy.scope).toBe('manage')
  })

  it('should map createdAt and lastUsed', () => {
    const now = Date.now()
    const v7 = mockV7Session({ createdAt: now, lastUsed: now })
    const legacy = toLegacySession(v7)

    expect(legacy.createdAt).toBe(now)
    expect(legacy.lastUsed).toBe(now)
  })
})

// ============================================================
// toLegacySession — Write-through
// ============================================================

describe('toLegacySession — Write-through', () => {
  it('should write jwt changes back to V7 session', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)

    legacy.jwt = 'new-jwt-token'
    expect(v7.userSSI.jwt).toBe('new-jwt-token')
  })

  it('should write refreshToken changes back to V7 session', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)

    legacy.refreshToken = 'new-refresh-token'
    expect(v7.userSSI.refreshToken).toBe('new-refresh-token')
  })
})

// ============================================================
// toLegacySession — V7 Metadata
// ============================================================

describe('toLegacySession — V7 Metadata', () => {
  it('should expose _v7 flag', () => {
    const legacy = toLegacySession(mockV7Session())
    expect(legacy._v7).toBe(true)
  })

  it('should expose _userSSI', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)
    expect(legacy._userSSI).toBe(v7.userSSI)
  })

  it('should expose _adminSSI', () => {
    const v7 = mockV7Session()
    const legacy = toLegacySession(v7)
    expect(legacy._adminSSI).toBe(v7.adminSSI)
  })

  it('should expose _userId', () => {
    const legacy = toLegacySession(mockV7Session())
    expect(legacy._userId).toBe('test@example.com')
  })
})

// ============================================================
// toLegacySession — Edge Cases
// ============================================================

describe('toLegacySession — Edge Cases', () => {
  it('should return null for null session', () => {
    expect(toLegacySession(null)).toBeNull()
  })

  it('should return null for session without userSSI', () => {
    expect(toLegacySession({ userId: 'test' })).toBeNull()
  })

  it('should handle session without adminSSI', () => {
    const v7 = mockV7Session({ adminSSI: null })
    const legacy = toLegacySession(v7)

    expect(legacy).not.toBeNull()
    expect(legacy.jwt).toBe('mock-user-jwt-token')
    expect(legacy._adminSSI).toBeNull()
  })
})
