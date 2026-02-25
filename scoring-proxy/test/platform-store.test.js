// ============================================================
// Platform Store — Unit Tests
//
// Tests account CRUD, authentication, tenant CRUD, and platform
// sessions. Uses in-memory mocks for both PostgreSQL and Redis.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { _setClient } from '../lib/session/redis.js'
import { _setPool } from '../lib/db/postgres.js'
import {
  createAccount,
  authenticateAccount,
  getAccount,
  updateAccount,
  createTenant,
  getTenant,
  listAccountTenants,
  updateTenant,
  createPlatformSession,
  getPlatformSession,
  deletePlatformSession,
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
  }

  async query(text, params = []) {
    const sql = text.replace(/\s+/g, ' ').trim()

    // SELECT id FROM accounts WHERE LOWER(email) = $1
    if (sql.startsWith('SELECT id FROM accounts')) {
      const email = params[0]
      for (const row of this.accounts.values()) {
        if (row.email.toLowerCase() === email.toLowerCase()) {
          return { rows: [{ id: row.id }] }
        }
      }
      return { rows: [] }
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

    throw new Error(`TestPgPool: unhandled query: ${sql}`)
  }
}

// ---- Setup ----

beforeEach(() => {
  _setPool(new TestPgPool())
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
