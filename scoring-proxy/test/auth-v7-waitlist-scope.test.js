import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initRedis, closeRedis } from '../lib/session/redis.js'

vi.mock('../lib/ssi-core/graphql.js', () => ({
  ssiGraphQL: vi.fn().mockResolvedValue({
    token_auth: {
      token: { token: 'user-jwt' },
      refresh_token: { token: 'user-refresh' },
    },
  }),
  ssiLogin: vi.fn().mockResolvedValue([{ name: 'sessionid', value: 'abc' }]),
}))

vi.mock('../lib/staffing/config-loader.js', () => ({
  isAdminEmail: vi.fn().mockReturnValue(false),
}))

vi.mock('../lib/waitlist/config-loader.js', () => ({
  isAdminEmail: vi.fn(),
}))

import { createAuthV7Router } from '../routes/auth-v7.js'
import { isAdminEmail as isWaitlistAdminEmail } from '../lib/waitlist/config-loader.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  const passThrough = (req, res, next) => next()

  app.use('/api/auth', createAuthV7Router({
    loginLimiter: passThrough,
    getAdminSession: async () => ({
      jwt: 'admin-jwt',
      refreshToken: 'admin-refresh',
      cookies: [{ name: 'admin', value: 'cookie' }],
    }),
    requireAuth: passThrough,
    graphqlWithRefresh: vi.fn(),
  }))

  return app
}

describe('auth-v7 waitlist scope', () => {
  beforeEach(async () => {
    delete process.env.REDIS_URL
    await initRedis()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await closeRedis()
  })

  it('rejects waitlist scope login for non-allowlisted SSI user', async () => {
    isWaitlistAdminEmail.mockReturnValue(false)
    const app = buildApp()

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'secret', scope: 'waitlist' })

    expect(res.status).toBe(403)
    expect(res.body.error).toContain('wait list admin list')
  })

  it('allows waitlist scope login for allowlisted SSI user', async () => {
    isWaitlistAdminEmail.mockReturnValue(true)
    const app = buildApp()

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'secret', scope: 'waitlist' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.scope).toBe('waitlist')
    expect(res.headers['set-cookie']).toBeTruthy()
  })
})