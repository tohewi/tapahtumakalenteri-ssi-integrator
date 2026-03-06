// ============================================================
// Platform Routes — Route-Level Tests
//
// Tests HTTP contract for /api/v1/platform/* endpoints:
//   - POST /register  — sign up, validation, duplicate, rate limit
//   - POST /login     — sign in, invalid creds, rate limit
//   - POST /logout    — session teardown
//   - GET  /status    — session probe
//   - GET  /me        — auth-gated profile
//   - POST /tenants   — create tenant (auth required)
//   - GET  /tenants   — list tenants (auth required)
//   - GET  /tenants/:id  — get tenant (auth, ownership)
//   - PATCH /tenants/:id — update tenant (auth, ownership)
// ============================================================

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { _setPool } from '../../lib/db/postgres.js'
import { _setClient } from '../../lib/session/redis.js'
import { createPlatformRouter } from '../../routes/platform.js'
import { errorHandler } from '../../middleware/errorHandler.js'

// ---- In-memory Redis mock (sessions) ----

class TestRedisStore {
  constructor() { this.data = new Map(); this.ttls = new Map() }
  async get(key) {
    const ttl = this.ttls.get(key)
    if (ttl && Date.now() > ttl) { this.data.delete(key); this.ttls.delete(key); return null }
    return this.data.get(key) ?? null
  }
  async set(key, value, options) {
    this.data.set(key, value)
    if (options?.EX) this.ttls.set(key, Date.now() + options.EX * 1000)
    return 'OK'
  }
  async del(key) {
    const existed = this.data.has(key)
    this.data.delete(key); this.ttls.delete(key)
    return existed ? 1 : 0
  }
}

// ---- In-memory PostgreSQL mock (accounts + tenants) ----

class TestPgPool {
  constructor() {
    this.accounts = new Map()
    this.tenants = new Map()
  }

  /**
   * Support connect() for withTransaction calls in createAccountWithTenant.
   * Returns a lightweight client that delegates to pool.query() and
   * ignores transaction control statements (BEGIN/COMMIT/ROLLBACK).
   */
  async connect() {
    const pool = this
    return {
      query: async (text, params) => {
        const sql = text.replace(/\s+/g, ' ').trim()
        if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) return { rows: [] }
        return pool.query(text, params)
      },
      release: () => {},
    }
  }

  async query(text, params = []) {
    const sql = text.replace(/\s+/g, ' ').trim()

    if (sql.startsWith('SELECT id FROM accounts WHERE id')) {
      const row = this.accounts.get(params[0])
      return { rows: row ? [{ id: row.id }] : [] }
    }

    if (sql.startsWith('SELECT id FROM accounts')) {
      const email = params[0]
      for (const row of this.accounts.values()) {
        if (row.email.toLowerCase() === email.toLowerCase()) {
          return { rows: [{ id: row.id }] }
        }
      }
      return { rows: [] }
    }

    if (sql.startsWith('INSERT INTO accounts')) {
      const now = new Date()
      const row = {
        id: params[0], email: params[1], name: params[2],
        password_hash: params[3],
        tenants: JSON.parse(params[4]),
        created_at: now, updated_at: now,
      }
      this.accounts.set(row.id, row)
      return { rows: [row] }
    }

    if (sql.startsWith('SELECT * FROM accounts WHERE LOWER(email)')) {
      const email = params[0]
      for (const row of this.accounts.values()) {
        if (row.email.toLowerCase() === email.toLowerCase()) {
          return { rows: [row] }
        }
      }
      return { rows: [] }
    }

    if (sql.startsWith('SELECT * FROM accounts WHERE id')) {
      const row = this.accounts.get(params[0])
      return { rows: row ? [row] : [] }
    }

    if (sql.includes('tenants = tenants ||')) {
      const newTenants = JSON.parse(params[0])
      const accountId = params[1]
      const row = this.accounts.get(accountId)
      if (row) {
        row.tenants = [...(row.tenants || []), ...newTenants]
        row.updated_at = new Date()
      }
      return { rows: row ? [row] : [] }
    }

    if (sql.startsWith('UPDATE accounts SET')) {
      const accountId = params[0]
      const row = this.accounts.get(accountId)
      if (!row) return { rows: [] }
      const setMatch = sql.match(/SET (.+) WHERE/i)
      if (setMatch) {
        const clauses = setMatch[1].split(',').map(c => c.trim())
        for (const clause of clauses) {
          if (clause === 'updated_at = NOW()') { row.updated_at = new Date(); continue }
          const m = clause.match(/(\w+)\s*=\s*\$(\d+)/)
          if (m) {
            const col = m[1]
            const val = params[parseInt(m[2]) - 1]
            row[col] = col === 'tenants' ? JSON.parse(val) : val
          }
        }
      }
      return { rows: [row] }
    }

    if (sql.startsWith('INSERT INTO tenants')) {
      const now = new Date()
      const row = {
        id: params[0], account_id: params[1], name: params[2],
        subscription: JSON.parse(params[3]),
        ssi_credentials: null, calendar_config: null,
        disciplines: JSON.parse(params[4]),
        created_at: now, updated_at: now,
      }
      this.tenants.set(row.id, row)
      return { rows: [row] }
    }

    // SELECT id FROM tenants WHERE LOWER(name) = LOWER($1) — duplicate name check
    if (sql.startsWith('SELECT id FROM tenants WHERE LOWER(name)')) {
      const name = params[0]
      for (const row of this.tenants.values()) {
        if (row.name.toLowerCase() === name.toLowerCase()) {
          return { rows: [{ id: row.id }] }
        }
      }
      return { rows: [] }
    }

    // INSERT INTO tenant_members — membership record for tenant owner
    if (sql.startsWith('INSERT INTO tenant_members')) {
      const row = {
        id: params[0], tenant_id: params[1], account_id: params[2],
        roles: params[3], invited_by: null, status: 'active',
        created_at: new Date(), updated_at: new Date(),
      }
      if (!this.members) this.members = []
      this.members.push(row)
      return { rows: [row] }
    }

    // SELECT * FROM tenant_members WHERE tenant_id = $1 AND account_id = $2 AND status = 'active'
    if (sql.startsWith('SELECT * FROM tenant_members WHERE tenant_id')) {
      const tenantId = params[0]
      const accountId = params[1]
      const rows = (this.members || []).filter(
        m => m.tenant_id === tenantId && m.account_id === accountId && m.status === 'active'
      )
      return { rows }
    }

    // SELECT tenant_id, COUNT(*)::int AS count FROM disciplines WHERE tenant_id IN ...
    if (sql.startsWith('SELECT tenant_id, COUNT(*)')) {
      // No disciplines in mock — return empty
      return { rows: [] }
    }

    // SELECT DISTINCT t.* FROM tenants t LEFT JOIN tenant_members ... — listAccountTenants
    if (sql.startsWith('SELECT DISTINCT t.* FROM tenants')) {
      const accountId = params[0]
      const rows = [...this.tenants.values()]
        .filter(t => t.account_id === accountId)
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    if (sql.startsWith('SELECT * FROM tenants WHERE id')) {
      const row = this.tenants.get(params[0])
      return { rows: row ? [row] : [] }
    }

    if (sql.startsWith('SELECT * FROM tenants WHERE account_id')) {
      const rows = [...this.tenants.values()]
        .filter(t => t.account_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    if (sql.startsWith('UPDATE tenants SET')) {
      const tenantId = params[0]
      const row = this.tenants.get(tenantId)
      if (!row) return { rows: [] }
      const setMatch = sql.match(/SET (.+) WHERE/i)
      if (setMatch) {
        const clauses = setMatch[1].split(',').map(c => c.trim())
        for (const clause of clauses) {
          if (clause === 'updated_at = NOW()') { row.updated_at = new Date(); continue }
          const m = clause.match(/(\w+)\s*=\s*\$(\d+)/)
          if (m) {
            const col = m[1]
            const val = params[parseInt(m[2]) - 1]
            try { row[col] = JSON.parse(val) } catch { row[col] = val }
          }
        }
      }
      return { rows: [row] }
    }

    throw new Error(`TestPgPool: unhandled query: ${sql}`)
  }
}

// ---- Test app setup ----

let server, baseUrl

function makeTestApp({ signUpMax = 5, loginMax = 10 } = {}) {
  const app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(cookieParser())

  const platformSignUpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: signUpMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-up attempts. Try again later.' },
  })

  const platformLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: loginMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  })

  const noopLimiter = (req, res, next) => next()

  const platformRouter = createPlatformRouter({
    platformSignUpLimiter,
    platformLoginLimiter,
    platformPasswordResetLimiter: noopLimiter,
    platformMutationLimiter: noopLimiter,
    platformSsiLimiter: noopLimiter,
  })
  app.use('/api/v1/platform', platformRouter)
  app.use(errorHandler)
  return app
}

beforeAll(async () => {
  const app = makeTestApp()
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`
      resolve()
    })
  })
})

afterAll(() => {
  server?.close()
})

beforeEach(() => {
  _setPool(new TestPgPool())
  _setClient(new TestRedisStore())
})

// ---- Helpers ----

let ipCounter = 0
function uniqueIp() {
  ipCounter++
  return `10.1.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`
}

async function request(method, path, { body = null, ip = null, cookies = {} } = {}) {
  const url = `${baseUrl}${path}`
  const opts = { method, headers: {} }
  if (ip) opts.headers['X-Forwarded-For'] = ip
  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  if (cookieStr) opts.headers['Cookie'] = cookieStr
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const resp = await fetch(url, opts)
  const data = await resp.json().catch(() => null)
  // Parse Set-Cookie header for session cookie
  const setCookie = resp.headers.get('set-cookie') || ''
  return { status: resp.status, data, headers: Object.fromEntries(resp.headers.entries()), setCookie }
}

// Register a new account and return its session cookie
async function registerAndGetCookie(opts = {}) {
  const ip = uniqueIp()
  const res = await request('POST', '/api/v1/platform/register', {
    body: {
      email: opts.email || `user${Date.now()}@test.com`,
      password: opts.password || 'password123',
      name: opts.name || 'Test User',
      organizationName: opts.organizationName || `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
    ip,
  })
  if (res.status !== 201) throw new Error(`Register failed: ${JSON.stringify(res.data)}`)
  const match = res.setCookie.match(/platform_sid=([^;]+)/)
  if (!match) throw new Error('No platform_sid cookie in register response')
  return { cookie: { platform_sid: match[1] }, res, ip }
}

// ============================================================

  // ============================================================
  // POST /api/v1/platform/tenants
// ============================================================

describe('POST /api/v1/platform/tenants', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('POST', '/api/v1/platform/tenants', {
      body: { name: 'New Tenant' },
      ip: uniqueIp(),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when tenant name is missing', async () => {
    const { cookie } = await registerAndGetCookie()
    const res = await request('POST', '/api/v1/platform/tenants', {
      body: {},
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toBe('Validation failed')
    expect(res.data.details).toEqual(expect.arrayContaining([expect.stringContaining('Tenant name')]))
  })

  it('returns 400 when tenant name is too short', async () => {
    const { cookie } = await registerAndGetCookie()
    const res = await request('POST', '/api/v1/platform/tenants', {
      body: { name: 'X' },
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(400)
  })

  it('returns 201 with tenant details on valid request', async () => {
    const { cookie } = await registerAndGetCookie()
    const res = await request('POST', '/api/v1/platform/tenants', {
      body: { name: 'Second Org' },
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(201)
    expect(res.data.success).toBe(true)
    expect(res.data.tenant.name).toBe('Second Org')
    expect(res.data.tenant.id).toMatch(/^ten_/)
  })
})

// ============================================================
// GET /api/v1/platform/tenants
// ============================================================

describe('GET /api/v1/platform/tenants', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('GET', '/api/v1/platform/tenants', { ip: uniqueIp() })
    expect(res.status).toBe(401)
  })

  it('returns 200 with tenant list when authenticated', async () => {
    const { cookie } = await registerAndGetCookie({ organizationName: 'First Org' })
    const res = await request('GET', '/api/v1/platform/tenants', { cookies: cookie, ip: uniqueIp() })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.tenants)).toBe(true)
    expect(res.data.tenants.length).toBeGreaterThanOrEqual(1)
    expect(res.data.tenants[0].name).toBe('First Org')
  })
})

// ============================================================
// GET /api/v1/platform/tenants/:id
// ============================================================

describe('GET /api/v1/platform/tenants/:id', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('GET', '/api/v1/platform/tenants/ten_fake123', { ip: uniqueIp() })
    expect(res.status).toBe(401)
  })

  it('returns 404 for non-existent tenant', async () => {
    const { cookie } = await registerAndGetCookie()
    const res = await request('GET', '/api/v1/platform/tenants/ten_nonexistent', {
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(404)
    expect(res.data.error).toMatch(/not found/i)
  })

  it('returns 403 when tenant belongs to another account', async () => {
    // Owner A registers, gets a tenant
    const { cookie: cookieA, res: resA } = await registerAndGetCookie({ email: 'ownerA@test.com' })
    const tenantId = resA.data.tenant.id

    // Owner B registers separately
    const { cookie: cookieB } = await registerAndGetCookie({ email: 'ownerB@test.com' })

    // B tries to access A's tenant
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}`, {
      cookies: cookieB,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(403)
    expect(res.data.error).toMatch(/access denied/i)
  })

  it('returns 200 with tenant when authenticated owner requests it', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ organizationName: 'Get Me Org' })
    const tenantId = regRes.data.tenant.id

    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}`, {
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(200)
    expect(res.data.tenant.name).toBe('Get Me Org')
  })
})

// ============================================================
// PATCH /api/v1/platform/tenants/:id
// ============================================================

describe('PATCH /api/v1/platform/tenants/:id', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('PATCH', '/api/v1/platform/tenants/ten_fake', {
      body: { name: 'New Name' },
      ip: uniqueIp(),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 for non-existent tenant', async () => {
    const { cookie } = await registerAndGetCookie()
    const res = await request('PATCH', '/api/v1/platform/tenants/ten_nonexistent', {
      body: { name: 'New Name' },
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 when tenant belongs to another account', async () => {
    const { cookie: cookieA, res: resA } = await registerAndGetCookie({ email: 'patchA@test.com' })
    const tenantId = resA.data.tenant.id

    const { cookie: cookieB } = await registerAndGetCookie({ email: 'patchB@test.com' })
    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}`, {
      body: { name: 'Stolen' },
      cookies: cookieB,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(403)
  })

  it('returns 400 when no valid fields are provided', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie()
    const tenantId = regRes.data.tenant.id

    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}`, {
      body: { unknownField: 'value' },
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/no valid fields/i)
  })

  it('returns 200 and updates tenant name', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ organizationName: 'Old Name' })
    const tenantId = regRes.data.tenant.id

    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}`, {
      body: { name: 'New Name' },
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.tenant.name).toBe('New Name')
  })

  it('returns 200 and updates disciplines', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie()
    const tenantId = regRes.data.tenant.id

    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}`, {
      body: { disciplines: ['sra', 'resul'] },
      cookies: cookie,
      ip: uniqueIp(),
    })
    expect(res.status).toBe(200)
    expect(res.data.tenant.disciplines).toEqual(['sra', 'resul'])
  })
})

// ============================================================
