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
import { query } from './postgres.js'
import { getRedisClient } from '../session/redis.js'

const BCRYPT_ROUNDS = 12

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
 */
function rowToTenant(row) {
  if (!row) return null
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    subscription: row.subscription || {},
    ssiCredentials: row.ssi_credentials || null,
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
  // Build SET clause dynamically for allowed fields
  const allowedFields = { name: 'name', tenants: 'tenants' }
  const setClauses = []
  const params = [accountId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(allowedFields)) {
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

// ---- Tenant CRUD ----

/**
 * Create a new tenant for an account.
 * Starts with a 30-day free trial.
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

  const { rows } = await query(
    `INSERT INTO tenants (id, account_id, name, subscription, disciplines)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tenantId, accountId, name.trim(), JSON.stringify(subscription), JSON.stringify([])]
  )

  // Add tenant to account's tenants array
  await query(
    `UPDATE accounts
     SET tenants = tenants || $1::jsonb, updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify([tenantId]), accountId]
  )

  return { tenantId, tenant: rowToTenant(rows[0]) }
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
  const setClauses = []
  const params = [tenantId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      const value = typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]
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
