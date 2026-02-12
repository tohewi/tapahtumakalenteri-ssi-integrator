// ============================================================
// Feature Flags Tests — V7.0
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { shouldUseV7Auth, isV7AuthEnabled } from '../../lib/feature-flags.js'

// Save and restore env vars
const originalEnv = {}

beforeEach(() => {
  originalEnv.ENABLE_V7_AUTH = process.env.ENABLE_V7_AUTH
  originalEnv.V7_AUTH_ROLLOUT_PERCENTAGE = process.env.V7_AUTH_ROLLOUT_PERCENTAGE
  delete process.env.ENABLE_V7_AUTH
  delete process.env.V7_AUTH_ROLLOUT_PERCENTAGE
})

afterEach(() => {
  if (originalEnv.ENABLE_V7_AUTH !== undefined) {
    process.env.ENABLE_V7_AUTH = originalEnv.ENABLE_V7_AUTH
  } else {
    delete process.env.ENABLE_V7_AUTH
  }
  if (originalEnv.V7_AUTH_ROLLOUT_PERCENTAGE !== undefined) {
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = originalEnv.V7_AUTH_ROLLOUT_PERCENTAGE
  } else {
    delete process.env.V7_AUTH_ROLLOUT_PERCENTAGE
  }
})

function mockReq(overrides = {}) {
  return { body: {}, cookies: {}, ip: '127.0.0.1', ...overrides }
}

describe('shouldUseV7Auth', () => {
  it('should return false when ENABLE_V7_AUTH is false', () => {
    process.env.ENABLE_V7_AUTH = 'false'
    expect(shouldUseV7Auth(mockReq())).toBe(false)
  })

  it('should return true when ENABLE_V7_AUTH is true', () => {
    process.env.ENABLE_V7_AUTH = 'true'
    expect(shouldUseV7Auth(mockReq())).toBe(true)
  })

  it('should return false when no flags set (default off)', () => {
    expect(shouldUseV7Auth(mockReq())).toBe(false)
  })

  it('should return false when rollout is 0%', () => {
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '0'
    expect(shouldUseV7Auth(mockReq())).toBe(false)
  })

  it('should return true when rollout is 100%', () => {
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '100'
    expect(shouldUseV7Auth(mockReq())).toBe(true)
  })

  it('should be deterministic for same user', () => {
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '50'
    const req = mockReq({ body: { email: 'consistent@test.com' } })
    const result1 = shouldUseV7Auth(req)
    const result2 = shouldUseV7Auth(req)
    expect(result1).toBe(result2)
  })

  it('should vary between different users at partial rollout', () => {
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '50'
    const results = new Set()
    // With 100 different "users", we expect some true and some false at 50%
    for (let i = 0; i < 100; i++) {
      const req = mockReq({ body: { email: `user${i}@test.com` } })
      results.add(shouldUseV7Auth(req))
    }
    expect(results.size).toBe(2) // Both true and false should appear
  })

  it('should use ENABLE_V7_AUTH=true over rollout percentage', () => {
    process.env.ENABLE_V7_AUTH = 'true'
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '0'
    expect(shouldUseV7Auth(mockReq())).toBe(true)
  })

  it('should use ENABLE_V7_AUTH=false over rollout percentage', () => {
    process.env.ENABLE_V7_AUTH = 'false'
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '100'
    expect(shouldUseV7Auth(mockReq())).toBe(false)
  })
})

describe('isV7AuthEnabled', () => {
  it('should return false by default', () => {
    expect(isV7AuthEnabled()).toBe(false)
  })

  it('should return true when ENABLE_V7_AUTH is true', () => {
    process.env.ENABLE_V7_AUTH = 'true'
    expect(isV7AuthEnabled()).toBe(true)
  })

  it('should return true when rollout > 0', () => {
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '10'
    expect(isV7AuthEnabled()).toBe(true)
  })

  it('should return false when rollout is 0', () => {
    process.env.V7_AUTH_ROLLOUT_PERCENTAGE = '0'
    expect(isV7AuthEnabled()).toBe(false)
  })
})
