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
    this.members = []
    this.disciplines = new Map()
    this.templates = new Map()
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

    // SELECT tenant_id, COUNT(*) — discipline counts for listAccountTenants
    if (sql.startsWith('SELECT tenant_id, COUNT(*)')) {
      return { rows: [] }
    }

    // SELECT DISTINCT t.* FROM tenants — listAccountTenants
    if (sql.startsWith('SELECT DISTINCT t.* FROM tenants')) {
      const accountId = params[0]
      const rows = [...this.tenants.values()]
        .filter(t => t.account_id === accountId)
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // INSERT INTO disciplines
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

    // SELECT * FROM disciplines WHERE id
    if (sql.startsWith('SELECT * FROM disciplines WHERE id')) {
      const row = this.disciplines.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // INSERT INTO match_templates
    // params: [id, tenant_id, discipline_id, name, ssi_seed_event_id, ssi_seed_snapshot, overrides, ...]
    if (sql.startsWith('INSERT INTO match_templates')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], discipline_id: params[2], name: params[3],
        ssi_seed_event_id: params[4],
        ssi_seed_snapshot: params[5] ? JSON.parse(params[5]) : null,
        overrides: params[6] ? JSON.parse(params[6]) : null,
        created_at: now, updated_at: now,
      }
      this.templates.set(row.id, row)
      return { rows: [row] }
    }

    // SELECT * FROM match_templates WHERE id
    if (sql.startsWith('SELECT * FROM match_templates WHERE id')) {
      const row = this.templates.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // INSERT INTO scheduled_events
    // params: [id, tenant_id, template_id, discipline_id, event_name, event_date, created_by]
    if (sql.startsWith('INSERT INTO scheduled_events')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], template_id: params[2],
        discipline_id: params[3], event_name: params[4], event_date: params[5],
        status: 'planned', ssi_references: null, calendar_reference: null,
        assigned_staff: [], error_details: null, created_by: params[6],
        created_at: now, updated_at: now,
      }
      this.events.set(row.id, row)
      return { rows: [row] }
    }

    // SELECT * FROM scheduled_events WHERE id
    if (sql.startsWith('SELECT * FROM scheduled_events WHERE id')) {
      const row = this.events.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // SELECT * FROM scheduled_events WHERE tenant_id
    if (sql.startsWith('SELECT * FROM scheduled_events WHERE tenant_id')) {
      const rows = [...this.events.values()]
        .filter(e => e.tenant_id === params[0])
        .sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
      return { rows }
    }

    // UPDATE scheduled_events SET — updateScheduledEvent
    if (sql.startsWith('UPDATE scheduled_events SET')) {
      const id = params[0]
      const row = this.events.get(id)
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

    // DELETE FROM scheduled_events WHERE id
    if (sql.startsWith('DELETE FROM scheduled_events WHERE id')) {
      const existed = this.events.has(params[0])
      this.events.delete(params[0])
      return { rows: existed ? [{ id: params[0] }] : [] }
    }

    // INSERT INTO event_staffing_needs — auto-populated from template, ignore in tests
    if (sql.startsWith('INSERT INTO event_staffing_needs')) {
      return { rows: [] }
    }

    // INSERT INTO audit_log — fire-and-forget
    if (sql.startsWith('INSERT INTO audit_log')) {
      return { rows: [] }
    }

    throw new Error(`TestPgPool: unhandled query: ${sql.substring(0, 120)}`)
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
  // DELETE /events — stale SSI error classification
//
// The DELETE route distinguishes errors that indicate the SSI event is
// already gone (allow local deletion) from live SSI errors (block deletion).
// This tests the regex pattern used for that classification.
// ============================================================

describe('DELETE /events — stale SSI error classification', () => {
  // Mirrors the regex in the DELETE route catch block
  const isStaleOrMissing = (msg) => /no ssi reference|missing ssi|not found|404|already deleted/i.test(msg)

  it('classifies "No SSI reference ID provided for deletion" as stale', () => {
    expect(isStaleOrMissing('No SSI reference ID provided for deletion')).toBe(true)
  })

  it('classifies "Missing SSI eventId or typeId in references" as stale', () => {
    expect(isStaleOrMissing('Missing SSI eventId or typeId in references: {}')).toBe(true)
  })

  it('classifies "Event not found on SSI (already deleted)" as stale', () => {
    expect(isStaleOrMissing('Event not found on SSI (already deleted)')).toBe(true)
  })

  it('classifies "Staff page HTTP 404" as stale', () => {
    expect(isStaleOrMissing('Staff page HTTP 404')).toBe(true)
  })

  it('classifies "SSI event not found at https://..." as stale', () => {
    expect(isStaleOrMissing('SSI event not found at https://shootnscoreit.com/event/22/123/')).toBe(true)
  })

  it('does NOT classify auth failure as stale', () => {
    expect(isStaleOrMissing('SSI authentication failed — invalid credentials')).toBe(false)
  })

  it('does NOT classify unexpected HTTP error as stale', () => {
    expect(isStaleOrMissing('Failed to access delete page for event 123: HTTP 500')).toBe(false)
  })

  it('does NOT classify network error as stale', () => {
    expect(isStaleOrMissing('fetch failed: ECONNREFUSED')).toBe(false)
  })
})

// ============================================================
// GET /api/v1/platform/tenants/:tenantId/events
// ============================================================

describe('GET /api/v1/platform/tenants/:tenantId/events', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('GET', '/api/v1/platform/tenants/ten_123/events')
    expect(res.status).toBe(401)
  })

  it('returns 200 with empty events list', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-list1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/events`, { cookies: cookie })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.events)).toBe(true)
    expect(res.data.events.length).toBe(0)
  })
})

// ============================================================
// POST /api/v1/platform/tenants/:tenantId/events
// ============================================================

describe('POST /api/v1/platform/tenants/:tenantId/events', () => {
  it('returns 400 when templateId is missing', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-create1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { dates: ['2026-06-15'] },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/templateId/i)
  })

  it('returns 400 when dates array is missing', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-create2@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: 'tmpl_fake' },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/dates/i)
  })

  it('returns 400 for template not found in tenant', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-create3@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: 'tmpl_nonexistent', dates: ['2026-06-15'] },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/template not found/i)
  })

  it('returns 400 for invalid date format', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-create4@test.com' })
    const tenantId = regRes.data.tenant.id
    const discRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' },
    })
    const tmplRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/templates`, {
      cookies: cookie, body: { name: 'Test Template', disciplineId: discRes.data.discipline.id },
    })
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: tmplRes.data.template.id, dates: ['not-a-date'] },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/invalid date format/i)
  })

  it('returns 201 and creates a planned event', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-create5@test.com' })
    const tenantId = regRes.data.tenant.id
    const discRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' },
    })
    const tmplRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/templates`, {
      cookies: cookie, body: { name: 'Test Template', disciplineId: discRes.data.discipline.id },
    })
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: tmplRes.data.template.id, dates: ['2026-06-15'] },
    })
    expect(res.status).toBe(201)
    expect(res.data.event.status).toBe('planned')
    expect(res.data.event.eventDate).toBe('2026-06-15')
    expect(res.data.event.id).toBeDefined()
  })

  it('returns 201 and creates multiple events in batch', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-create6@test.com' })
    const tenantId = regRes.data.tenant.id
    const discRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' },
    })
    const tmplRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/templates`, {
      cookies: cookie, body: { name: 'Test Template', disciplineId: discRes.data.discipline.id },
    })
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: tmplRes.data.template.id, dates: ['2026-06-15', '2026-06-22', '2026-06-29'] },
    })
    expect(res.status).toBe(201)
    expect(Array.isArray(res.data.results)).toBe(true)
    expect(res.data.results.length).toBe(3)
    expect(res.data.results.every(r => r.success)).toBe(true)
  })
})

// ============================================================
// GET /api/v1/platform/tenants/:tenantId/events/:id
// ============================================================

describe('GET /api/v1/platform/tenants/:tenantId/events/:id', () => {
  it('returns 404 for non-existent event', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-get1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/events/evt_nonexistent`, { cookies: cookie })
    expect(res.status).toBe(404)
  })

  it('returns 200 with event details', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-get2@test.com' })
    const tenantId = regRes.data.tenant.id
    const discRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' },
    })
    const tmplRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/templates`, {
      cookies: cookie, body: { name: 'Test Template', disciplineId: discRes.data.discipline.id },
    })
    const createRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: tmplRes.data.template.id, dates: ['2026-06-22'] },
    })
    const eventId = createRes.data.event.id
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/events/${eventId}`, { cookies: cookie })
    expect(res.status).toBe(200)
    expect(res.data.event.id).toBe(eventId)
    expect(res.data.event.status).toBe('planned')
  })
})

// ============================================================
// PATCH /api/v1/platform/tenants/:tenantId/events/:id
// ============================================================

describe('PATCH /api/v1/platform/tenants/:tenantId/events/:id', () => {
  async function createEvent(cookie, tenantId) {
    const discRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' },
    })
    const tmplRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/templates`, {
      cookies: cookie, body: { name: 'Test Template', disciplineId: discRes.data.discipline.id },
    })
    const evtRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: tmplRes.data.template.id, dates: ['2026-07-06'] },
    })
    return evtRes.data.event.id
  }

  it('returns 400 for unknown field', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-patch1@test.com' })
    const tenantId = regRes.data.tenant.id
    const eventId = await createEvent(cookie, tenantId)
    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}/events/${eventId}`, {
      cookies: cookie,
      body: { unknownField: 'value' },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/unknown field/i)
  })

  it('returns 200 and updates event status', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-patch2@test.com' })
    const tenantId = regRes.data.tenant.id
    const eventId = await createEvent(cookie, tenantId)
    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}/events/${eventId}`, {
      cookies: cookie,
      body: { status: 'cancelled' },
    })
    expect(res.status).toBe(200)
    expect(res.data.event.status).toBe('cancelled')
  })
})

// ============================================================
// DELETE /api/v1/platform/tenants/:tenantId/events/:id
// ============================================================

describe('DELETE /api/v1/platform/tenants/:tenantId/events/:id', () => {
  async function createEvent(cookie, tenantId) {
    const discRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/disciplines`, {
      cookies: cookie, body: { name: 'Test Disc' },
    })
    const tmplRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/templates`, {
      cookies: cookie, body: { name: 'Test Template', disciplineId: discRes.data.discipline.id },
    })
    const evtRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/events`, {
      cookies: cookie,
      body: { templateId: tmplRes.data.template.id, dates: ['2026-07-13'] },
    })
    return evtRes.data.event.id
  }

  it('returns 404 for non-existent event', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-del1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/events/evt_nonexistent`, { cookies: cookie })
    expect(res.status).toBe(404)
  })

  it('returns 200 and deletes a planned event', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'evt-del2@test.com' })
    const tenantId = regRes.data.tenant.id
    const eventId = await createEvent(cookie, tenantId)
    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/events/${eventId}`, { cookies: cookie })
    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    const getRes = await request('GET', `/api/v1/platform/tenants/${tenantId}/events/${eventId}`, { cookies: cookie })
    expect(getRes.status).toBe(404)
  })
})
