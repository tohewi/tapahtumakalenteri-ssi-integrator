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
    this.disciplines = new Map()
    this.templates = new Map()
    this.members = []
    this.events = new Map()
    this.disciplines = new Map()
    this.templates = new Map()
    this.members = []
    this.events = new Map()
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
        slug: params[3],
        subscription: JSON.parse(params[4]),
        ssi_credentials: null, calendar_config: null,
        disciplines: JSON.parse(params[5]),
        created_at: now, updated_at: now,
      }
      this.tenants.set(row.id, row)
      return { rows: [row] }
    }

    if (sql.startsWith('SELECT id FROM tenants WHERE slug')) {
      const slug = params[0]
      for (const row of this.tenants.values()) {
        if (row.slug === slug) return { rows: [{ id: row.id }] }
      }
      return { rows: [] }
    }

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

    
    if (sql.startsWith('INSERT INTO disciplines')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], name: params[2],
        label_fi: params[3], label_en: params[4],
        ssi_group_id: params[5], ssi_organizer_id: params[6], ssi_create_url: params[7],
        created_at: now, updated_at: now,
      }
      this.disciplines.set(row.id, row)
      return { rows: [row] }
    }

    if (sql.startsWith('SELECT * FROM disciplines WHERE id')) {
      const row = this.disciplines.get(params[0])
      return { rows: row ? [row] : [] }
    }
    
    if (sql.startsWith('SELECT * FROM disciplines WHERE tenant_id')) {
      const rows = [...this.disciplines.values()]
        .filter(d => d.tenant_id === params[0])
        .sort((a,b) => a.created_at - b.created_at)
      return { rows }
    }

    if (sql.startsWith('UPDATE disciplines SET')) {
      const id = params[0]
      const row = this.disciplines.get(id)
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
            row[col] = val
          }
        }
      }
      return { rows: [row] }
    }

    if (sql.startsWith('DELETE FROM disciplines WHERE id')) {
      const existed = this.disciplines.has(params[0])
      this.disciplines.delete(params[0])
      return { rows: existed ? [{ id: params[0] }] : [] }
    }

    if (sql.startsWith('INSERT INTO match_templates')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], discipline_id: params[2], name: params[3],
        ssi_seed_event_id: params[4], ssi_seed_snapshot: params[5] ? JSON.parse(params[5]) : null,
        overrides: params[6] ? JSON.parse(params[6]) : null,
        created_at: now, updated_at: now,
      }
      this.templates.set(row.id, row)
      return { rows: [row] }
    }

    if (sql.startsWith('SELECT * FROM match_templates WHERE id')) {
      const row = this.templates.get(params[0])
      return { rows: row ? [row] : [] }
    }
    
    if (sql.startsWith('SELECT * FROM match_templates WHERE tenant_id')) {
      const rows = [...this.templates.values()]
        .filter(t => t.tenant_id === params[0])
        .sort((a,b) => a.created_at - b.created_at)
      return { rows }
    }

    if (sql.startsWith('UPDATE match_templates SET')) {
      const id = params[0]
      const row = this.templates.get(id)
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

    if (sql.startsWith('DELETE FROM match_templates WHERE id')) {
      const existed = this.templates.has(params[0])
      this.templates.delete(params[0])
      return { rows: existed ? [{ id: params[0] }] : [] }
    }

    
    if (sql.startsWith('INSERT INTO disciplines')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], name: params[2],
        label_fi: params[3], label_en: params[4],
        ssi_group_id: params[5], ssi_organizer_id: params[6], ssi_create_url: params[7],
        created_at: now, updated_at: now,
      }
      this.disciplines.set(row.id, row)
      return { rows: [row] }
    }

    if (sql.startsWith('SELECT * FROM disciplines WHERE id')) {
      const row = this.disciplines.get(params[0])
      return { rows: row ? [row] : [] }
    }
    
    if (sql.startsWith('SELECT * FROM disciplines WHERE tenant_id')) {
      const rows = [...this.disciplines.values()]
        .filter(d => d.tenant_id === params[0])
        .sort((a,b) => a.created_at - b.created_at)
      return { rows }
    }

    if (sql.startsWith('UPDATE disciplines SET')) {
      const id = params[0]
      const row = this.disciplines.get(id)
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
            row[col] = val
          }
        }
      }
      return { rows: [row] }
    }

    if (sql.startsWith('DELETE FROM disciplines WHERE id')) {
      const existed = this.disciplines.has(params[0])
      this.disciplines.delete(params[0])
      return { rows: existed ? [{ id: params[0] }] : [] }
    }

    if (sql.startsWith('INSERT INTO match_templates')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], discipline_id: params[2], name: params[3],
        ssi_seed_event_id: params[4], ssi_seed_snapshot: params[5] ? JSON.parse(params[5]) : null,
        overrides: params[6] ? JSON.parse(params[6]) : null,
        created_at: now, updated_at: now,
      }
      this.templates.set(row.id, row)
      return { rows: [row] }
    }

    if (sql.startsWith('SELECT * FROM match_templates WHERE id')) {
      const row = this.templates.get(params[0])
      return { rows: row ? [row] : [] }
    }
    
    if (sql.startsWith('SELECT * FROM match_templates WHERE tenant_id')) {
      const rows = [...this.templates.values()]
        .filter(t => t.tenant_id === params[0])
        .sort((a,b) => a.created_at - b.created_at)
      return { rows }
    }

    if (sql.startsWith('UPDATE match_templates SET')) {
      const id = params[0]
      const row = this.templates.get(id)
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

    if (sql.startsWith('DELETE FROM match_templates WHERE id')) {
      const existed = this.templates.has(params[0])
      this.templates.delete(params[0])
      return { rows: existed ? [{ id: params[0] }] : [] }
    }

    if (sql.startsWith('INSERT INTO audit_log')) {
      return { rows: [] }
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


describe('GET /api/v1/platform/tenants/:tenantId/disciplines', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('GET', '/api/v1/platform/tenants/ten_123/disciplines');
    expect(res.status).toBe(401);
  });

  it('returns 403 when not a member of the tenant', async () => {
    const { res: resA } = await registerAndGetCookie({ email: 'notin-a@test.com' });
    const { cookie: cookieB } = await registerAndGetCookie({ email: 'notin-b@test.com' });
    const tenantIdA = resA.data.tenant.id;
    const res = await request('GET', `/api/v1/platform/tenants/${tenantIdA}/disciplines`, { cookies: cookieB });
    expect(res.status).toBe(403);
  });

  it('returns 200 with disciplines list for member', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'owner1@test.com' });
    const tenantId = regRes.data.tenant.id;
    
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/disciplines`, { cookies: cookie });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.disciplines)).toBe(true);
  });
});

describe('POST /api/v1/platform/tenants/:tenantId/disciplines', () => {
  it('returns 400 for invalid discipline data', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'owner3@test.com' });
    const tenantId = regRes.data.tenant.id;
    
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie,
      body: { name: 'X' } // too short
    });
    
    expect(res.status).toBe(400);
  });

  it('returns 201 with created discipline', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'owner4@test.com' });
    const tenantId = regRes.data.tenant.id;
    
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie,
      body: { name: 'Practical Pistol', labelFi: 'Pistooli', labelEn: 'Pistol', ssiGroupId: 123, ssiOrganizerId: 456 }
    });
    
    expect(res.status).toBe(201);
    expect(res.data.discipline.name).toBe('Practical Pistol');
    expect(res.data.discipline.id).toBeDefined();
  });
});

describe('GET /api/v1/platform/tenants/:tenantId/disciplines/:id', () => {
  it('returns 404 for non-existent discipline', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'owner5@test.com' });
    const tenantId = regRes.data.tenant.id;
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/disciplines/disc_999`, { cookies: cookie });
    expect(res.status).toBe(404);
  });

  it('returns 200 with discipline', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'owner6@test.com' });
    const tenantId = regRes.data.tenant.id;
    
    const createRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' }
    });
    const discId = createRes.data.discipline.id;
    
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/disciplines/${discId}`, { cookies: cookie });
    expect(res.status).toBe(200);
    expect(res.data.discipline.name).toBe('Test Disc');
  });
});

describe('PATCH /api/v1/platform/tenants/:tenantId/disciplines/:id', () => {
  it('returns 200 and updates discipline', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'owner7@test.com' });
    const tenantId = regRes.data.tenant.id;
    
    const createRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' }
    });
    const discId = createRes.data.discipline.id;
    
    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}/disciplines/${discId}`, {
      cookies: cookie, body: { name: 'Updated Disc', labelFi: 'Uusi' }
    });
    
    expect(res.status).toBe(200);
    expect(res.data.discipline.name).toBe('Updated Disc');
    expect(res.data.discipline.labelFi).toBe('Uusi');
  });
});

describe('DELETE /api/v1/platform/tenants/:tenantId/disciplines/:id', () => {
  it('returns 200 and deletes discipline', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'owner8@test.com' });
    const tenantId = regRes.data.tenant.id;
    
    const createRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' }
    });
    const discId = createRes.data.discipline.id;
    
    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/disciplines/${discId}`, { cookies: cookie });
    expect(res.status).toBe(200);
    
    const getRes = await request('GET', `/api/v1/platform/tenants/${tenantId}/disciplines/${discId}`, { cookies: cookie });
    expect(getRes.status).toBe(404);
  });
});
