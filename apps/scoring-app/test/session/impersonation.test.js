// ============================================================
// Impersonation Layer Tests — V7.0
//
// Tests that SSI operations are properly guarded by user
// context validation and audit-logged.
// ============================================================

import { describe, it, expect, vi } from 'vitest'
import {
  executeSSI,
  executeSSIAsUser,
  executeSSIWithCookies,
} from '../../lib/session/impersonation.js'
import {
  createMockUserSSI,
  createMockAdminSSI,
  createExpiredUserSSI,
} from '../fixtures/sessions.js'

// ---- Helper: build impersonation context ----

function mockImpersonation(overrides = {}) {
  return {
    user: 'test@example.com',
    scope: 'scoring',
    userSSI: createMockUserSSI(),
    adminSSI: createMockAdminSSI(),
    metadata: { ipAddress: '127.0.0.1' },
    ...overrides,
  }
}

// ============================================================
// executeSSI — Admin operations with user context
// ============================================================

describe('executeSSI', () => {
  it('should execute operation with admin JWT', async () => {
    const ctx = mockImpersonation()
    const operationFn = vi.fn().mockResolvedValue({ success: true })

    const result = await executeSSI(ctx, 'test_operation', operationFn)

    expect(result).toEqual({ success: true })
    expect(operationFn).toHaveBeenCalledWith('mock-admin-jwt-token')
  })

  it('should reject without user context', async () => {
    const operationFn = vi.fn()

    await expect(
      executeSSI(null, 'test_operation', operationFn)
    ).rejects.toThrow('Invalid user context')

    expect(operationFn).not.toHaveBeenCalled()
  })

  it('should reject with expired user token', async () => {
    const ctx = mockImpersonation({ userSSI: createExpiredUserSSI() })
    const operationFn = vi.fn()

    await expect(
      executeSSI(ctx, 'test_operation', operationFn)
    ).rejects.toThrow('User SSI token expired')

    expect(operationFn).not.toHaveBeenCalled()
  })

  it('should reject without admin token', async () => {
    const ctx = mockImpersonation({ adminSSI: { jwt: null } })
    const operationFn = vi.fn()

    await expect(
      executeSSI(ctx, 'test_operation', operationFn)
    ).rejects.toThrow('Admin SSI token not available')

    expect(operationFn).not.toHaveBeenCalled()
  })

  it('should propagate operation errors', async () => {
    const ctx = mockImpersonation()
    const operationFn = vi.fn().mockRejectedValue(new Error('SSI API error'))

    await expect(
      executeSSI(ctx, 'test_operation', operationFn)
    ).rejects.toThrow('SSI API error')
  })

  it('should pass admin JWT to operation function', async () => {
    const customAdmin = createMockAdminSSI({ jwt: 'custom-admin-token' })
    const ctx = mockImpersonation({ adminSSI: customAdmin })
    const operationFn = vi.fn().mockResolvedValue('ok')

    await executeSSI(ctx, 'test_operation', operationFn)

    expect(operationFn).toHaveBeenCalledWith('custom-admin-token')
  })
})

// ============================================================
// executeSSIAsUser — User's own operations
// ============================================================

describe('executeSSIAsUser', () => {
  it('should execute operation with user JWT', async () => {
    const ctx = mockImpersonation()
    const operationFn = vi.fn().mockResolvedValue({ data: 'user-data' })

    const result = await executeSSIAsUser(ctx, 'read_profile', operationFn)

    expect(result).toEqual({ data: 'user-data' })
    expect(operationFn).toHaveBeenCalledWith('mock-user-jwt-token')
  })

  it('should reject without user context', async () => {
    await expect(
      executeSSIAsUser(null, 'read_profile', vi.fn())
    ).rejects.toThrow('Invalid user context')
  })

  it('should reject with expired user token', async () => {
    const ctx = mockImpersonation({ userSSI: createExpiredUserSSI() })

    await expect(
      executeSSIAsUser(ctx, 'read_profile', vi.fn())
    ).rejects.toThrow('User SSI token expired')
  })
})

// ============================================================
// executeSSIWithCookies — Web scraping operations
// ============================================================

describe('executeSSIWithCookies', () => {
  it('should execute operation with admin cookies', async () => {
    const ctx = mockImpersonation()
    const operationFn = vi.fn().mockResolvedValue('scraped-data')

    const result = await executeSSIWithCookies(ctx, 'web_scrape', operationFn)

    expect(result).toBe('scraped-data')
    expect(operationFn).toHaveBeenCalledWith(ctx.adminSSI.cookies)
  })

  it('should reject without user context', async () => {
    await expect(
      executeSSIWithCookies(null, 'web_scrape', vi.fn())
    ).rejects.toThrow('Invalid user context')
  })

  it('should reject with expired user token', async () => {
    const ctx = mockImpersonation({ userSSI: createExpiredUserSSI() })

    await expect(
      executeSSIWithCookies(ctx, 'web_scrape', vi.fn())
    ).rejects.toThrow('User SSI token expired')
  })

  it('should reject without admin cookies', async () => {
    const ctx = mockImpersonation({
      adminSSI: { ...createMockAdminSSI(), cookies: null },
    })

    await expect(
      executeSSIWithCookies(ctx, 'web_scrape', vi.fn())
    ).rejects.toThrow('Admin SSI cookies not available')
  })
})

// ============================================================
// Security: Admin token never exposed without valid user
// ============================================================

describe('Security: Admin token protection', () => {
  it('should never call operation when user token is expired', async () => {
    const ctx = mockImpersonation({ userSSI: createExpiredUserSSI() })
    const operationFn = vi.fn()

    // All three methods should reject
    await expect(executeSSI(ctx, 'op1', operationFn)).rejects.toThrow()
    await expect(executeSSIAsUser(ctx, 'op2', operationFn)).rejects.toThrow()
    await expect(executeSSIWithCookies(ctx, 'op3', operationFn)).rejects.toThrow()

    // Operation function should never have been called
    expect(operationFn).not.toHaveBeenCalled()
  })

  it('should never call operation with null impersonation context', async () => {
    const operationFn = vi.fn()

    await expect(executeSSI(null, 'op1', operationFn)).rejects.toThrow()
    await expect(executeSSI(undefined, 'op2', operationFn)).rejects.toThrow()
    await expect(executeSSI({}, 'op3', operationFn)).rejects.toThrow()

    expect(operationFn).not.toHaveBeenCalled()
  })
})
