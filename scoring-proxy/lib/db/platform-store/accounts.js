// ============================================================
// Platform Store — Accounts, Platform Sessions, Password Reset
// ============================================================

import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { query, withTransaction } from '../postgres.js'
import { getRedisClient } from '../../session/redis.js'
import { NotFoundError } from '../../errors/AppError.js'
import { generateId, platformSessionKey, encrypt, decrypt, BCRYPT_ROUNDS } from './utils.js'
import { generateSlug } from './tenants.js'

// ---- Row mappers ----

function rowToAccount(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    mfaEnabled: row.mfa_enabled || false,
    tenants: row.tenants || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// ---- Private row mapper helpers for tenant ----
// (Inline to avoid circular dependency — tenants.js imports from accounts indirectly via withTransaction)
function rowToTenantSimple(row) {
  if (!row) return null
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    subscription: row.subscription || {},
    ssiCredentials: null,
    calendarConfig: row.calendar_config || null,
    disciplines: row.disciplines || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// Allowed fields for updateAccount: maps API key → DB column name
const ACCOUNT_UPDATE_FIELDS = {
  name: 'name',
  email: 'email',
  tenants: 'tenants',
  mfaEnabled: 'mfa_enabled',
  mfaSecret: 'mfa_secret',
  mfaRecoveryCodes: 'mfa_recovery_codes',
}

// ---- Platform Session keys ----

const PLATFORM_SESSION_TTL = 24 * 60 * 60 // 24 hours in seconds
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

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
 * List ALL accounts (admin only). Includes tenant count per account.
 * Does NOT include passwordHash or MFA secrets.
 */
export async function listAllAccounts() {
  const { rows } = await query(
    `SELECT a.*,
       (SELECT COUNT(DISTINCT t.id) FROM tenants t
        LEFT JOIN tenant_members tm ON tm.tenant_id = t.id AND tm.account_id = a.id AND tm.status = 'active'
        WHERE t.account_id = a.id OR tm.id IS NOT NULL) AS tenant_count
     FROM accounts a
     ORDER BY a.created_at DESC`
  )
  return rows.map(row => ({
    ...rowToAccount(row),
    tenantCount: parseInt(row.tenant_count, 10) || 0,
  }))
}

/**
 * Get account with full MFA secrets for verification.
 * Only use this internally for MFA verification!
 */
export async function getAccountWithMfaSecrets(accountId) {
  const { rows } = await query(
    'SELECT * FROM accounts WHERE id = $1',
    [accountId]
  )
  if (rows.length === 0) return null

  const account = rowToAccount(rows[0])
  let mfaSecret = null
  if (rows[0].mfa_secret) {
    try { mfaSecret = decrypt(rows[0].mfa_secret) } catch { /* key mismatch — treat as no MFA */ }
  }
  const mfaRecoveryCodes = rows[0].mfa_recovery_codes || []

  return {
    ...account,
    mfaSecret,
    mfaRecoveryCodes,
  }
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
      let value = updates[key]
      if (key === 'tenants') value = JSON.stringify(value)
      if (key === 'email') value = value.toLowerCase().trim()

      // MFA secrets need encryption
      if (key === 'mfaSecret' && value) {
        value = encrypt(value)
      }

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

/**
 * Change account password after verifying the current password.
 * @param {string} accountId
 * @param {string} currentPassword - must match existing hash
 * @param {string} newPassword - will be bcrypt-hashed
 * @returns {{ success: boolean }} or throws on invalid current password
 */
export async function changePassword(accountId, currentPassword, newPassword) {
  const { rows } = await query(
    'SELECT password_hash FROM accounts WHERE id = $1',
    [accountId]
  )
  if (rows.length === 0) throw new NotFoundError('Account')

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash)
  if (!valid) {
    throw new Error('Current password is incorrect')
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await query(
    'UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newHash, accountId]
  )
  return { success: true }
}

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

    // Check for duplicate tenant name (case-insensitive)
    const { rows: dupTenant } = await client.query(
      'SELECT id FROM tenants WHERE LOWER(name) = LOWER($1)',
      [organizationName.trim()]
    )
    if (dupTenant.length > 0) {
      throw new Error('A tenant with this name already exists.')
    }

    // Generate a unique slug from the organization name
    const baseSlug = generateSlug(organizationName.trim())
    let slug = baseSlug
    let slugSuffix = 2
    while (true) {
      const { rows: slugDup } = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug])
      if (slugDup.length === 0) break
      slug = `${baseSlug}-${slugSuffix}`
      slugSuffix++
      if (slugSuffix > 100) throw new Error('Could not generate unique slug')
    }

    // Insert first tenant
    const { rows: tenantRows } = await client.query(
      `INSERT INTO tenants (id, account_id, name, slug, subscription, disciplines)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, accountId, organizationName.trim(), slug, JSON.stringify(subscription), JSON.stringify([])]
    )

    // Append tenant ID to the account's tenants array
    await client.query(
      `UPDATE accounts
       SET tenants = tenants || $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify([tenantId]), accountId]
    )

    // Create owner membership — the creator is automatically the owner
    const memberId = generateId('mbr')
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
       VALUES ($1, $2, $3, $4, NULL, 'active')`,
      [memberId, tenantId, accountId, ['owner']]
    )

    return {
      account: rowToAccount(accountRows[0]),
      tenant: rowToTenantSimple(tenantRows[0]),
    }
  })

  return { accountId, account, tenantId, tenant }
}

// ---- Password Reset Tokens ----

/**
 * Create a password reset token for an account.
 * Revokes any existing unused tokens for the same account.
 * @param {string} email
 * @returns {{ token: string } | null} plaintext token (to include in email), or null if email not found
 */
export async function createPasswordResetToken(email) {
  const normalizedEmail = email.toLowerCase().trim()
  const { rows: accounts } = await query(
    'SELECT id FROM accounts WHERE LOWER(email) = $1',
    [normalizedEmail]
  )
  if (accounts.length === 0) return null // no user enumeration

  const accountId = accounts[0].id
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const id = generateId('prt')
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS)

  // Revoke any existing unused tokens for this account
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE account_id = $1 AND used_at IS NULL`,
    [accountId]
  )

  await query(
    `INSERT INTO password_reset_tokens (id, account_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, accountId, tokenHash, expiresAt]
  )

  return { token }
}

/**
 * Verify a password reset token and reset the password.
 * @param {string} token - plaintext token from the email link
 * @param {string} newPassword - new password (plain text, will be hashed)
 * @returns {{ success: boolean, error?: string }}
 */
export async function resetPasswordWithToken(token, newPassword) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const { rows } = await query(
    `SELECT * FROM password_reset_tokens WHERE token_hash = $1`,
    [tokenHash]
  )
  if (rows.length === 0) {
    return { success: false, error: 'Invalid or expired reset link.' }
  }

  const resetRow = rows[0]
  if (resetRow.used_at) {
    return { success: false, error: 'This reset link has already been used.' }
  }
  if (new Date(resetRow.expires_at) < new Date()) {
    return { success: false, error: 'This reset link has expired. Please request a new one.' }
  }

  // Hash new password and update account
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await query(
    `UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, resetRow.account_id]
  )

  // Mark token as used
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
    [resetRow.id]
  )

  return { success: true, accountId: resetRow.account_id }
}

/**
 * Delete all platform sessions for an account (force re-login after password reset).
 * Scans Redis for platform:session:* keys belonging to this account.
 */
export async function invalidateAccountSessions(accountId) {
  const redis = getRedisClient()
  try {
    const keys = await redis.keys('platform:session:*')
    for (const key of keys) {
      try {
        const raw = await redis.get(key)
        if (raw) {
          const session = JSON.parse(raw)
          if (session.accountId === accountId) {
            await redis.del(key)
          }
        }
      } catch { /* skip malformed sessions */ }
    }
  } catch { /* Redis unavailable — sessions will expire naturally */ }
}

// ---- Platform Sessions (Redis — ephemeral, 24h TTL) ----

/**
 * Create a platform session after successful account login.
 */
export async function createPlatformSession(accountId, options = {}) {
  const redis = getRedisClient()
  const sessionId = crypto.randomUUID()
  const now = Date.now()

  const sessionData = {
    accountId,
    createdAt: now,
    lastUsed: now,
  }

  // MFA pending sessions are short-lived (5 min) and block normal access
  if (options.mfaPending) {
    sessionData.mfaPending = true
  }

  const ttl = options.mfaPending ? 300 : PLATFORM_SESSION_TTL // 5 min for MFA challenge
  await redis.set(platformSessionKey(sessionId), JSON.stringify(sessionData), {
    EX: ttl,
  })

  return { sessionId }
}

/**
 * Upgrade an MFA-pending session to a full session after successful MFA verification.
 */
export async function upgradeMfaSession(sessionId) {
  if (!sessionId) return false
  const redis = getRedisClient()
  const raw = await redis.get(platformSessionKey(sessionId))
  if (!raw) return false

  try {
    const session = JSON.parse(raw)
    if (!session.mfaPending) return false
    delete session.mfaPending
    session.lastUsed = Date.now()
    await redis.set(platformSessionKey(sessionId), JSON.stringify(session), {
      EX: PLATFORM_SESSION_TTL,
    })
    return true
  } catch {
    return false
  }
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
