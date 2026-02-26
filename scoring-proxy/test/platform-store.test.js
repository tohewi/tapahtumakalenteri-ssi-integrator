// ============================================================
// Platform Store — Unit Tests
//
// Tests account CRUD, authentication, tenant CRUD, and platform
// sessions. Uses in-memory mocks for both PostgreSQL and Redis.
// ============================================================

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { _setClient } from '../lib/session/redis.js'
import { _setPool } from '../lib/db/postgres.js'
import { NotFoundError } from '../lib/errors/AppError.js'
import {
  createAccount,
  authenticateAccount,
  getAccount,
  updateAccount,
  changePassword,
  createAccountWithTenant,
  createTenant,
  getTenant,
  listAccountTenants,
  updateTenant,
  createPlatformSession,
  getPlatformSession,
  deletePlatformSession,
  createDiscipline,
  getDiscipline,
  listTenantDisciplines,
  updateDiscipline,
  deleteDiscipline,
  createMatchTemplate,
  getMatchTemplate,
  listDisciplineTemplates,
  listTenantTemplates,
  updateMatchTemplate,
  deleteMatchTemplate,
  getTenantMembership,
  listTenantMembers,
  addTenantMember,
  updateMemberRoles,
  removeTenantMember,
  hasRequiredRole,
  TENANT_ROLES,
} from '../lib/db/platform-store.js'

// ---- In-memory Redis mock (for sessions) ----

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

// ---- In-memory PostgreSQL mock (for accounts + tenants) ----

class TestPgPool {
  constructor() {
    this.accounts = new Map()
    this.tenants = new Map()
    this.disciplines = new Map()
    this.templates = new Map()
    this.members = new Map()
    this.transactionCalls = [] // tracks BEGIN/COMMIT/ROLLBACK for assertions
  }

  /**
   * Support connect() for transaction tests.
   * Returns a lightweight client that delegates to pool.query() and
   * records BEGIN/COMMIT/ROLLBACK calls for test assertions.
   */
  async connect() {
    const pool = this
    return {
      query: async (text, params) => {
        const sql = text.replace(/\s+/g, ' ').trim()
        // Record but ignore transaction control statements
        if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) {
          pool.transactionCalls.push(sql)
          return { rows: [] }
        }
        return pool.query(text, params)
      },
      release: () => {},
    }
  }

  async query(text, params = []) {
    const sql = text.replace(/\s+/g, ' ').trim()

    // SELECT id FROM accounts WHERE LOWER(email) = $1
    if (sql.startsWith('SELECT id FROM accounts WHERE LOWER')) {
      const email = params[0]
      for (const row of this.accounts.values()) {
        if (row.email.toLowerCase() === email.toLowerCase()) {
          return { rows: [{ id: row.id }] }
        }
      }
      return { rows: [] }
    }

    // SELECT id FROM accounts WHERE id = $1 FOR UPDATE (transaction lock)
    if (sql.startsWith('SELECT id FROM accounts WHERE id')) {
      const row = this.accounts.get(params[0])
      return { rows: row ? [{ id: row.id }] : [] }
    }

    // INSERT INTO accounts
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

    // SELECT * FROM accounts WHERE LOWER(email) = $1
    if (sql.startsWith('SELECT * FROM accounts WHERE LOWER(email)')) {
      const email = params[0]
      for (const row of this.accounts.values()) {
        if (row.email.toLowerCase() === email.toLowerCase()) {
          return { rows: [row] }
        }
      }
      return { rows: [] }
    }

    // SELECT password_hash FROM accounts WHERE id = $1
    if (sql.startsWith('SELECT password_hash FROM accounts WHERE id')) {
      const row = this.accounts.get(params[0])
      return { rows: row ? [{ password_hash: row.password_hash }] : [] }
    }

    // UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2
    if (sql.startsWith('UPDATE accounts SET password_hash')) {
      const newHash = params[0]
      const accountId = params[1]
      const row = this.accounts.get(accountId)
      if (row) {
        row.password_hash = newHash
        row.updated_at = new Date()
      }
      return { rows: row ? [row] : [] }
    }

    // SELECT * FROM accounts WHERE id = $1
    if (sql.startsWith('SELECT * FROM accounts WHERE id')) {
      const row = this.accounts.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // UPDATE accounts SET tenants = tenants || $1::jsonb ...
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

    // UPDATE accounts SET ... WHERE id = $1 RETURNING *
    if (sql.startsWith('UPDATE accounts SET')) {
      const accountId = params[0]
      const row = this.accounts.get(accountId)
      if (!row) return { rows: [] }
      // Parse SET clauses from params (name=$2, tenants=$3, etc.)
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

    // INSERT INTO tenants
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

    // SELECT * FROM tenants WHERE id = $1
    if (sql.startsWith('SELECT * FROM tenants WHERE id')) {
      const row = this.tenants.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // SELECT * FROM tenants WHERE account_id = $1
    if (sql.startsWith('SELECT * FROM tenants WHERE account_id')) {
      const rows = [...this.tenants.values()]
        .filter(t => t.account_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // UPDATE tenants SET ... WHERE id = $1 RETURNING *
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

    // INSERT INTO disciplines
    if (sql.startsWith('INSERT INTO disciplines')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], name: params[2],
        label_fi: params[3], label_en: params[4],
        ssi_group_id: params[5], ssi_organizer_id: params[6],
        created_at: now, updated_at: now,
      }
      this.disciplines.set(row.id, row)
      return { rows: [row] }
    }

    // SELECT * FROM disciplines WHERE id = $1
    if (sql.startsWith('SELECT * FROM disciplines WHERE id')) {
      const row = this.disciplines.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // SELECT * FROM disciplines WHERE tenant_id = $1
    if (sql.startsWith('SELECT * FROM disciplines WHERE tenant_id')) {
      const rows = [...this.disciplines.values()]
        .filter(d => d.tenant_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // UPDATE disciplines SET ... WHERE id = $1 RETURNING *
    if (sql.startsWith('UPDATE disciplines SET')) {
      const disId = params[0]
      const row = this.disciplines.get(disId)
      if (!row) return { rows: [] }
      const setMatch = sql.match(/SET (.+) WHERE/i)
      if (setMatch) {
        const clauses = setMatch[1].split(',').map(c => c.trim())
        for (const clause of clauses) {
          if (clause === 'updated_at = NOW()') { row.updated_at = new Date(); continue }
          const m = clause.match(/(\w+)\s*=\s*\$(\d+)/)
          if (m) {
            const col = m[1]
            row[col] = params[parseInt(m[2]) - 1]
          }
        }
      }
      return { rows: [row] }
    }

    // SELECT tenant_id, COUNT(*)::int AS count FROM disciplines WHERE tenant_id IN (...) GROUP BY tenant_id
    if (sql.includes('FROM disciplines WHERE tenant_id IN') && sql.includes('GROUP BY')) {
      const tenantIds = new Set(params)
      const counts = new Map()
      for (const d of this.disciplines.values()) {
        if (tenantIds.has(d.tenant_id)) {
          counts.set(d.tenant_id, (counts.get(d.tenant_id) || 0) + 1)
        }
      }
      const rows = [...counts.entries()].map(([tid, c]) => ({ tenant_id: tid, count: c }))
      return { rows }
    }

    // DELETE FROM disciplines WHERE id = $1 RETURNING id
    if (sql.startsWith('DELETE FROM disciplines WHERE id')) {
      const disId = params[0]
      const existed = this.disciplines.has(disId)
      this.disciplines.delete(disId)
      return { rows: existed ? [{ id: disId }] : [] }
    }

    // INSERT INTO match_templates
    if (sql.startsWith('INSERT INTO match_templates')) {
      const now = new Date()
      const row = {
        id: params[0], tenant_id: params[1], discipline_id: params[2], name: params[3],
        ssi_seed_event_id: params[4], ssi_seed_snapshot: params[5] ? JSON.parse(params[5]) : null,
        overrides: JSON.parse(params[6]), calendar_template: JSON.parse(params[7]),
        staffing_rules: JSON.parse(params[8]),
        created_at: now, updated_at: now,
      }
      this.templates.set(row.id, row)
      return { rows: [row] }
    }

    // SELECT * FROM match_templates WHERE id = $1
    if (sql.startsWith('SELECT * FROM match_templates WHERE id')) {
      const row = this.templates.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // SELECT * FROM match_templates WHERE discipline_id = $1
    if (sql.startsWith('SELECT * FROM match_templates WHERE discipline_id')) {
      const rows = [...this.templates.values()]
        .filter(t => t.discipline_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // SELECT * FROM match_templates WHERE tenant_id = $1
    if (sql.startsWith('SELECT * FROM match_templates WHERE tenant_id')) {
      const rows = [...this.templates.values()]
        .filter(t => t.tenant_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // UPDATE match_templates SET ... WHERE id = $1 RETURNING *
    if (sql.startsWith('UPDATE match_templates SET')) {
      const tplId = params[0]
      const row = this.templates.get(tplId)
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

    // DELETE FROM match_templates WHERE id = $1 RETURNING id
    if (sql.startsWith('DELETE FROM match_templates WHERE id')) {
      const tplId = params[0]
      const existed = this.templates.has(tplId)
      this.templates.delete(tplId)
      return { rows: existed ? [{ id: tplId }] : [] }
    }

    // INSERT INTO tenant_members
    if (sql.startsWith('INSERT INTO tenant_members')) {
      const now = new Date()
      // Check for ON CONFLICT (upsert)
      const isUpsert = sql.includes('ON CONFLICT')
      const tenantId = params[1]
      const accountId = params[2]
      const roles = params[3]
      const invitedBy = params[4] || null

      // Check for existing membership (for upsert)
      let existing = null
      if (isUpsert) {
        for (const m of this.members.values()) {
          if (m.tenant_id === tenantId && m.account_id === accountId) {
            existing = m
            break
          }
        }
      }

      if (existing) {
        existing.roles = roles
        existing.invited_by = invitedBy
        existing.status = 'active'
        existing.updated_at = now
        return { rows: [existing] }
      }

      const row = {
        id: params[0], tenant_id: tenantId, account_id: accountId,
        roles, invited_by: invitedBy, status: 'active',
        created_at: now, updated_at: now,
      }
      this.members.set(row.id, row)
      return { rows: [row] }
    }

    // SELECT tm.*, a.name AS account_name ... FROM tenant_members tm JOIN accounts a ...
    // NOTE: Must come before simpler tenant_members checks to avoid false match
    if (sql.includes('FROM tenant_members tm') && sql.includes('JOIN accounts a')) {
      const tenantId = params[0]
      const rows = [...this.members.values()]
        .filter(m => m.tenant_id === tenantId && m.status === 'active')
        .map(m => {
          const account = this.accounts.get(m.account_id)
          return { ...m, account_name: account?.name || '', account_email: account?.email || '' }
        })
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // SELECT DISTINCT t.* FROM tenants t LEFT JOIN tenant_members tm ...
    if (sql.includes('SELECT DISTINCT t.*') && sql.includes('tenant_members')) {
      const accountId = params[0]
      const memberTenantIds = new Set(
        [...this.members.values()]
          .filter(m => m.account_id === accountId && m.status === 'active')
          .map(m => m.tenant_id)
      )
      const rows = [...this.tenants.values()]
        .filter(t => t.account_id === accountId || memberTenantIds.has(t.id))
        .sort((a, b) => a.created_at - b.created_at)
      return { rows }
    }

    // SELECT * FROM tenant_members WHERE tenant_id = $1 AND account_id = $2 AND status = 'active'
    if (sql.includes('FROM tenant_members') && sql.includes('tenant_id') && sql.includes('account_id') && sql.includes('active')) {
      const rows = [...this.members.values()]
        .filter(m => m.tenant_id === params[0] && m.account_id === params[1] && m.status === 'active')
      return { rows }
    }

    // SELECT * FROM tenant_members WHERE id = $1
    if (sql.startsWith('SELECT * FROM tenant_members WHERE id')) {
      const row = this.members.get(params[0])
      return { rows: row ? [row] : [] }
    }

    // SELECT id FROM tenant_members WHERE tenant_id = $1 AND 'owner' = ANY(roles) AND status = 'active' AND id != $2
    if (sql.includes('FROM tenant_members') && sql.includes('owner') && sql.includes('ANY(roles)')) {
      const rows = [...this.members.values()]
        .filter(m => m.tenant_id === params[0] && (m.roles || []).includes('owner') && m.status === 'active' && m.id !== params[1])
      return { rows: rows.map(r => ({ id: r.id })) }
    }

    // UPDATE tenant_members SET roles = $1, updated_at = NOW() WHERE id = $2 RETURNING *
    if (sql.startsWith('UPDATE tenant_members SET roles')) {
      const newRoles = params[0]
      const memberId = params[1]
      const row = this.members.get(memberId)
      if (!row) return { rows: [] }
      row.roles = newRoles
      row.updated_at = new Date()
      return { rows: [row] }
    }

    // UPDATE tenant_members SET status = 'suspended' ...
    if (sql.startsWith('UPDATE tenant_members SET status')) {
      const memberId = params[0]
      const row = this.members.get(memberId)
      if (!row) return { rows: [] }
      row.status = 'suspended'
      row.updated_at = new Date()
      return { rows: [{ id: row.id }] }
    }

    throw new Error(`TestPgPool: unhandled query: ${sql}`)
  }
}

// ---- Setup ----

let testPool

beforeEach(() => {
  testPool = new TestPgPool()
  _setPool(testPool)
  _setClient(new TestRedisStore())
})

// ============================================================
// Account CRUD
// ============================================================

describe('createAccount', () => {
  it('creates an account with hashed password', async () => {
    const { accountId, account } = await createAccount({
      email: 'test@example.com',
      password: 'securepass123',
      name: 'Test User',
    })

    expect(accountId).toMatch(/^acc_/)
    expect(account.email).toBe('test@example.com')
    expect(account.name).toBe('Test User')
    expect(account.tenants).toEqual([])
    expect(account.passwordHash).toBeUndefined() // not exposed
    expect(account.createdAt).toBeTypeOf('number')
  })

  it('normalizes email to lowercase', async () => {
    const { account } = await createAccount({
      email: 'Test@EXAMPLE.com',
      password: 'securepass123',
      name: 'Test',
    })
    expect(account.email).toBe('test@example.com')
  })

  it('rejects duplicate email', async () => {
    await createAccount({ email: 'dup@test.com', password: 'pass1234', name: 'A' })
    await expect(
      createAccount({ email: 'dup@test.com', password: 'pass5678', name: 'B' })
    ).rejects.toThrow('already exists')
  })

  it('rejects duplicate email case-insensitively', async () => {
    await createAccount({ email: 'dup@test.com', password: 'pass1234', name: 'A' })
    await expect(
      createAccount({ email: 'DUP@Test.com', password: 'pass5678', name: 'B' })
    ).rejects.toThrow('already exists')
  })
})

describe('authenticateAccount', () => {
  it('authenticates with correct password', async () => {
    await createAccount({ email: 'auth@test.com', password: 'correct123', name: 'Auth' })
    const result = await authenticateAccount('auth@test.com', 'correct123')
    expect(result).not.toBeNull()
    expect(result.account.email).toBe('auth@test.com')
    expect(result.account.passwordHash).toBeUndefined()
  })

  it('returns null for wrong password', async () => {
    await createAccount({ email: 'auth@test.com', password: 'correct123', name: 'Auth' })
    const result = await authenticateAccount('auth@test.com', 'wrong')
    expect(result).toBeNull()
  })

  it('returns null for non-existent email', async () => {
    const result = await authenticateAccount('nobody@test.com', 'pass')
    expect(result).toBeNull()
  })

  it('authenticates case-insensitively', async () => {
    await createAccount({ email: 'CaseTest@Example.com', password: 'pass1234', name: 'Case' })
    const result = await authenticateAccount('casetest@example.com', 'pass1234')
    expect(result).not.toBeNull()
  })
})

describe('getAccount / updateAccount', () => {
  it('gets account by ID without passwordHash', async () => {
    const { accountId } = await createAccount({ email: 'get@test.com', password: 'pass1234', name: 'Get' })
    const account = await getAccount(accountId)
    expect(account.email).toBe('get@test.com')
    expect(account.passwordHash).toBeUndefined()
  })

  it('returns null for non-existent ID', async () => {
    const account = await getAccount('acc_nonexistent')
    expect(account).toBeNull()
  })

  it('updates account fields', async () => {
    const { accountId } = await createAccount({ email: 'upd@test.com', password: 'pass1234', name: 'Old' })
    const updated = await updateAccount(accountId, { name: 'New Name' })
    expect(updated.name).toBe('New Name')
    expect(updated.email).toBe('upd@test.com')
  })

  it('rejects unknown fields to prevent SQL injection via column names', async () => {
    const { accountId } = await createAccount({ email: 'sqli@test.com', password: 'pass1234', name: 'SQLI' })
    await expect(
      updateAccount(accountId, { 'password_hash = $2; DROP TABLE accounts; --': 'evil' })
    ).rejects.toThrow("updateAccount: unknown field 'password_hash = $2; DROP TABLE accounts; --'")
  })

  it('updates account email with normalization', async () => {
    const { accountId } = await createAccount({ email: 'old@test.com', password: 'pass1234', name: 'Email' })
    const updated = await updateAccount(accountId, { email: 'NEW@Test.COM' })
    expect(updated.email).toBe('new@test.com')
  })
})

describe('changePassword', () => {
  it('changes password when current password is correct', async () => {
    const { accountId } = await createAccount({ email: 'chpw@test.com', password: 'oldpass123', name: 'ChPw' })

    const result = await changePassword(accountId, 'oldpass123', 'newpass456')
    expect(result.success).toBe(true)

    // Verify new password works
    const auth = await authenticateAccount('chpw@test.com', 'newpass456')
    expect(auth).not.toBeNull()

    // Verify old password no longer works
    const authOld = await authenticateAccount('chpw@test.com', 'oldpass123')
    expect(authOld).toBeNull()
  })

  it('throws when current password is incorrect', async () => {
    const { accountId } = await createAccount({ email: 'wrongpw@test.com', password: 'correct123', name: 'Wrong' })
    await expect(
      changePassword(accountId, 'wrong_password', 'newpass456')
    ).rejects.toThrow('Current password is incorrect')
  })

  it('throws NotFoundError for non-existent account', async () => {
    const err = await changePassword('acc_nonexistent', 'old', 'new').catch(e => e)
    expect(err).toBeInstanceOf(NotFoundError)
  })
})

// ============================================================
// Tenant CRUD
// ============================================================

describe('createTenant', () => {
  it('creates a tenant with free trial', async () => {
    const { accountId } = await createAccount({ email: 'ten@test.com', password: 'pass1234', name: 'Ten' })
    const { tenantId, tenant } = await createTenant({ accountId, name: 'TurRes' })

    expect(tenantId).toMatch(/^ten_/)
    expect(tenant.name).toBe('TurRes')
    expect(tenant.accountId).toBe(accountId)
    expect(tenant.subscription.plan).toBe('free_trial')
    expect(tenant.subscription.status).toBe('trial')
    expect(tenant.subscription.trialEndsAt).toBeGreaterThan(Date.now())
  })

  it('adds tenant to account tenant list', async () => {
    const { accountId } = await createAccount({ email: 'list@test.com', password: 'pass1234', name: 'List' })
    const { tenantId } = await createTenant({ accountId, name: 'Org1' })

    const account = await getAccount(accountId)
    expect(account.tenants).toContain(tenantId)
  })

  it('supports multiple tenants per account', async () => {
    const { accountId } = await createAccount({ email: 'multi@test.com', password: 'pass1234', name: 'Multi' })
    await createTenant({ accountId, name: 'Org1' })
    await createTenant({ accountId, name: 'Org2' })

    const account = await getAccount(accountId)
    expect(account.tenants).toHaveLength(2)
  })

  it('does not lose tenant IDs under concurrent creation (regression: race condition)', async () => {
    // Simulate two concurrent createTenant calls racing to append to the same account.
    // Both must appear in the account's tenants list — no update should be silently lost.
    const { accountId } = await createAccount({ email: 'race@test.com', password: 'pass1234', name: 'Race' })
    const [r1, r2] = await Promise.all([
      createTenant({ accountId, name: 'RaceOrg1' }),
      createTenant({ accountId, name: 'RaceOrg2' }),
    ])

    const account = await getAccount(accountId)
    expect(account.tenants).toContain(r1.tenantId)
    expect(account.tenants).toContain(r2.tenantId)
    expect(account.tenants).toHaveLength(2)
  })

  it('wraps tenant creation in a transaction (BEGIN + COMMIT)', async () => {
    const { accountId } = await createAccount({ email: 'txn@test.com', password: 'pass1234', name: 'Txn' })
    testPool.transactionCalls = []
    await createTenant({ accountId, name: 'TxnOrg' })
    expect(testPool.transactionCalls).toContain('BEGIN')
    expect(testPool.transactionCalls).toContain('COMMIT')
    expect(testPool.transactionCalls).not.toContain('ROLLBACK')
  })

  it('throws NotFoundError when account does not exist', async () => {
    const err = await createTenant({ accountId: 'acc_nonexistent', name: 'Ghost' }).catch(e => e)
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err.message).toMatch(/not found/i)
  })
})

describe('createAccountWithTenant', () => {
  it('creates account and tenant atomically and links them', async () => {
    const { accountId, account, tenantId, tenant } = await createAccountWithTenant({
      email: 'atomic@test.com',
      password: 'securepass123',
      name: 'Atomic User',
      organizationName: 'Atomic Org',
    })

    expect(accountId).toMatch(/^acc_/)
    expect(account.email).toBe('atomic@test.com')
    expect(account.name).toBe('Atomic User')
    expect(tenantId).toMatch(/^ten_/)
    expect(tenant.name).toBe('Atomic Org')
    expect(tenant.subscription.plan).toBe('free_trial')

    // Account must have the tenant ID in its tenants list
    const loaded = await getAccount(accountId)
    expect(loaded.tenants).toContain(tenantId)
  })

  it('rejects duplicate email within the transaction', async () => {
    await createAccount({ email: 'dupat@test.com', password: 'pass1234', name: 'A' })
    await expect(
      createAccountWithTenant({
        email: 'dupat@test.com',
        password: 'pass5678',
        name: 'B',
        organizationName: 'Org',
      })
    ).rejects.toThrow('already exists')
  })

  it('wraps both inserts in a single transaction (BEGIN + COMMIT)', async () => {
    testPool.transactionCalls = []
    await createAccountWithTenant({
      email: 'txnboth@test.com',
      password: 'securepass123',
      name: 'Txn Both',
      organizationName: 'Txn Org',
    })
    expect(testPool.transactionCalls).toContain('BEGIN')
    expect(testPool.transactionCalls).toContain('COMMIT')
    expect(testPool.transactionCalls).not.toContain('ROLLBACK')
  })

  it('issues ROLLBACK and propagates error when tenant insert fails', async () => {
    // Build a pool whose connect() client throws on INSERT INTO tenants
    const failPool = new TestPgPool()
    failPool.connect = async () => {
      const pool = failPool
      return {
        query: async (text, params) => {
          const sql = text.replace(/\s+/g, ' ').trim()
          if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) {
            pool.transactionCalls.push(sql)
            return { rows: [] }
          }
          if (sql.startsWith('INSERT INTO tenants')) {
            throw new Error('simulated tenant insert failure')
          }
          return pool.query(text, params)
        },
        release: () => {},
      }
    }
    _setPool(failPool)

    await expect(
      createAccountWithTenant({
        email: 'failedtenant@test.com',
        password: 'securepass123',
        name: 'User',
        organizationName: 'Org',
      })
    ).rejects.toThrow('simulated tenant insert failure')

    // ROLLBACK must have been issued (not COMMIT)
    expect(failPool.transactionCalls).toContain('ROLLBACK')
    expect(failPool.transactionCalls).not.toContain('COMMIT')
  })
})


describe('getTenant / listAccountTenants / updateTenant', () => {
  it('gets tenant by ID', async () => {
    const { accountId } = await createAccount({ email: 'gt@test.com', password: 'pass1234', name: 'GT' })
    const { tenantId } = await createTenant({ accountId, name: 'MyOrg' })

    const tenant = await getTenant(tenantId)
    expect(tenant.name).toBe('MyOrg')
  })

  it('returns null for non-existent tenant', async () => {
    const tenant = await getTenant('ten_nonexistent')
    expect(tenant).toBeNull()
  })

  it('lists all tenants for an account', async () => {
    const { accountId } = await createAccount({ email: 'lo@test.com', password: 'pass1234', name: 'LO' })
    await createTenant({ accountId, name: 'A' })
    await createTenant({ accountId, name: 'B' })

    const tenants = await listAccountTenants(accountId)
    expect(tenants).toHaveLength(2)
    expect(tenants.map(t => t.name).sort()).toEqual(['A', 'B'])
  })

  it('returns empty array for account with no tenants', async () => {
    const { accountId } = await createAccount({ email: 'empty@test.com', password: 'pass1234', name: 'E' })
    const tenants = await listAccountTenants(accountId)
    expect(tenants).toEqual([])
  })

  it('updates tenant fields', async () => {
    const { accountId } = await createAccount({ email: 'ut@test.com', password: 'pass1234', name: 'UT' })
    const { tenantId } = await createTenant({ accountId, name: 'Old' })

    const updated = await updateTenant(tenantId, { name: 'New', disciplines: ['sra'] })
    expect(updated.name).toBe('New')
    expect(updated.disciplines).toEqual(['sra'])
  })

  it('rejects unknown fields to prevent unexpected column references', async () => {
    const { accountId } = await createAccount({ email: 'tenu@test.com', password: 'pass1234', name: 'TenU' })
    const { tenantId } = await createTenant({ accountId, name: 'Guard' })
    await expect(
      updateTenant(tenantId, { 'account_id = $2; --': 'evil' })
    ).rejects.toThrow("updateTenant: unknown field 'account_id = $2; --'")
  })
})

// ============================================================
// Platform Sessions
// ============================================================

describe('platform sessions', () => {
  it('creates and retrieves a session', async () => {
    const { accountId } = await createAccount({ email: 'ses@test.com', password: 'pass1234', name: 'Ses' })
    const { sessionId } = await createPlatformSession(accountId)

    expect(sessionId).toBeTruthy()

    const session = await getPlatformSession(sessionId)
    expect(session).not.toBeNull()
    expect(session.accountId).toBe(accountId)
  })

  it('returns null for non-existent session', async () => {
    const session = await getPlatformSession('nonexistent')
    expect(session).toBeNull()
  })

  it('returns null for null/undefined session ID', async () => {
    expect(await getPlatformSession(null)).toBeNull()
    expect(await getPlatformSession(undefined)).toBeNull()
  })

  it('deletes a session', async () => {
    const { accountId } = await createAccount({ email: 'del@test.com', password: 'pass1234', name: 'Del' })
    const { sessionId } = await createPlatformSession(accountId)

    const deleted = await deletePlatformSession(sessionId)
    expect(deleted).toBe(true)

    const session = await getPlatformSession(sessionId)
    expect(session).toBeNull()
  })

  it('returns false when deleting non-existent session', async () => {
    const deleted = await deletePlatformSession('nonexistent')
    expect(deleted).toBe(false)
  })
})

// ============================================================
// SSI Credential Encryption
// ============================================================

// A deterministic 32-byte test key (64 hex chars). Never use in production.
const TEST_CRED_KEY = 'a'.repeat(64)

describe('SSI credential encryption', () => {
  let savedKey

  beforeAll(() => {
    savedKey = process.env.PLATFORM_CREDENTIALS_KEY
    process.env.PLATFORM_CREDENTIALS_KEY = TEST_CRED_KEY
  })

  afterAll(() => {
    if (savedKey === undefined) {
      delete process.env.PLATFORM_CREDENTIALS_KEY
    } else {
      process.env.PLATFORM_CREDENTIALS_KEY = savedKey
    }
  })

  it('stores ssiCredentials as an encrypted envelope (not plaintext)', async () => {
    const { accountId } = await createAccount({ email: 'enc@test.com', password: 'pass1234', name: 'Enc' })
    const { tenantId } = await createTenant({ accountId, name: 'EncOrg' })

    const creds = { email: 'ssi@example.com', password: 'ssipass', apiKey: 'key123' }
    await updateTenant(tenantId, { ssiCredentials: creds })

    // Inspect raw row in the test pool — must be an encrypted envelope, not plaintext
    const rawRow = testPool.tenants.get(tenantId)
    expect(rawRow.ssi_credentials).not.toBeNull()
    expect(rawRow.ssi_credentials).toHaveProperty('iv')
    expect(rawRow.ssi_credentials).toHaveProperty('tag')
    expect(rawRow.ssi_credentials).toHaveProperty('data')
    // Raw data must not contain the plaintext password
    expect(JSON.stringify(rawRow.ssi_credentials)).not.toContain('ssipass')
  })

  it('decrypts ssiCredentials transparently on read', async () => {
    const { accountId } = await createAccount({ email: 'dec@test.com', password: 'pass1234', name: 'Dec' })
    const { tenantId } = await createTenant({ accountId, name: 'DecOrg' })

    const creds = { email: 'ssi@example.com', password: 'ssipass', apiKey: 'key123' }
    await updateTenant(tenantId, { ssiCredentials: creds })

    const tenant = await getTenant(tenantId)
    expect(tenant.ssiCredentials).toEqual(creds)
  })

  it('stores null ssiCredentials without encryption', async () => {
    const { accountId } = await createAccount({ email: 'nullcred@test.com', password: 'pass1234', name: 'Null' })
    const { tenantId } = await createTenant({ accountId, name: 'NullOrg' })

    await updateTenant(tenantId, { ssiCredentials: null })

    const tenant = await getTenant(tenantId)
    expect(tenant.ssiCredentials).toBeNull()
  })

  it('each write produces a different ciphertext (random IV)', async () => {
    const { accountId } = await createAccount({ email: 'iv@test.com', password: 'pass1234', name: 'IV' })
    const { tenantId } = await createTenant({ accountId, name: 'IVOrg' })

    const creds = { email: 'ssi@example.com', password: 'ssipass' }
    await updateTenant(tenantId, { ssiCredentials: creds })
    const first = testPool.tenants.get(tenantId).ssi_credentials

    await updateTenant(tenantId, { ssiCredentials: creds })
    const second = testPool.tenants.get(tenantId).ssi_credentials

    // Same plaintext, different IVs → different ciphertexts (CPA security)
    expect(first.iv).not.toBe(second.iv)
    expect(first.data).not.toBe(second.data)
  })

  it('throws when PLATFORM_CREDENTIALS_KEY is missing', async () => {
    delete process.env.PLATFORM_CREDENTIALS_KEY
    try {
      const { accountId } = await createAccount({ email: 'nokey@test.com', password: 'pass1234', name: 'NoKey' })
      const { tenantId } = await createTenant({ accountId, name: 'NoKeyOrg' })
      await expect(
        updateTenant(tenantId, { ssiCredentials: { email: 'x', password: 'y' } })
      ).rejects.toThrow('PLATFORM_CREDENTIALS_KEY')
    } finally {
      process.env.PLATFORM_CREDENTIALS_KEY = TEST_CRED_KEY
    }
  })

  it('throws when PLATFORM_CREDENTIALS_KEY has wrong length', async () => {
    process.env.PLATFORM_CREDENTIALS_KEY = 'deadbeef' // too short (8 hex chars, not 64)
    try {
      const { accountId } = await createAccount({ email: 'badkey@test.com', password: 'pass1234', name: 'BadKey' })
      const { tenantId } = await createTenant({ accountId, name: 'BadKeyOrg' })
      await expect(
        updateTenant(tenantId, { ssiCredentials: { email: 'x', password: 'y' } })
      ).rejects.toThrow('PLATFORM_CREDENTIALS_KEY must be exactly 64 hex characters')
    } finally {
      process.env.PLATFORM_CREDENTIALS_KEY = TEST_CRED_KEY
    }
  })
})

// ============================================================
// Discipline CRUD
// ============================================================

describe('createDiscipline', () => {
  it('creates a discipline with correct fields', async () => {
    const { accountId } = await createAccount({ email: 'dis@test.com', password: 'pass1234', name: 'Dis' })
    const { tenantId } = await createTenant({ accountId, name: 'DisOrg' })

    const { disciplineId, discipline } = await createDiscipline({
      tenantId,
      name: 'kupittaa_cup',
      labelFi: 'Kupittaa Cup',
      labelEn: 'Kupittaa Cup',
      ssiGroupId: '25874',
      ssiOrganizerId: '1215',
    })

    expect(disciplineId).toMatch(/^dis_/)
    expect(discipline.name).toBe('kupittaa_cup')
    expect(discipline.labelFi).toBe('Kupittaa Cup')
    expect(discipline.labelEn).toBe('Kupittaa Cup')
    expect(discipline.ssiGroupId).toBe('25874')
    expect(discipline.ssiOrganizerId).toBe('1215')
    expect(discipline.tenantId).toBe(tenantId)
    expect(discipline.createdAt).toBeTypeOf('number')
  })

  it('creates a discipline with optional fields omitted', async () => {
    const { accountId } = await createAccount({ email: 'dismin@test.com', password: 'pass1234', name: 'DisMin' })
    const { tenantId } = await createTenant({ accountId, name: 'MinOrg' })

    const { discipline } = await createDiscipline({
      tenantId,
      name: 'sra_training',
      labelFi: 'SRA Harjoitus',
    })

    expect(discipline.name).toBe('sra_training')
    expect(discipline.labelFi).toBe('SRA Harjoitus')
    expect(discipline.labelEn).toBe('')
    expect(discipline.ssiGroupId).toBeNull()
    expect(discipline.ssiOrganizerId).toBeNull()
  })
})

describe('getDiscipline / listTenantDisciplines', () => {
  it('gets discipline by ID', async () => {
    const { accountId } = await createAccount({ email: 'gd@test.com', password: 'pass1234', name: 'GD' })
    const { tenantId } = await createTenant({ accountId, name: 'GDOrg' })
    const { disciplineId } = await createDiscipline({ tenantId, name: 'sra', labelFi: 'SRA' })

    const dis = await getDiscipline(disciplineId)
    expect(dis.name).toBe('sra')
    expect(dis.tenantId).toBe(tenantId)
  })

  it('returns null for non-existent discipline', async () => {
    const dis = await getDiscipline('dis_nonexistent')
    expect(dis).toBeNull()
  })

  it('lists all disciplines for a tenant', async () => {
    const { accountId } = await createAccount({ email: 'ld@test.com', password: 'pass1234', name: 'LD' })
    const { tenantId } = await createTenant({ accountId, name: 'LDOrg' })

    await createDiscipline({ tenantId, name: 'sra', labelFi: 'SRA' })
    await createDiscipline({ tenantId, name: 'kupittaa', labelFi: 'Kupittaa' })

    const list = await listTenantDisciplines(tenantId)
    expect(list).toHaveLength(2)
    expect(list.map(d => d.name).sort()).toEqual(['kupittaa', 'sra'])
  })

  it('returns empty array for tenant with no disciplines', async () => {
    const { accountId } = await createAccount({ email: 'nd@test.com', password: 'pass1234', name: 'ND' })
    const { tenantId } = await createTenant({ accountId, name: 'NDOrg' })

    const list = await listTenantDisciplines(tenantId)
    expect(list).toEqual([])
  })

  it('does not return other tenants disciplines', async () => {
    const { accountId } = await createAccount({ email: 'iso@test.com', password: 'pass1234', name: 'Iso' })
    const { tenantId: t1 } = await createTenant({ accountId, name: 'Org1' })
    const { tenantId: t2 } = await createTenant({ accountId, name: 'Org2' })

    await createDiscipline({ tenantId: t1, name: 'sra', labelFi: 'SRA' })
    await createDiscipline({ tenantId: t2, name: 'prs', labelFi: 'PRS' })

    const list1 = await listTenantDisciplines(t1)
    expect(list1).toHaveLength(1)
    expect(list1[0].name).toBe('sra')

    const list2 = await listTenantDisciplines(t2)
    expect(list2).toHaveLength(1)
    expect(list2[0].name).toBe('prs')
  })
})

describe('updateDiscipline', () => {
  it('updates discipline fields', async () => {
    const { accountId } = await createAccount({ email: 'ud@test.com', password: 'pass1234', name: 'UD' })
    const { tenantId } = await createTenant({ accountId, name: 'UDOrg' })
    const { disciplineId } = await createDiscipline({ tenantId, name: 'old', labelFi: 'Vanha' })

    const updated = await updateDiscipline(disciplineId, { name: 'new', labelFi: 'Uusi', labelEn: 'New' })
    expect(updated.name).toBe('new')
    expect(updated.labelFi).toBe('Uusi')
    expect(updated.labelEn).toBe('New')
  })

  it('rejects unknown fields', async () => {
    const { accountId } = await createAccount({ email: 'udf@test.com', password: 'pass1234', name: 'UDF' })
    const { tenantId } = await createTenant({ accountId, name: 'UDFOrg' })
    const { disciplineId } = await createDiscipline({ tenantId, name: 'x', labelFi: 'X' })

    await expect(
      updateDiscipline(disciplineId, { 'tenant_id': 'evil' })
    ).rejects.toThrow("updateDiscipline: unknown field 'tenant_id'")
  })

  it('returns null for non-existent discipline', async () => {
    const result = await updateDiscipline('dis_nonexistent', { name: 'x' })
    expect(result).toBeNull()
  })
})

describe('deleteDiscipline', () => {
  it('deletes a discipline and returns true', async () => {
    const { accountId } = await createAccount({ email: 'dd@test.com', password: 'pass1234', name: 'DD' })
    const { tenantId } = await createTenant({ accountId, name: 'DDOrg' })
    const { disciplineId } = await createDiscipline({ tenantId, name: 'gone', labelFi: 'Pois' })

    const deleted = await deleteDiscipline(disciplineId)
    expect(deleted).toBe(true)

    const dis = await getDiscipline(disciplineId)
    expect(dis).toBeNull()
  })

  it('returns false for non-existent discipline', async () => {
    const deleted = await deleteDiscipline('dis_nonexistent')
    expect(deleted).toBe(false)
  })
})

// ============================================================
// Match Template CRUD
// ============================================================

// Helper: create account + tenant + discipline for template tests
async function createTestDiscipline() {
  const { accountId } = await createAccount({ email: `tpl${Date.now()}@test.com`, password: 'pass1234', name: 'Tpl' })
  const { tenantId } = await createTenant({ accountId, name: 'TplOrg' })
  const { disciplineId } = await createDiscipline({ tenantId, name: 'sra', labelFi: 'SRA' })
  return { accountId, tenantId, disciplineId }
}

describe('createMatchTemplate', () => {
  it('creates a template with all fields', async () => {
    const { tenantId, disciplineId } = await createTestDiscipline()

    const { templateId, template } = await createMatchTemplate({
      tenantId, disciplineId,
      name: 'Kupittaa Cup Template',
      ssiSeedEventId: '12345',
      ssiSeedSnapshot: { stages: 3, squads: 3 },
      overrides: { nameTemplate: 'Kupittaa CUP {date}' },
      calendarTemplate: { title: 'Kupittaan ampumavuoro {date}' },
      staffingRules: { minInstructors: 2 },
    })

    expect(templateId).toMatch(/^tpl_/)
    expect(template.name).toBe('Kupittaa Cup Template')
    expect(template.disciplineId).toBe(disciplineId)
    expect(template.tenantId).toBe(tenantId)
    expect(template.ssiSeedEventId).toBe('12345')
    expect(template.ssiSeedSnapshot).toEqual({ stages: 3, squads: 3 })
    expect(template.overrides.nameTemplate).toBe('Kupittaa CUP {date}')
    expect(template.calendarTemplate.title).toBe('Kupittaan ampumavuoro {date}')
    expect(template.staffingRules.minInstructors).toBe(2)
    expect(template.createdAt).toBeTypeOf('number')
  })

  it('creates a template with minimal fields (defaults to empty objects)', async () => {
    const { tenantId, disciplineId } = await createTestDiscipline()

    const { template } = await createMatchTemplate({
      tenantId, disciplineId,
      name: 'Minimal Template',
    })

    expect(template.name).toBe('Minimal Template')
    expect(template.ssiSeedEventId).toBeNull()
    expect(template.ssiSeedSnapshot).toBeNull()
    expect(template.overrides).toEqual({})
    expect(template.calendarTemplate).toEqual({})
    expect(template.staffingRules).toEqual({})
  })
})

describe('getMatchTemplate / listDisciplineTemplates / listTenantTemplates', () => {
  it('gets template by ID', async () => {
    const { tenantId, disciplineId } = await createTestDiscipline()
    const { templateId } = await createMatchTemplate({ tenantId, disciplineId, name: 'Get Test' })

    const tpl = await getMatchTemplate(templateId)
    expect(tpl.name).toBe('Get Test')
    expect(tpl.disciplineId).toBe(disciplineId)
  })

  it('returns null for non-existent template', async () => {
    const tpl = await getMatchTemplate('tpl_nonexistent')
    expect(tpl).toBeNull()
  })

  it('lists templates by discipline', async () => {
    const { tenantId, disciplineId } = await createTestDiscipline()
    await createMatchTemplate({ tenantId, disciplineId, name: 'Tpl A' })
    await createMatchTemplate({ tenantId, disciplineId, name: 'Tpl B' })

    const list = await listDisciplineTemplates(disciplineId)
    expect(list).toHaveLength(2)
    expect(list.map(t => t.name).sort()).toEqual(['Tpl A', 'Tpl B'])
  })

  it('lists templates by tenant (across disciplines)', async () => {
    const { accountId, tenantId, disciplineId: d1 } = await createTestDiscipline()
    const { disciplineId: d2 } = await createDiscipline({ tenantId, name: 'prs', labelFi: 'PRS' })

    await createMatchTemplate({ tenantId, disciplineId: d1, name: 'SRA Tpl' })
    await createMatchTemplate({ tenantId, disciplineId: d2, name: 'PRS Tpl' })

    const list = await listTenantTemplates(tenantId)
    expect(list).toHaveLength(2)
    expect(list.map(t => t.name).sort()).toEqual(['PRS Tpl', 'SRA Tpl'])
  })

  it('does not return other disciplines templates', async () => {
    const { tenantId, disciplineId: d1 } = await createTestDiscipline()
    const { disciplineId: d2 } = await createDiscipline({ tenantId, name: 'other', labelFi: 'Other' })

    await createMatchTemplate({ tenantId, disciplineId: d1, name: 'Mine' })
    await createMatchTemplate({ tenantId, disciplineId: d2, name: 'Not mine' })

    const list = await listDisciplineTemplates(d1)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Mine')
  })
})

describe('updateMatchTemplate', () => {
  it('updates template name and JSONB fields', async () => {
    const { tenantId, disciplineId } = await createTestDiscipline()
    const { templateId } = await createMatchTemplate({ tenantId, disciplineId, name: 'Old' })

    const updated = await updateMatchTemplate(templateId, {
      name: 'New Name',
      overrides: { nameTemplate: 'Updated {date}' },
      staffingRules: { minInstructors: 3, maxInstructors: 5 },
    })

    expect(updated.name).toBe('New Name')
    expect(updated.overrides.nameTemplate).toBe('Updated {date}')
    expect(updated.staffingRules.minInstructors).toBe(3)
  })

  it('rejects unknown fields', async () => {
    const { tenantId, disciplineId } = await createTestDiscipline()
    const { templateId } = await createMatchTemplate({ tenantId, disciplineId, name: 'X' })

    await expect(
      updateMatchTemplate(templateId, { tenant_id: 'evil' })
    ).rejects.toThrow("updateMatchTemplate: unknown field 'tenant_id'")
  })

  it('returns null for non-existent template', async () => {
    const result = await updateMatchTemplate('tpl_nonexistent', { name: 'x' })
    expect(result).toBeNull()
  })
})

describe('deleteMatchTemplate', () => {
  it('deletes a template and returns true', async () => {
    const { tenantId, disciplineId } = await createTestDiscipline()
    const { templateId } = await createMatchTemplate({ tenantId, disciplineId, name: 'Gone' })

    const deleted = await deleteMatchTemplate(templateId)
    expect(deleted).toBe(true)

    const tpl = await getMatchTemplate(templateId)
    expect(tpl).toBeNull()
  })

  it('returns false for non-existent template', async () => {
    const deleted = await deleteMatchTemplate('tpl_nonexistent')
    expect(deleted).toBe(false)
  })
})

// ============================================================
// Tenant Roles (RBAC)
// ============================================================

describe('hasRequiredRole (pure function)', () => {
  it('owner satisfies any role', () => {
    expect(hasRequiredRole(['owner'], ['instructor'])).toBe(true)
    expect(hasRequiredRole(['owner'], ['match_admin'])).toBe(true)
    expect(hasRequiredRole(['owner'], ['owner'])).toBe(true)
  })

  it('tenant_admin satisfies operational roles', () => {
    expect(hasRequiredRole(['tenant_admin'], ['discipline_admin'])).toBe(true)
    expect(hasRequiredRole(['tenant_admin'], ['match_admin'])).toBe(true)
    expect(hasRequiredRole(['tenant_admin'], ['instructor'])).toBe(true)
    expect(hasRequiredRole(['tenant_admin'], ['tenant_admin'])).toBe(true)
  })

  it('tenant_admin does NOT satisfy owner-only actions', () => {
    expect(hasRequiredRole(['tenant_admin'], ['owner'])).toBe(false)
  })

  it('discipline_admin only satisfies discipline_admin', () => {
    expect(hasRequiredRole(['discipline_admin'], ['discipline_admin'])).toBe(true)
    expect(hasRequiredRole(['discipline_admin'], ['match_admin'])).toBe(false)
    expect(hasRequiredRole(['discipline_admin'], ['owner'])).toBe(false)
  })

  it('match_admin satisfies match_admin', () => {
    expect(hasRequiredRole(['match_admin'], ['owner', 'tenant_admin', 'match_admin'])).toBe(true)
    expect(hasRequiredRole(['match_admin'], ['discipline_admin'])).toBe(false)
  })

  it('instructor only satisfies instructor', () => {
    expect(hasRequiredRole(['instructor'], ['instructor'])).toBe(true)
    expect(hasRequiredRole(['instructor'], ['match_admin'])).toBe(false)
  })

  it('multiple roles: any match works', () => {
    expect(hasRequiredRole(['discipline_admin', 'match_admin'], ['match_admin'])).toBe(true)
    expect(hasRequiredRole(['instructor', 'discipline_admin'], ['discipline_admin'])).toBe(true)
  })

  it('returns false for empty/null inputs', () => {
    expect(hasRequiredRole([], ['owner'])).toBe(false)
    expect(hasRequiredRole(null, ['owner'])).toBe(false)
    expect(hasRequiredRole(['owner'], [])).toBe(false)
    expect(hasRequiredRole(['owner'], null)).toBe(false)
  })
})

describe('TENANT_ROLES constant', () => {
  it('contains all 6 defined roles', () => {
    expect(TENANT_ROLES).toEqual(['owner', 'tenant_admin', 'discipline_admin', 'instructor_admin', 'match_admin', 'instructor'])
  })
})

describe('createAccountWithTenant — auto-owner membership', () => {
  it('creates owner membership in same transaction', async () => {
    const { accountId, tenantId } = await createAccountWithTenant({
      email: 'rbac@test.com', password: 'password123', name: 'RBAC Tester', organizationName: 'RBAC Org',
    })

    const membership = await getTenantMembership(tenantId, accountId)
    expect(membership).not.toBeNull()
    expect(membership.roles).toContain('owner')
    expect(membership.status).toBe('active')
    expect(membership.invitedBy).toBeNull() // auto-created, no inviter
  })
})

describe('createTenant — auto-owner membership', () => {
  it('creates owner membership when adding a new tenant', async () => {
    const { accountId } = await createAccountWithTenant({
      email: 'multi@test.com', password: 'password123', name: 'Multi Tester', organizationName: 'Org 1',
    })

    const { tenantId } = await createTenant({ accountId, name: 'Org 2' })
    const membership = await getTenantMembership(tenantId, accountId)
    expect(membership).not.toBeNull()
    expect(membership.roles).toContain('owner')
  })
})

describe('getTenantMembership', () => {
  it('returns null for non-existent membership', async () => {
    const result = await getTenantMembership('ten_nonexistent', 'acc_nonexistent')
    expect(result).toBeNull()
  })
})

describe('addTenantMember', () => {
  it('adds a member with specified roles', async () => {
    const { accountId: ownerId, tenantId } = await createAccountWithTenant({
      email: 'owner@test.com', password: 'password123', name: 'Owner', organizationName: 'Org',
    })
    const { accountId: memberId } = await createAccount({
      email: 'member@test.com', password: 'password123', name: 'Member',
    })

    const { member } = await addTenantMember({
      tenantId, accountId: memberId, roles: ['match_admin', 'instructor'], invitedBy: ownerId,
    })

    expect(member.accountId).toBe(memberId)
    expect(member.roles).toContain('match_admin')
    expect(member.roles).toContain('instructor')
    expect(member.invitedBy).toBe(ownerId)
    expect(member.status).toBe('active')
  })

  it('rejects invalid roles', async () => {
    await expect(
      addTenantMember({ tenantId: 'ten_1', accountId: 'acc_1', roles: ['superadmin'] })
    ).rejects.toThrow("invalid role 'superadmin'")
  })
})

describe('listTenantMembers', () => {
  it('lists all active members with account info', async () => {
    const { accountId: ownerId, tenantId } = await createAccountWithTenant({
      email: 'list-owner@test.com', password: 'password123', name: 'List Owner', organizationName: 'List Org',
    })
    const { accountId: memberId } = await createAccount({
      email: 'list-member@test.com', password: 'password123', name: 'List Member',
    })
    await addTenantMember({ tenantId, accountId: memberId, roles: ['instructor'], invitedBy: ownerId })

    const members = await listTenantMembers(tenantId)
    expect(members.length).toBe(2) // owner + member
    expect(members.some(m => m.accountEmail === 'list-owner@test.com')).toBe(true)
    expect(members.some(m => m.accountEmail === 'list-member@test.com')).toBe(true)
  })
})

describe('updateMemberRoles', () => {
  it('updates roles for an existing member', async () => {
    const { accountId: ownerId, tenantId } = await createAccountWithTenant({
      email: 'role-owner@test.com', password: 'password123', name: 'Role Owner', organizationName: 'Role Org',
    })
    const { accountId: memberId } = await createAccount({
      email: 'role-member@test.com', password: 'password123', name: 'Role Member',
    })
    const { memberId: mbrId } = await addTenantMember({
      tenantId, accountId: memberId, roles: ['instructor'], invitedBy: ownerId,
    })

    const updated = await updateMemberRoles(mbrId, ['match_admin', 'discipline_admin'])
    expect(updated.roles).toContain('match_admin')
    expect(updated.roles).toContain('discipline_admin')
    expect(updated.roles).not.toContain('instructor')
  })

  it('rejects empty roles array', async () => {
    await expect(
      updateMemberRoles('mbr_x', [])
    ).rejects.toThrow('at least one role is required')
  })

  it('rejects invalid roles', async () => {
    await expect(
      updateMemberRoles('mbr_x', ['superadmin'])
    ).rejects.toThrow("invalid role 'superadmin'")
  })

  it('throws NotFoundError for non-existent membership', async () => {
    await expect(
      updateMemberRoles('mbr_nonexistent', ['instructor'])
    ).rejects.toThrow()
  })
})

describe('removeTenantMember', () => {
  it('suspends a member', async () => {
    const { accountId: ownerId, tenantId } = await createAccountWithTenant({
      email: 'remove-owner@test.com', password: 'password123', name: 'Remove Owner', organizationName: 'Remove Org',
    })
    const { accountId: memberId } = await createAccount({
      email: 'remove-member@test.com', password: 'password123', name: 'Remove Member',
    })
    const { memberId: mbrId } = await addTenantMember({
      tenantId, accountId: memberId, roles: ['instructor'], invitedBy: ownerId,
    })

    const removed = await removeTenantMember(mbrId)
    expect(removed).toBe(true)

    // Should no longer appear in active memberships
    const membership = await getTenantMembership(tenantId, memberId)
    expect(membership).toBeNull()
  })

  it('returns false for non-existent member', async () => {
    const removed = await removeTenantMember('mbr_nonexistent')
    expect(removed).toBe(false)
  })
})

describe('last-owner protection', () => {
  it('prevents removing the last owner via updateMemberRoles', async () => {
    const { accountId, tenantId } = await createAccountWithTenant({
      email: 'last-owner@test.com', password: 'password123', name: 'Last Owner', organizationName: 'Last Org',
    })
    const membership = await getTenantMembership(tenantId, accountId)

    await expect(
      updateMemberRoles(membership.id, ['instructor'])
    ).rejects.toThrow('Cannot remove the last owner')
  })

  it('prevents removing the last owner via removeTenantMember', async () => {
    const { accountId, tenantId } = await createAccountWithTenant({
      email: 'last-owner2@test.com', password: 'password123', name: 'Last Owner 2', organizationName: 'Last Org 2',
    })
    const membership = await getTenantMembership(tenantId, accountId)

    await expect(
      removeTenantMember(membership.id)
    ).rejects.toThrow('Cannot remove the last owner')
  })

  it('allows removing owner if another owner exists', async () => {
    const { accountId: owner1Id, tenantId } = await createAccountWithTenant({
      email: 'owner1@test.com', password: 'password123', name: 'Owner 1', organizationName: 'Dual Org',
    })
    const { accountId: owner2Id } = await createAccount({
      email: 'owner2@test.com', password: 'password123', name: 'Owner 2',
    })
    await addTenantMember({ tenantId, accountId: owner2Id, roles: ['owner'], invitedBy: owner1Id })

    // Now owner1 can be demoted because owner2 also has owner role
    const membership1 = await getTenantMembership(tenantId, owner1Id)
    const updated = await updateMemberRoles(membership1.id, ['tenant_admin'])
    expect(updated.roles).toContain('tenant_admin')
    expect(updated.roles).not.toContain('owner')
  })
})

describe('listAccountTenants with RBAC', () => {
  it('includes tenants where account has membership', async () => {
    const { accountId: ownerId, tenantId } = await createAccountWithTenant({
      email: 'list-rbac-owner@test.com', password: 'password123', name: 'List RBAC Owner', organizationName: 'RBAC Org',
    })
    const { accountId: memberId } = await createAccount({
      email: 'list-rbac-member@test.com', password: 'password123', name: 'List RBAC Member',
    })
    await addTenantMember({ tenantId, accountId: memberId, roles: ['instructor'], invitedBy: ownerId })

    // Member should see the tenant even though they don't own it
    const tenants = await listAccountTenants(memberId)
    expect(tenants.length).toBe(1)
    expect(tenants[0].id).toBe(tenantId)
  })
})
