// ============================================================
// V7.0 Auth Middleware Tests
//
// Tests for requireAuthV7 middleware using mock Express
// req/res objects against the in-memory session store.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initRedis, closeRedis } from '../../lib/session/redis.js'
import { createSession } from '../../lib/session/store.js'
import { requireAuthV7, requireScopeV7 } from '../../middleware/auth-v7.js'
import { createMockSessionInput, createExpiredUserSSI } from '../fixtures/sessions.js'

// ---- Helpers: mock Express req/res/next ----

function mockReq(cookies = {}, extras = {}) {
  return {
    cookies,
    ip: '127.0.0.1',
    headers: {},
    ...extras,
  }
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    cookies: {},
    status(code) { res.statusCode = code; return res },
    json(data) { res.body = data; return res },
    cookie(name, value, opts) { res.cookies[name] = { value, opts }; return res },
    clearCookie(name, opts) { delete res.cookies[name]; return res },
  }
  return res
}

function mockNext() {
  const fn = vi.fn()
  return fn
}

// ---- Setup ----

beforeEach(async () => {
  delete process.env.REDIS_URL
  await initRedis()
})

afterEach(async () => {
  await closeRedis()
})

// ============================================================
// requireAuthV7 — Authentication
// ============================================================

describe('requireAuthV7 — Authentication', () => {
  it('should authenticate with valid session', async () => {
    const { sessionId } = await createSession(createMockSessionInput())
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.ssiSession).toBeTruthy()
    expect(req.ssiSession.userId).toBe('test@example.com')
    expect(req.impersonation).toBeTruthy()
    expect(req.impersonation.user).toBe('test@example.com')
  })

  it('should reject with missing session cookie', async () => {
    const req = mockReq({})
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body.sessionExpired).toBe(true)
  })

  it('should reject with non-existent session ID', async () => {
    const req = mockReq({ ssi_session: 'non-existent-id' })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body.sessionExpired).toBe(true)
  })

  it('should reject with expired user SSI token', async () => {
    const { sessionId } = await createSession(
      createMockSessionInput({ userSSI: createExpiredUserSSI() })
    )
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body.sessionExpired).toBe(true)
  })

  it('should set impersonation context with admin SSI', async () => {
    const { sessionId } = await createSession(createMockSessionInput())
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(req.impersonation).toBeTruthy()
    expect(req.impersonation.adminSSI).toBeTruthy()
    expect(req.impersonation.adminSSI.jwt).toBe('mock-admin-jwt-token')
    expect(req.impersonation.userSSI.jwt).toBe('mock-user-jwt-token')
  })

  it('should slide session cookie on each request', async () => {
    const { sessionId } = await createSession(createMockSessionInput())
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(res.cookies.ssi_session).toBeTruthy()
    expect(res.cookies.ssi_session.value).toBe(sessionId)
    expect(res.cookies.ssi_session.opts.httpOnly).toBe(true)
    expect(res.cookies.ssi_session.opts.sameSite).toBe('lax')
    expect(res.cookies.ssi_session.opts.path).toBe('/api')
  })
})

// ============================================================
// requireAuthV7 — Scope Validation
// ============================================================

describe('requireAuthV7 — Scope Validation', () => {
  it('should allow matching scope', async () => {
    const { sessionId } = await createSession(
      createMockSessionInput({ scope: 'scoring' })
    )
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7('scoring')
    await middleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('should reject mismatching scope', async () => {
    const { sessionId } = await createSession(
      createMockSessionInput({ scope: 'scoring' })
    )
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7('manage')
    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body.scopeMismatch).toBe(true)
  })

  it('should accept array of allowed scopes', async () => {
    const { sessionId } = await createSession(
      createMockSessionInput({ scope: 'manage' })
    )
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7(['scoring', 'manage'])
    await middleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('should allow any scope when no scope restriction', async () => {
    const { sessionId } = await createSession(
      createMockSessionInput({ scope: 'staffing' })
    )
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})

// ============================================================
// requireScopeV7 — Standalone scope check
// ============================================================

describe('requireScopeV7', () => {
  it('should pass for matching scope', async () => {
    const req = { ssiSession: { scope: 'scoring' } }
    const res = mockRes()
    const next = mockNext()

    requireScopeV7('scoring')(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('should reject mismatching scope', async () => {
    const req = { ssiSession: { scope: 'scoring' } }
    const res = mockRes()
    const next = mockNext()

    requireScopeV7('manage')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('should reject when no session', async () => {
    const req = {}
    const res = mockRes()
    const next = mockNext()

    requireScopeV7('scoring')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })
})

// ============================================================
// requireAuthV7 — Security
// ============================================================

describe('requireAuthV7 — Security', () => {
  it('should not expose admin tokens when user token is expired', async () => {
    const { sessionId } = await createSession(
      createMockSessionInput({ userSSI: createExpiredUserSSI() })
    )
    const req = mockReq({ ssi_session: sessionId })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    // Should be rejected, impersonation not set
    expect(next).not.toHaveBeenCalled()
    expect(req.impersonation).toBeUndefined()
  })

  it('should handle errors gracefully', async () => {
    // Pass an invalid cookie format that won't crash
    const req = mockReq({ ssi_session: null })
    const res = mockRes()
    const next = mockNext()

    const middleware = requireAuthV7()
    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })
})
