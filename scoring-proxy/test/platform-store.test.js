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
