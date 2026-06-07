// ============================================================
// Test Fixtures — Session data for V7.0 auth tests
// ============================================================

export function createMockUserSSI(overrides = {}) {
  return {
    jwt: 'mock-user-jwt-token',
    refreshToken: 'mock-user-refresh-token',
    cookies: { sessionid: 'mock-session-cookie' },
    apiKey: 'mock-api-key',
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 min from now
    lastRefreshed: Date.now(),
    ...overrides,
  }
}

export function createMockAdminSSI(overrides = {}) {
  return {
    jwt: 'mock-admin-jwt-token',
    refreshToken: 'mock-admin-refresh-token',
    cookies: { sessionid: 'mock-admin-session-cookie' },
    expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4h from now
    lastRefreshed: Date.now(),
    ...overrides,
  }
}

export function createMockSessionInput(overrides = {}) {
  return {
    userId: 'test@example.com',
    userSSI: createMockUserSSI(overrides.userSSI),
    adminSSI: createMockAdminSSI(overrides.adminSSI),
    scope: 'scoring',
    metadata: {
      ipAddress: '127.0.0.1',
      userAgent: 'vitest/1.0',
      ...overrides.metadata,
    },
    ...overrides,
  }
}

// Expired user SSI token (for security tests)
export function createExpiredUserSSI() {
  return createMockUserSSI({
    expiresAt: Date.now() - 60 * 1000, // expired 1 min ago
  })
}

// User SSI token about to expire (for refresh tests)
export function createExpiringUserSSI() {
  return createMockUserSSI({
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min left (within 10 min refresh window)
  })
}

// Admin SSI token about to expire
export function createExpiringAdminSSI() {
  return createMockAdminSSI({
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min left
  })
}
