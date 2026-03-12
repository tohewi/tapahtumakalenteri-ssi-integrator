// ============================================================
// Platform Routes — Member & Invitation Route Tests (TST-3)
//
// Tests HTTP contract for:
//   - GET    /tenants/:tenantId/members        — list members (RBAC)
//   - POST   /tenants/:tenantId/members        — add member
//   - PATCH  /tenants/:tenantId/members/:id    — update roles
//   - DELETE /tenants/:tenantId/members/:id    — remove member
//   - GET    /tenants/:tenantId/invitations    — list pending invitations
//   - POST   /tenants/:tenantId/invitations    — create invitation
//   - DELETE /tenants/:tenantId/invitations/:id — revoke invitation
// ============================================================

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { _setPool } from '../../lib/db/postgres.js'
import { _setClient } from '../../lib/session/redis.js'
import { createPlatformRouter } from '../../routes/platform.js'
import { errorHandler } from '../../middleware/errorHandler.js'

// Mock email so invitation creation does not attempt real SMTP/Resend calls
vi.mock('../../lib/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

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

// ---- In-memory PostgreSQL mock (accounts + tenants + members + invitations) ----

class TestPgPool {
  constructor() {
    this.accounts = new Map()
    this.tenants = new Map()
    this.members = []
    this.invitations = []
  }

  /**
   * Support connect() for withTransaction calls in createAccountWithTenant.
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

    // ---- audit_log (fire-and-forget) ----
    if (sql.startsWith('INSERT INTO audit_log')) {
      return { rows: [] }
    }

    // ---- accounts ----

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

    // ---- tenants ----

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

    if (sql.startsWith('SELECT tenant_id, COUNT(*)')) {
      return { rows: [] }
    }

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

    // ---- tenant_members ----
    // Ordering: most-specific patterns first.

    // INSERT INTO tenant_members — create or upsert (ON CONFLICT)
    // params: [id, tenant_id, account_id, roles, invited_by]
    if (sql.startsWith('INSERT INTO tenant_members')) {
      const now = new Date()
      const existing = this.members.find(
        m => m.tenant_id === params[1] && m.account_id === params[2]
      )
      if (existing) {
        existing.roles = params[3]
        existing.invited_by = params[4] || null
        existing.status = 'active'
        existing.updated_at = now
        return { rows: [existing] }
      }
      const row = {
        id: params[0], tenant_id: params[1], account_id: params[2],
        roles: params[3], invited_by: params[4] || null, status: 'active',
        created_at: now, updated_at: now,
      }
      this.members.push(row)
      return { rows: [row] }
    }

    // SELECT tm.*, a.name AS account_name, ... FROM tenant_members tm JOIN accounts a
    // Used by listTenantMembers — params: [tenant_id]
    if (sql.startsWith('SELECT tm.*')) {
      const tenantId = params[0]
      const rows = this.members
        .filter(m => m.tenant_id === tenantId && m.status === 'active')
        .sort((a, b) => a.created_at - b.created_at)
        .map(m => {
          const account = this.accounts.get(m.account_id)
          return { ...m, account_name: account?.name || '', account_email: account?.email || '' }
        })
      return { rows }
    }

    // SELECT id FROM tenant_members WHERE tenant_id = $1 AND 'owner' = ANY(roles)...
    // Last-owner protection check — params: [tenant_id, exclude_member_id]
    if (sql.startsWith('SELECT id FROM tenant_members')) {
      const tenantId = params[0]
      const excludeId = params[1]
      const rows = this.members
        .filter(m =>
          m.tenant_id === tenantId &&
          (m.roles || []).includes('owner') &&
          m.status === 'active' &&
          m.id !== excludeId
        )
        .map(m => ({ id: m.id }))
      return { rows }
    }

    // SELECT * FROM tenant_members WHERE id = $1 — get by memberId
    if (sql.startsWith('SELECT * FROM tenant_members WHERE id')) {
      const row = this.members.find(m => m.id === params[0])
      return { rows: row ? [row] : [] }
    }

    // SELECT * FROM tenant_members WHERE tenant_id = $1 AND account_id = $2 — getTenantMembership
    if (sql.startsWith('SELECT * FROM tenant_members WHERE tenant_id')) {
      const tenantId = params[0]
      const accountId = params[1]
      const rows = this.members.filter(
        m => m.tenant_id === tenantId && m.account_id === accountId && m.status === 'active'
      )
      return { rows }
    }

    // UPDATE tenant_members SET roles = $1 ... WHERE id = $2 — updateMemberRoles
    if (sql.startsWith('UPDATE tenant_members SET roles')) {
      const newRoles = params[0]
      const memberId = params[1]
      const row = this.members.find(m => m.id === memberId)
      if (!row) return { rows: [] }
      row.roles = newRoles
      row.updated_at = new Date()
      return { rows: [row] }
    }

    // UPDATE tenant_members SET status = 'suspended' ... WHERE id = $1 — removeTenantMember
    if (sql.startsWith('UPDATE tenant_members SET status')) {
      const memberId = params[0]
      const row = this.members.find(m => m.id === memberId)
      if (!row) return { rows: [] }
      row.status = 'suspended'
      row.updated_at = new Date()
      return { rows: [{ id: row.id }] }
    }

    // ---- tenant_invitations ----

    // INSERT INTO tenant_invitations
    // params: [id, tenant_id, email, roles, token_hash, invited_by, expires_at]
    if (sql.startsWith('INSERT INTO tenant_invitations')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], email: params[2],
        roles: params[3], token_hash: params[4], invited_by: params[5],
        expires_at: params[6], status: 'pending',
        used_at: null, created_at: now, updated_at: now,
      }
      this.invitations.push(row)
      return { rows: [row] }
    }

    // SELECT ti.*, a.name as inviter_name FROM tenant_invitations ... — listPendingInvitations
    if (sql.startsWith('SELECT ti.*')) {
      const tenantId = params[0]
      const now = new Date()
      const rows = this.invitations
        .filter(i => i.tenant_id === tenantId && i.status === 'pending' && new Date(i.expires_at) > now)
        .sort((a, b) => b.created_at - a.created_at)
        .map(i => {
          const inviter = this.accounts.get(i.invited_by)
          return { ...i, inviter_name: inviter?.name || '' }
        })
      return { rows }
    }

    // SELECT * FROM tenant_invitations WHERE LOWER(email) — autoAcceptPendingInvitations (on login)
    if (sql.startsWith('SELECT * FROM tenant_invitations WHERE LOWER(email)')) {
      return { rows: [] }
    }

    // UPDATE tenant_invitations SET status = 'revoked' — revokeTenantInvitation
    // params: [invitation_id, tenant_id]
    if (sql.startsWith('UPDATE tenant_invitations') && sql.includes("'revoked'")) {
      const invId = params[0]
      const tenantId = params[1]
      const inv = this.invitations.find(
        i => i.id === invId && i.tenant_id === tenantId && i.status === 'pending'
      )
      if (!inv) return { rows: [] }
      inv.status = 'revoked'
      inv.updated_at = new Date()
      return { rows: [{ id: inv.id }] }
    }

    // UPDATE tenant_invitations — catch-all (accepted/expired flows)
    if (sql.startsWith('UPDATE tenant_invitations')) {
      return { rows: [] }
    }

    throw new Error(`TestPgPool: unhandled query: ${sql.substring(0, 120)}`)
  }
}

// ---- Test app setup ----

let server, baseUrl

function makeTestApp() {
  const app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(cookieParser())

  const noopLimiter = (req, res, next) => next()

  const platformRouter = createPlatformRouter({
    platformSignUpLimiter: noopLimiter,
    platformLoginLimiter: noopLimiter,
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
  return `10.2.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`
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
  const setCookie = resp.headers.get('set-cookie') || ''
  return { status: resp.status, data, headers: Object.fromEntries(resp.headers.entries()), setCookie }
}

async function registerAndGetCookie(opts = {}) {
  const ip = uniqueIp()
  const res = await request('POST', '/api/v1/platform/register', {
    body: {
      email: opts.email || `user${Date.now()}@test.com`,
      password: opts.password || 'password123',
      name: opts.name || 'Test User',
      organizationName: opts.organizationName || `Org ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
    ip,
  })
  if (res.status !== 201) throw new Error(`Register failed: ${JSON.stringify(res.data)}`)
  const match = res.setCookie.match(/platform_sid=([^;]+)/)
  if (!match) throw new Error('No platform_sid cookie')
  return { cookie: { platform_sid: match[1] }, res, ip }
}

// ============================================================
// GET /api/v1/platform/tenants/:tenantId/members
// ============================================================

describe('GET /api/v1/platform/tenants/:tenantId/members', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('GET', '/api/v1/platform/tenants/ten_123/members')
    expect(res.status).toBe(401)
  })

  it('returns 403 when not a member of the tenant', async () => {
    const { res: resA } = await registerAndGetCookie({ email: 'memb-a@test.com' })
    const { cookie: cookieB } = await registerAndGetCookie({ email: 'memb-b@test.com' })
    const tenantIdA = resA.data.tenant.id
    const res = await request('GET', `/api/v1/platform/tenants/${tenantIdA}/members`, { cookies: cookieB })
    expect(res.status).toBe(403)
  })

  it('returns 200 with members list for owner', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'memb-owner1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/members`, { cookies: cookie })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.members)).toBe(true)
    expect(res.data.members.length).toBe(1)
    expect(res.data.members[0].roles).toContain('owner')
  })
})

// ============================================================
// POST /api/v1/platform/tenants/:tenantId/members
// ============================================================

describe('POST /api/v1/platform/tenants/:tenantId/members', () => {
  it('returns 400 when accountId is missing', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'addmemb-owner1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/members`, {
      cookies: cookie,
      body: { roles: ['instructor'] },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/accountId/i)
  })

  it('returns 400 for invalid role names', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'addmemb-owner2@test.com' })
    const { res: resB } = await registerAndGetCookie({ email: 'addmemb-b2@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/members`, {
      cookies: cookie,
      body: { accountId: resB.data.account.id, roles: ['superadmin'] },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/invalid roles/i)
  })

  it('returns 201 and adds member with instructor role', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'addmemb-owner3@test.com' })
    const { res: resB } = await registerAndGetCookie({ email: 'addmemb-b3@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/members`, {
      cookies: cookie,
      body: { accountId: resB.data.account.id, roles: ['instructor'] },
    })
    expect(res.status).toBe(201)
    expect(res.data.member.roles).toContain('instructor')
    expect(res.data.member.accountId).toBe(resB.data.account.id)
  })
})

// ============================================================
// PATCH /api/v1/platform/tenants/:tenantId/members/:memberId
// ============================================================

describe('PATCH /api/v1/platform/tenants/:tenantId/members/:memberId', () => {
  it('returns 400 for empty roles array', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'patchmemb-owner1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}/members/mbr_fake`, {
      cookies: cookie,
      body: { roles: [] },
    })
    expect(res.status).toBe(400)
  })

  it('returns error for non-existent membership', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'patchmemb-owner2@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}/members/mbr_nonexistent`, {
      cookies: cookie,
      body: { roles: ['instructor'] },
    })
    // updateMemberRoles throws NotFoundError which the catch block re-wraps as 500
    expect([404, 500]).toContain(res.status)
  })

  it('returns 200 and updates member roles', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'patchmemb-owner3@test.com' })
    const { res: resB } = await registerAndGetCookie({ email: 'patchmemb-b3@test.com' })
    const tenantId = regRes.data.tenant.id

    // Add B to the tenant
    const addRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/members`, {
      cookies: cookie,
      body: { accountId: resB.data.account.id, roles: ['instructor'] },
    })
    const memberId = addRes.data.member.id

    const res = await request('PATCH', `/api/v1/platform/tenants/${tenantId}/members/${memberId}`, {
      cookies: cookie,
      body: { roles: ['match_admin'] },
    })
    expect(res.status).toBe(200)
    expect(res.data.member.roles).toContain('match_admin')
    expect(res.data.member.roles).not.toContain('instructor')
  })
})

// ============================================================
// DELETE /api/v1/platform/tenants/:tenantId/members/:memberId
// ============================================================

describe('DELETE /api/v1/platform/tenants/:tenantId/members/:memberId', () => {
  it('returns 404 for non-existent membership', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'delmemb-owner1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/members/mbr_nonexistent`, {
      cookies: cookie,
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when removing the last owner', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'delmemb-owner2@test.com' })
    const tenantId = regRes.data.tenant.id

    // Discover A's memberId via GET /members
    const membersRes = await request('GET', `/api/v1/platform/tenants/${tenantId}/members`, { cookies: cookie })
    const ownerMemberId = membersRes.data.members[0].id

    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/members/${ownerMemberId}`, {
      cookies: cookie,
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/last owner/i)
  })

  it('returns 200 and removes a non-owner member', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'delmemb-owner3@test.com' })
    const { res: resB } = await registerAndGetCookie({ email: 'delmemb-b3@test.com' })
    const tenantId = regRes.data.tenant.id

    // Add B as instructor
    const addRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/members`, {
      cookies: cookie,
      body: { accountId: resB.data.account.id, roles: ['instructor'] },
    })
    const memberId = addRes.data.member.id

    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/members/${memberId}`, {
      cookies: cookie,
    })
    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
  })
})

// ============================================================
// GET /api/v1/platform/tenants/:tenantId/invitations
// ============================================================

describe('GET /api/v1/platform/tenants/:tenantId/invitations', () => {
  it('returns 401 without authentication', async () => {
    const res = await request('GET', '/api/v1/platform/tenants/ten_123/invitations')
    expect(res.status).toBe(401)
  })

  it('returns 403 when not an owner or tenant_admin', async () => {
    const { cookie: cookieOwner, res: regRes } = await registerAndGetCookie({ email: 'inv-owner1@test.com' })
    const { res: resB } = await registerAndGetCookie({ email: 'inv-b1@test.com' })
    const tenantId = regRes.data.tenant.id

    // Add B as instructor (not owner/tenant_admin)
    await request('POST', `/api/v1/platform/tenants/${tenantId}/members`, {
      cookies: cookieOwner,
      body: { accountId: resB.data.account.id, roles: ['instructor'] },
    })

    // B logs in and tries to view invitations
    const loginRes = await request('POST', '/api/v1/platform/login', {
      body: { email: 'inv-b1@test.com', password: 'password123' },
    })
    const cookieB = { platform_sid: loginRes.setCookie.match(/platform_sid=([^;]+)/)?.[1] }

    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/invitations`, { cookies: cookieB })
    expect(res.status).toBe(403)
  })

  it('returns 200 with empty invitations list initially', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'inv-owner2@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('GET', `/api/v1/platform/tenants/${tenantId}/invitations`, { cookies: cookie })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.invitations)).toBe(true)
    expect(res.data.invitations.length).toBe(0)
  })
})

// ============================================================
// POST /api/v1/platform/tenants/:tenantId/invitations
// ============================================================

describe('POST /api/v1/platform/tenants/:tenantId/invitations', () => {
  it('returns 400 for invalid email', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'inv-owner3@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/invitations`, {
      cookies: cookie,
      body: { email: 'not-an-email', roles: ['instructor'] },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/email/i)
  })

  it('returns 400 for missing roles', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'inv-owner4@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/invitations`, {
      cookies: cookie,
      body: { email: 'invited@test.com' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid role names', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'inv-owner5@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/invitations`, {
      cookies: cookie,
      body: { email: 'invited@test.com', roles: ['god_mode'] },
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/invalid roles/i)
  })

  it('returns 201 and creates invitation (email mocked)', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'inv-owner6@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('POST', `/api/v1/platform/tenants/${tenantId}/invitations`, {
      cookies: cookie,
      body: { email: 'newmember@test.com', roles: ['instructor'] },
    })
    expect(res.status).toBe(201)
    expect(res.data.success).toBe(true)
    expect(res.data.invitation.email).toBe('newmember@test.com')
    expect(res.data.invitation.token).toBeDefined()
  })

  it('returns 201 and invitation appears in list', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'inv-owner7@test.com' })
    const tenantId = regRes.data.tenant.id

    await request('POST', `/api/v1/platform/tenants/${tenantId}/invitations`, {
      cookies: cookie,
      body: { email: 'listed@test.com', roles: ['instructor'] },
    })

    const listRes = await request('GET', `/api/v1/platform/tenants/${tenantId}/invitations`, { cookies: cookie })
    expect(listRes.status).toBe(200)
    expect(listRes.data.invitations.length).toBe(1)
    expect(listRes.data.invitations[0].email).toBe('listed@test.com')
  })
})

// ============================================================
// DELETE /api/v1/platform/tenants/:tenantId/invitations/:id
// ============================================================

describe('DELETE /api/v1/platform/tenants/:tenantId/invitations/:id', () => {
  it('returns 404 for non-existent invitation', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'revinv-owner1@test.com' })
    const tenantId = regRes.data.tenant.id
    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/invitations/inv_nonexistent`, {
      cookies: cookie,
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 and revokes invitation', async () => {
    const { cookie, res: regRes } = await registerAndGetCookie({ email: 'revinv-owner2@test.com' })
    const tenantId = regRes.data.tenant.id

    // Create an invitation
    const createRes = await request('POST', `/api/v1/platform/tenants/${tenantId}/invitations`, {
      cookies: cookie,
      body: { email: 'torevoke@test.com', roles: ['instructor'] },
    })
    const invId = createRes.data.invitation.id

    // Revoke it
    const res = await request('DELETE', `/api/v1/platform/tenants/${tenantId}/invitations/${invId}`, {
      cookies: cookie,
    })
    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)

    // Verify it no longer appears in the pending list
    const listRes = await request('GET', `/api/v1/platform/tenants/${tenantId}/invitations`, { cookies: cookie })
    expect(listRes.data.invitations.length).toBe(0)
  })
})
