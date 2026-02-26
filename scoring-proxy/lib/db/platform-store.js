// ============================================================
// Platform Data Store
//
// Persistent data (accounts, tenants) → PostgreSQL
// Ephemeral data (sessions) → Redis
//
// PostgreSQL tables:
//   accounts  — id, email, name, password_hash, tenants[], timestamps
//   tenants   — id, account_id, name, subscription{}, config, timestamps
//
// Redis keys:
//   platform:session:{id} — platform login session (24h TTL)
// ============================================================

import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { query, withTransaction } from './postgres.js'
import { getRedisClient } from '../session/redis.js'
import { NotFoundError } from '../errors/AppError.js'

const BCRYPT_ROUNDS = 12

// Allowed fields for updateAccount: maps API key → DB column name
const ACCOUNT_UPDATE_FIELDS = { name: 'name', tenants: 'tenants' }

// ---- SSI Credential Encryption (AES-256-GCM) ----
//
// SSI credentials (email, password, API key) are sensitive secrets. They are
// encrypted with AES-256-GCM before being written to the database, and
// decrypted transparently when read back. The encryption key must be set via
// the PLATFORM_CREDENTIALS_KEY environment variable (64 hex characters = 32 bytes).
//
// Storage format stored in the ssi_credentials JSONB column:
//   { iv: "<24-char hex>", tag: "<32-char hex>", data: "<hex ciphertext>" }

const CRED_ALGO = 'aes-256-gcm'
const CRED_IV_BYTES = 12 // 96-bit IV recommended for GCM

/**
 * Return the 32-byte AES key from PLATFORM_CREDENTIALS_KEY env var.
 * Throws if the variable is missing or the wrong length.
 */
function getCredentialKey() {
  const keyHex = process.env.PLATFORM_CREDENTIALS_KEY
  if (!keyHex) {
    throw new Error(
      'PLATFORM_CREDENTIALS_KEY environment variable is required for SSI credential encryption'
    )
  }
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) {
    throw new Error(
      'PLATFORM_CREDENTIALS_KEY must be exactly 64 hex characters (32 bytes)'
    )
  }
  return key
}

/**
 * Encrypt SSI credentials for database storage.
 * @param {object} credentials - e.g. { email, password, apiKey }
 * @returns {{ iv: string, tag: string, data: string }} encrypted envelope
 */
function encryptCredentials(credentials) {
  if (credentials === null || credentials === undefined || typeof credentials !== 'object') {
    throw new Error('encryptCredentials: credentials must be a non-null object')
  }
  const key = getCredentialKey()
  const iv = crypto.randomBytes(CRED_IV_BYTES)
  const cipher = crypto.createCipheriv(CRED_ALGO, key, iv)
  const plaintext = JSON.stringify(credentials)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted.toString('hex'),
  }
}

/**
 * Decrypt SSI credentials from a stored envelope.
 * @param {{ iv: string, tag: string, data: string }} envelope
 * @returns {object} decrypted credentials
 */
function decryptCredentials(envelope) {
  if (!envelope || typeof envelope.iv !== 'string' ||
      typeof envelope.tag !== 'string' || typeof envelope.data !== 'string') {
    throw new Error('decryptCredentials: malformed envelope — expected { iv, tag, data } strings')
  }
  const key = getCredentialKey()
  const iv = Buffer.from(envelope.iv, 'hex')
  const tag = Buffer.from(envelope.tag, 'hex')
  const data = Buffer.from(envelope.data, 'hex')
  const decipher = crypto.createDecipheriv(CRED_ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

// ---- Helpers ----

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

function platformSessionKey(id) { return `platform:session:${id}` }

/**
 * Convert a PostgreSQL account row to the API-safe format.
 * Strips password_hash and normalizes column names to camelCase.
 */
function rowToAccount(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    tenants: row.tenants || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

/**
 * Convert a PostgreSQL tenant row to the API format.
 * ssi_credentials is stored as an encrypted envelope and decrypted here.
 */
function rowToTenant(row) {
  if (!row) return null
  let ssiCredentials = null
  if (row.ssi_credentials) {
    ssiCredentials = decryptCredentials(row.ssi_credentials)
  }
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    subscription: row.subscription || {},
    ssiCredentials,
    calendarConfig: row.calendar_config || null,
    disciplines: row.disciplines || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// ---- Account CRUD ----

/**
 * Create a new platform account (sign-up).
 * @param {object} params - { email, password, name }
 * @returns {{ accountId, account }} - created account (without passwordHash)
 */
export async function createAccount({ email, password, name }) {
  const normalizedEmail = email.toLowerCase().trim()

  // Check for duplicate email (unique constraint will also catch this,
  // but we want a friendly error message)
  const { rows: existing } = await query(
    'SELECT id FROM accounts WHERE LOWER(email) = $1',
    [normalizedEmail]
  )
  if (existing.length > 0) {
    throw new Error('An account with this email already exists.')
  }

  const accountId = generateId('acc')
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const { rows } = await query(
    `INSERT INTO accounts (id, email, name, password_hash, tenants)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [accountId, normalizedEmail, name.trim(), passwordHash, JSON.stringify([])]
  )

  return { accountId, account: rowToAccount(rows[0]) }
}

/**
 * Authenticate a platform account by email + password.
 * @returns {{ accountId, account }} or null if invalid
 */
export async function authenticateAccount(email, password) {
  const normalizedEmail = email.toLowerCase().trim()

  const { rows } = await query(
    'SELECT * FROM accounts WHERE LOWER(email) = $1',
    [normalizedEmail]
  )
  if (rows.length === 0) return null

  const row = rows[0]
  const valid = await bcrypt.compare(password, row.password_hash)
  if (!valid) return null

  return { accountId: row.id, account: rowToAccount(row) }
}

/**
 * Get account by ID (without passwordHash).
 */
export async function getAccount(accountId) {
  const { rows } = await query(
    'SELECT * FROM accounts WHERE id = $1',
    [accountId]
  )
  if (rows.length === 0) return null
  return rowToAccount(rows[0])
}

/**
 * Update account fields (e.g., name, tenants list).
 */
export async function updateAccount(accountId, updates) {
  // Reject any key not in the allowlist to prevent unexpected column references
  for (const key of Object.keys(updates)) {
    if (!(key in ACCOUNT_UPDATE_FIELDS)) {
      throw new Error(`updateAccount: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [accountId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(ACCOUNT_UPDATE_FIELDS)) {
    if (updates[key] !== undefined) {
      const value = key === 'tenants' ? JSON.stringify(updates[key]) : updates[key]
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(value)
      paramIndex++
    }
  }

  if (setClauses.length === 0) {
    return getAccount(accountId)
  }

  setClauses.push(`updated_at = NOW()`)

  const { rows } = await query(
    `UPDATE accounts SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToAccount(rows[0])
}

// ---- Combined account + tenant creation ----

/**
 * Create a new account and its first tenant atomically.
 * If tenant creation fails the whole transaction is rolled back,
 * preventing orphaned accounts with no tenant.
 *
 * bcrypt hashing is done before the transaction because it is
 * CPU-intensive and must not hold a DB connection open.
 *
 * @param {object} params - { email, password, name, organizationName }
 * @returns {{ accountId, account, tenantId, tenant }}
 */
export async function createAccountWithTenant({ email, password, name, organizationName }) {
  const normalizedEmail = email.toLowerCase().trim()
  const accountId = generateId('acc')
  const tenantId = generateId('ten')

  // Hash password before the transaction — bcrypt is CPU-intensive
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  const subscription = {
    plan: 'free_trial',
    status: 'trial',
    trialEndsAt: now + THIRTY_DAYS,
    currentPeriodEnd: null,
    paymentMethod: null,
    cancelledAt: null,
    cancellationReason: null,
  }

  const { account, tenant } = await withTransaction(async (client) => {
    // Duplicate-email check inside the transaction to avoid TOCTOU gaps
    const { rows: existing } = await client.query(
      'SELECT id FROM accounts WHERE LOWER(email) = $1',
      [normalizedEmail]
    )
    if (existing.length > 0) {
      throw new Error('An account with this email already exists.')
    }

    // Insert account (tenants array starts empty)
    const { rows: accountRows } = await client.query(
      `INSERT INTO accounts (id, email, name, password_hash, tenants)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [accountId, normalizedEmail, name.trim(), passwordHash, JSON.stringify([])]
    )

    // Insert first tenant
    const { rows: tenantRows } = await client.query(
      `INSERT INTO tenants (id, account_id, name, subscription, disciplines)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, accountId, organizationName.trim(), JSON.stringify(subscription), JSON.stringify([])]
    )

    // Append tenant ID to the account's tenants array
    await client.query(
      `UPDATE accounts
       SET tenants = tenants || $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify([tenantId]), accountId]
    )

    return {
      account: rowToAccount(accountRows[0]),
      tenant: rowToTenant(tenantRows[0]),
    }
  })

  return { accountId, account, tenantId, tenant }
}

// ---- Tenant CRUD ----

/**
 * Create a new tenant for an account.
 * Starts with a 30-day free trial.
 *
 * Uses a transaction with SELECT ... FOR UPDATE to lock the account row,
 * preventing race conditions when concurrent requests create tenants for
 * the same account simultaneously.
 */
export async function createTenant({ accountId, name }) {
  const tenantId = generateId('ten')
  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

  const subscription = {
    plan: 'free_trial',
    status: 'trial',
    trialEndsAt: now + THIRTY_DAYS,
    currentPeriodEnd: null,
    paymentMethod: null,
    cancelledAt: null,
    cancellationReason: null,
  }

  const tenant = await withTransaction(async (client) => {
    // Lock the account row to prevent concurrent tenant creation from
    // losing updates to the tenants array (race condition guard).
    const { rows: accountRows } = await client.query(
      'SELECT id FROM accounts WHERE id = $1 FOR UPDATE',
      [accountId]
    )
    if (accountRows.length === 0) {
      throw new NotFoundError('Account')
    }

    // Insert the new tenant
    const { rows } = await client.query(
      `INSERT INTO tenants (id, account_id, name, subscription, disciplines)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, accountId, name.trim(), JSON.stringify(subscription), JSON.stringify([])]
    )

    // Append tenant ID to the locked account's tenants array
    await client.query(
      `UPDATE accounts
       SET tenants = tenants || $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify([tenantId]), accountId]
    )

    return rowToTenant(rows[0])
  })

  return { tenantId, tenant }
}

/**
 * Get tenant by ID.
 */
export async function getTenant(tenantId) {
  const { rows } = await query(
    'SELECT * FROM tenants WHERE id = $1',
    [tenantId]
  )
  if (rows.length === 0) return null
  return rowToTenant(rows[0])
}

/**
 * List all tenants for an account.
 */
export async function listAccountTenants(accountId) {
  const { rows } = await query(
    'SELECT * FROM tenants WHERE account_id = $1 ORDER BY created_at',
    [accountId]
  )
  return rows.map(rowToTenant)
}

/**
 * Update tenant fields.
 */
export async function updateTenant(tenantId, updates) {
  const allowedFields = {
    name: 'name',
    ssiCredentials: 'ssi_credentials',
    calendarConfig: 'calendar_config',
    disciplines: 'disciplines',
    subscription: 'subscription',
  }

  // Reject any key not in the allowlist to prevent unexpected column references
  for (const key of Object.keys(updates)) {
    if (!(key in allowedFields)) {
      throw new Error(`updateTenant: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [tenantId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      let value
      if (key === 'ssiCredentials' && updates[key] !== null) {
        // Encrypt SSI credentials before storing — see encryptCredentials()
        value = JSON.stringify(encryptCredentials(updates[key]))
      } else {
        value = typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]
      }
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(value)
      paramIndex++
    }
  }

  if (setClauses.length === 0) {
    return getTenant(tenantId)
  }

  setClauses.push(`updated_at = NOW()`)

  const { rows } = await query(
    `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToTenant(rows[0])
}

// ---- Platform Sessions (Redis — ephemeral, 24h TTL) ----

const PLATFORM_SESSION_TTL = 24 * 60 * 60 // 24 hours in seconds

/**
 * Create a platform session after successful account login.
 */
export async function createPlatformSession(accountId) {
  const redis = getRedisClient()
  const sessionId = crypto.randomUUID()
  const now = Date.now()

  const sessionData = {
    accountId,
    createdAt: now,
    lastUsed: now,
  }

  await redis.set(platformSessionKey(sessionId), JSON.stringify(sessionData), {
    EX: PLATFORM_SESSION_TTL,
  })

  return { sessionId }
}

/**
 * Get a platform session, returns null if expired/missing.
 */
export async function getPlatformSession(sessionId) {
  if (!sessionId) return null
  const redis = getRedisClient()
  const raw = await redis.get(platformSessionKey(sessionId))
  if (!raw) return null

  try {
    const session = JSON.parse(raw)
    // Touch lastUsed + renew TTL
    session.lastUsed = Date.now()
    await redis.set(platformSessionKey(sessionId), JSON.stringify(session), {
      EX: PLATFORM_SESSION_TTL,
    })
    return session
  } catch {
    await redis.del(platformSessionKey(sessionId))
    return null
  }
}

/**
 * Delete a platform session (logout).
 */
export async function deletePlatformSession(sessionId) {
  if (!sessionId) return false
  const redis = getRedisClient()
  const result = await redis.del(platformSessionKey(sessionId))
  return result > 0
}
