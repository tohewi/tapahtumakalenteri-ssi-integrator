// ============================================================
// Platform Routes — Shared Test Infrastructure
//
// Exports:
//   - TestRedisStore — in-memory Redis mock (sessions)
//   - TestPgPool     — in-memory PostgreSQL mock (all platform tables)
//   - makeTestApp    — creates Express app with platform router
//   - request()      — HTTP helper
//   - registerAndGetCookie() — registers account, returns session cookie
//   - uniqueIp()     — generates distinct IPs (rate-limit isolation)
//
// Lifecycle hooks (beforeAll / beforeEach / afterAll) are declared here
// so each test file that imports this module gets a fresh mock DB/Redis
// before every test and a single shared server for the suite.
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

// ---- In-memory PostgreSQL mock (all platform tables) ----

class TestPgPool {
  constructor() {
    this.accounts = new Map()
    this.tenants = new Map()
    this.disciplines = new Map()
    this.templates = new Map()
    this.members = []
    this.invitations = []
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

    // ---- audit_log (fire-and-forget, ignore in tests) ----
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
    // Note: ordering matters — more-specific patterns first.

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
    // Used by last-owner protection check — params: [tenant_id, exclude_member_id]
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

    // UPDATE tenant_invitations SET status = 'accepted' / 'expired' — catch-all (accept flow)
    if (sql.startsWith('UPDATE tenant_invitations')) {
      return { rows: [] }
    }

    // ---- disciplines ----

    // INSERT INTO disciplines
    // params: [id, tenant_id, name, label_fi, label_en, ssi_group_id, ssi_organizer_id, ssi_create_url]
    if (sql.startsWith('INSERT INTO disciplines')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], name: params[2],
        label_fi: params[3] || '', label_en: params[4] || '',
        ssi_group_id: params[5] || null, ssi_organizer_id: params[6] || null,
        ssi_create_url: params[7] || null,
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
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // UPDATE disciplines SET ... WHERE id = $1
    // params: [discipline_id, ...field_values]
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
            row[m[1]] = params[parseInt(m[2]) - 1]
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

    // ---- match_templates ----

    // INSERT INTO match_templates
    // params: [id, tenant_id, discipline_id, name, ssi_seed_event_id,
    //          ssi_seed_snapshot, overrides, calendar_template, staffing_rules]
    if (sql.startsWith('INSERT INTO match_templates')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], discipline_id: params[2], name: params[3],
        ssi_seed_event_id: params[4] || null,
        ssi_seed_snapshot: params[5] ? JSON.parse(params[5]) : null,
        overrides: params[6] ? JSON.parse(params[6]) : {},
        calendar_template: params[7] ? JSON.parse(params[7]) : {},
        staffing_rules: params[8] ? JSON.parse(params[8]) : {},
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
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    if (sql.startsWith('SELECT * FROM match_templates WHERE discipline_id')) {
      const rows = [...this.templates.values()]
        .filter(t => t.discipline_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // UPDATE match_templates SET ... WHERE id = $1
    // params: [template_id, ...field_values]
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
            const val = params[parseInt(m[2]) - 1]
            try { row[m[1]] = JSON.parse(val) } catch { row[m[1]] = val }
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
