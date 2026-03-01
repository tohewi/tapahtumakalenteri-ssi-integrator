// ============================================================
// Platform Data Store
//
// Persistent data (accounts, tenants, memberships) → PostgreSQL
// Ephemeral data (sessions) → Redis
//
// PostgreSQL tables:
//   accounts        — id, email, name, password_hash, tenants[], timestamps
//   tenants         — id, account_id, name, subscription{}, config, timestamps
//   tenant_members  — id, tenant_id, account_id, roles[], status, timestamps
//   disciplines     — id, tenant_id, name, labels, SSI refs, timestamps
//   match_templates — id, tenant_id, discipline_id, name, JSONB config
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

// ---- Tenant Roles (RBAC) ----
// See docs/design/platform-data-model.md §2.6 for full permission matrix.

/** All valid tenant member roles */
export const TENANT_ROLES = ['owner', 'tenant_admin', 'discipline_admin', 'instructor_admin', 'match_admin', 'instructor']

/** Roles that inherit ALL operational permissions (but NOT billing/SSI) */
const ADMIN_ROLES = new Set(['owner', 'tenant_admin'])

/**
 * Role Assignment Matrix — defines which roles each actor role can assign.
 * Used for both invitations and member role updates.
 * See docs/requirements/requirements.md Release 8.2 RBAC1.
 */
export const ROLE_ASSIGNMENT_MATRIX = {
  owner:            ['owner', 'tenant_admin', 'discipline_admin', 'instructor_admin', 'match_admin', 'instructor'],
  tenant_admin:     ['discipline_admin', 'instructor_admin', 'match_admin', 'instructor'],
  instructor_admin: ['match_admin', 'instructor'],
  discipline_admin: [],
  match_admin:      [],
  instructor:       [],
}

/**
 * Get the set of roles an actor can assign, based on all their roles (union).
 * @param {string[]} actorRoles - the actor's current roles
 * @returns {string[]} roles the actor is allowed to assign
 */
export function getAssignableRoles(actorRoles) {
  if (!actorRoles || actorRoles.length === 0) return []
  const assignable = new Set()
  for (const role of actorRoles) {
    const allowed = ROLE_ASSIGNMENT_MATRIX[role] || []
    allowed.forEach(r => assignable.add(r))
  }
  return [...assignable]
}

/**
 * Check if actor can assign all the requested roles.
 * @param {string[]} actorRoles
 * @param {string[]} requestedRoles
 * @returns {{ allowed: boolean, disallowed: string[] }}
 */
export function validateRoleAssignment(actorRoles, requestedRoles) {
  const assignable = new Set(getAssignableRoles(actorRoles))
  const disallowed = requestedRoles.filter(r => !assignable.has(r))
  return { allowed: disallowed.length === 0, disallowed }
}

/**
 * Check if a membership's roles satisfy the required roles for an action.
 * - `owner` implicitly satisfies every role
 * - `tenant_admin` implicitly satisfies every operational role (not billing/SSI)
 *
 * @param {string[]} memberRoles - roles the member actually has
 * @param {string[]} requiredRoles - any one of these must match
 * @returns {boolean}
 */
export function hasRequiredRole(memberRoles, requiredRoles) {
  if (!memberRoles || memberRoles.length === 0) return false
  if (!requiredRoles || requiredRoles.length === 0) return false

  // owner can do everything
  if (memberRoles.includes('owner')) return true

  // tenant_admin can do everything except owner-only actions (billing, SSI creds)
  // Owner-only actions are identified by requiring ONLY 'owner' in requiredRoles
  if (memberRoles.includes('tenant_admin')) {
    const ownerOnly = requiredRoles.length === 1 && requiredRoles[0] === 'owner'
    if (!ownerOnly) return true
  }

  // Direct role match
  return memberRoles.some(r => requiredRoles.includes(r))
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

/**
 * Encrypt a plain string value for database storage.
 * Wraps encryptCredentials by storing the string in a { value } object.
 * @param {string} plaintext
 * @returns {string} JSON-encoded encrypted envelope
 */
function encrypt(plaintext) {
  const envelope = encryptCredentials({ value: plaintext })
  return JSON.stringify(envelope)
}

/**
 * Decrypt a string value from a stored JSON envelope.
 * @param {string} stored - JSON-encoded { iv, tag, data } envelope
 * @returns {string} decrypted plaintext
 */
function decrypt(stored) {
  const envelope = typeof stored === 'string' ? JSON.parse(stored) : stored
  const decrypted = decryptCredentials(envelope)
  return decrypted.value
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
    mfaEnabled: row.mfa_enabled || false,
    tenants: row.tenants || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

/**
 * Convert a PostgreSQL tenant row to the API format.
 * ssi_credentials is stored as an encrypted envelope and decrypted here.
 */
function rowToTenant(row, { includeCredentials = false } = {}) {
  if (!row) return null

  // SSI credentials: by default, return only metadata (email + configured flags).
  // Full credentials are only returned when includeCredentials is true (internal use).
  let ssiCredentials = null
  if (row.ssi_credentials) {
    const decrypted = decryptCredentials(row.ssi_credentials)
    if (includeCredentials) {
      ssiCredentials = decrypted
    } else {
      // Masked response: show email (not secret), flag password/apiKey as configured
      ssiCredentials = {
        email: decrypted.email || null,
        hasPassword: !!decrypted.password,
        hasApiKey: !!decrypted.apiKey,
      }
    }
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
  const mfaSecret = rows[0].mfa_secret ? decrypt(rows[0].mfa_secret) : null
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

    // Check for duplicate tenant name (case-insensitive)
    const { rows: dupTenant } = await client.query(
      'SELECT id FROM tenants WHERE LOWER(name) = LOWER($1)',
      [organizationName.trim()]
    )
    if (dupTenant.length > 0) {
      throw new Error('A tenant with this name already exists.')
    }

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

    // Create owner membership — the creator is automatically the owner
    const memberId = generateId('mbr')
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
       VALUES ($1, $2, $3, $4, NULL, 'active')`,
      [memberId, tenantId, accountId, ['owner']]
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

    // Check for duplicate tenant name (case-insensitive)
    const { rows: dupTenant } = await client.query(
      'SELECT id FROM tenants WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    )
    if (dupTenant.length > 0) {
      throw new Error('A tenant with this name already exists.')
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

    // Create owner membership — the creator is automatically the owner
    const memberId = generateId('mbr')
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
       VALUES ($1, $2, $3, $4, NULL, 'active')`,
      [memberId, tenantId, accountId, ['owner']]
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
 * Get tenant by ID with full decrypted SSI credentials.
 * INTERNAL USE ONLY — for SSI operations that need actual password/apiKey.
 * Never expose this directly in API responses.
 */
export async function getTenantWithCredentials(tenantId) {
  const { rows } = await query(
    'SELECT * FROM tenants WHERE id = $1',
    [tenantId]
  )
  if (rows.length === 0) return null
  return rowToTenant(rows[0], { includeCredentials: true })
}

/**
 * List all tenants where the account has an active membership.
 * Falls back to account_id ownership for backward compatibility with
 * tenants created before the RBAC migration.
 */
export async function listAccountTenants(accountId) {
  const { rows } = await query(
    `SELECT DISTINCT t.* FROM tenants t
     LEFT JOIN tenant_members tm ON tm.tenant_id = t.id AND tm.account_id = $1 AND tm.status = 'active'
     WHERE t.account_id = $1 OR tm.id IS NOT NULL
     ORDER BY t.created_at`,
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
  let row_ssi_credentials_cache

  for (const [key, column] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      let value
      if (key === 'ssiCredentials' && updates[key] !== null) {
        // Merge with existing credentials — omitted fields keep their current values
        // This supports write-only password/apiKey: frontend sends only changed fields
        let merged = updates[key]
        if (row_ssi_credentials_cache === undefined) {
          const { rows: currentRows } = await query('SELECT ssi_credentials FROM tenants WHERE id = $1', [tenantId])
          row_ssi_credentials_cache = currentRows[0]?.ssi_credentials || null
        }
        if (row_ssi_credentials_cache) {
          const existing = decryptCredentials(row_ssi_credentials_cache)
          merged = {
            email: updates[key].email ?? existing.email,
            password: updates[key].password || existing.password,
            apiKey: updates[key].apiKey ?? existing.apiKey,
          }
        }
        // Encrypt merged credentials before storing
        value = JSON.stringify(encryptCredentials(merged))
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

// ---- Tenant Membership CRUD (RBAC) ----

/**
 * Convert a PostgreSQL tenant_members row to API format.
 */
function rowToMember(row) {
  if (!row) return null
  return {
    id: row.id,
    memberId: row.id, // alias used by frontend
    tenantId: row.tenant_id,
    accountId: row.account_id,
    roles: row.roles || [],
    invitedBy: row.invited_by || null,
    status: row.status,
    joinedAt: new Date(row.created_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/**
 * Get the membership for an account in a specific tenant.
 * Returns null if no active membership exists.
 * @param {string} tenantId
 * @param {string} accountId
 * @returns {object|null} membership with roles array
 */
export async function getTenantMembership(tenantId, accountId) {
  const { rows } = await query(
    `SELECT * FROM tenant_members
     WHERE tenant_id = $1 AND account_id = $2 AND status = 'active'`,
    [tenantId, accountId]
  )
  if (rows.length === 0) return null
  return rowToMember(rows[0])
}

/**
 * List all active members of a tenant.
 * Joins with accounts to include member name and email.
 */
export async function listTenantMembers(tenantId) {
  const { rows } = await query(
    `SELECT tm.*, a.name AS account_name, a.email AS account_email
     FROM tenant_members tm
     JOIN accounts a ON a.id = tm.account_id
     WHERE tm.tenant_id = $1 AND tm.status = 'active'
     ORDER BY tm.created_at`,
    [tenantId]
  )
  return rows.map(row => ({
    ...rowToMember(row),
    accountName: row.account_name,
    accountEmail: row.account_email,
  }))
}

/**
 * Add a member to a tenant with specified roles.
 * @param {object} params - { tenantId, accountId, roles, invitedBy }
 * @returns {{ memberId, member }}
 */
export async function addTenantMember({ tenantId, accountId, roles, invitedBy }) {
  // Validate roles
  for (const role of roles) {
    if (!TENANT_ROLES.includes(role)) {
      throw new Error(`addTenantMember: invalid role '${role}'`)
    }
  }

  const memberId = generateId('mbr')
  const { rows } = await query(
    `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE
       SET roles = $4, invited_by = $5, status = 'active', updated_at = NOW()
     RETURNING *`,
    [memberId, tenantId, accountId, roles, invitedBy || null]
  )
  return { memberId: rows[0].id, member: rowToMember(rows[0]) }
}

/**
 * Update the roles for an existing tenant member.
 * Enforces last-owner protection: cannot remove the last owner.
 *
 * @param {string} memberId
 * @param {string[]} newRoles
 * @returns {object} updated membership
 */
export async function updateMemberRoles(memberId, newRoles) {
  // Validate roles
  for (const role of newRoles) {
    if (!TENANT_ROLES.includes(role)) {
      throw new Error(`updateMemberRoles: invalid role '${role}'`)
    }
  }
  if (newRoles.length === 0) {
    throw new Error('updateMemberRoles: at least one role is required')
  }

  // Get current membership to check last-owner protection
  const { rows: currentRows } = await query(
    'SELECT * FROM tenant_members WHERE id = $1',
    [memberId]
  )
  if (currentRows.length === 0) throw new NotFoundError('Membership')

  const current = currentRows[0]
  const hadOwner = (current.roles || []).includes('owner')
  const willHaveOwner = newRoles.includes('owner')

  // If removing owner role, check that another owner exists
  if (hadOwner && !willHaveOwner) {
    const { rows: ownerRows } = await query(
      `SELECT id FROM tenant_members
       WHERE tenant_id = $1 AND 'owner' = ANY(roles) AND status = 'active' AND id != $2`,
      [current.tenant_id, memberId]
    )
    if (ownerRows.length === 0) {
      throw new Error('Cannot remove the last owner from a tenant')
    }
  }

  const { rows } = await query(
    `UPDATE tenant_members SET roles = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [newRoles, memberId]
  )
  if (rows.length === 0) return null
  return rowToMember(rows[0])
}

/**
 * Remove a member from a tenant (sets status to 'suspended').
 * Enforces last-owner protection.
 *
 * @param {string} memberId
 * @returns {boolean} true if removed
 */
export async function removeTenantMember(memberId) {
  const { rows: currentRows } = await query(
    'SELECT * FROM tenant_members WHERE id = $1',
    [memberId]
  )
  if (currentRows.length === 0) return false

  const current = currentRows[0]

  // Last-owner protection
  if ((current.roles || []).includes('owner')) {
    const { rows: ownerRows } = await query(
      `SELECT id FROM tenant_members
       WHERE tenant_id = $1 AND 'owner' = ANY(roles) AND status = 'active' AND id != $2`,
      [current.tenant_id, memberId]
    )
    if (ownerRows.length === 0) {
      throw new Error('Cannot remove the last owner from a tenant')
    }
  }

  const { rows } = await query(
    `UPDATE tenant_members SET status = 'suspended', updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [memberId]
  )
  return rows.length > 0
}

// ============================================================
// Tenant Invitations (DB)
// ============================================================

function rowToInvitation(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    roles: row.roles,
    invitedBy: row.invited_by,
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/**
 * Create an invitation for a user to join a tenant.
 * Resolves to a securely random token + id.
 */
export async function createTenantInvitation({ tenantId, email, roles, invitedBy, expiresInDays = 7 }) {
  for (const role of roles) {
    if (!TENANT_ROLES.includes(role)) {
      throw new Error(`createTenantInvitation: invalid role '${role}'`)
    }
  }

  const id = generateId('inv')
  // Generate secure random token
  const tokenBuffer = crypto.randomBytes(32)
  const token = tokenBuffer.toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const normalizedEmail = email.toLowerCase().trim()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

  const { rows } = await query(
    `INSERT INTO tenant_invitations (id, tenant_id, email, roles, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, tenantId, normalizedEmail, roles, tokenHash, invitedBy, expiresAt]
  )

  // Return the plaintext token to be emailed — it cannot be recovered later
  return { invitation: rowToInvitation(rows[0]), token }
}

/**
 * Get an invitation by plaintext token.
 * Only returns 'pending' invitations that haven't expired.
 */
export async function getInvitationByToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { rows } = await query(
    `SELECT ti.*, t.name as tenant_name, a.name as inviter_name
     FROM tenant_invitations ti
     JOIN tenants t ON t.id = ti.tenant_id
     JOIN accounts a ON a.id = ti.invited_by
     WHERE ti.token_hash = $1
       AND ti.status = 'pending'
       AND ti.expires_at > NOW()`,
    [tokenHash]
  )
  if (rows.length === 0) return null

  const inv = rowToInvitation(rows[0])
  inv.tenantName = rows[0].tenant_name
  inv.inviterName = rows[0].inviter_name
  return inv
}

/**
 * Accept an invitation and add the user to the tenant.
 * Performs atomical check-and-update.
 */
export async function acceptTenantInvitation(token, accountId, accountEmail) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  return await withTransaction(async (client) => {
    // 1. Lock the invitation row to prevent double-use
    const { rows: invRows } = await client.query(
      `SELECT * FROM tenant_invitations
       WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash]
    )
    
    if (invRows.length === 0) {
      throw new Error('Invitation not found or invalid token')
    }

    const inv = invRows[0]

    if (inv.status !== 'pending') {
      throw new Error(`Invitation is already ${inv.status}`)
    }
    
    if (new Date(inv.expires_at) < new Date()) {
      await client.query(`UPDATE tenant_invitations SET status = 'expired' WHERE id = $1`, [inv.id])
      throw new Error('Invitation has expired')
    }

    // Check email match (rudimentary safeguard, optionally strict)
    if (inv.email !== accountEmail.toLowerCase().trim()) {
      throw new Error(`This invitation was sent to ${inv.email}, but you are logged in as ${accountEmail}`)
    }

    // 2. Add membership
    const memberId = generateId('mbr')
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (tenant_id, account_id) DO UPDATE
         SET roles = (
               SELECT ARRAY(SELECT DISTINCT unnest(tenant_members.roles || $4))
             ),
             status = 'active',
             updated_at = NOW()`,
      [memberId, inv.tenant_id, accountId, inv.roles, inv.invited_by]
    )

    // 3. Mark invitation used
    await client.query(
      `UPDATE tenant_invitations SET status = 'accepted', used_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [inv.id]
    )

    return inv.tenant_id
  })
}

/**
 * Auto-accept all pending invitations for a given email address.
 * Called on login — silently creates memberships for any matching invitations.
 * @param {string} accountId
 * @param {string} email
 * @returns {string[]} tenant IDs that were joined
 */
export async function autoAcceptPendingInvitations(accountId, email) {
  const normalizedEmail = email.toLowerCase().trim()
  const { rows: pending } = await query(
    `SELECT * FROM tenant_invitations
     WHERE LOWER(email) = $1 AND status = 'pending' AND expires_at > NOW()`,
    [normalizedEmail]
  )

  const joinedTenantIds = []
  for (const inv of pending) {
    try {
      // Add membership (upsert — merge roles if already a member)
      const memberId = generateId('mbr')
      await query(
        `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (tenant_id, account_id) DO UPDATE
           SET roles = (
                 SELECT ARRAY(SELECT DISTINCT unnest(tenant_members.roles || $4))
               ),
               status = 'active',
               updated_at = NOW()`,
        [memberId, inv.tenant_id, accountId, inv.roles, inv.invited_by]
      )

      // Mark invitation as accepted
      await query(
        `UPDATE tenant_invitations SET status = 'accepted', used_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [inv.id]
      )

      joinedTenantIds.push(inv.tenant_id)
    } catch { /* skip individual failures — don't block login */ }
  }

  return joinedTenantIds
}

/**
 * List pending invitations for a tenant.
 */
export async function listPendingInvitations(tenantId) {
  const { rows } = await query(
    `SELECT ti.*, a.name as inviter_name
     FROM tenant_invitations ti
     JOIN accounts a ON a.id = ti.invited_by
     WHERE ti.tenant_id = $1 AND ti.status = 'pending' AND ti.expires_at > NOW()
     ORDER BY ti.created_at DESC`,
    [tenantId]
  )
  return rows.map(r => ({
    ...rowToInvitation(r),
    inviterName: r.inviter_name,
  }))
}

/**
 * Revoke a pending invitation.
 */
export async function revokeTenantInvitation(tenantId, invitationId) {
  const { rows } = await query(
    `UPDATE tenant_invitations 
     SET status = 'revoked', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     RETURNING id`,
    [invitationId, tenantId]
  )
  return rows.length > 0
}

/**
 * Get discipline counts for a list of tenant IDs in a single query.
 * Returns a Map of tenantId → count.
 */
export async function countDisciplinesByTenant(tenantIds) {
  if (!tenantIds || tenantIds.length === 0) return new Map()
  const placeholders = tenantIds.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await query(
    `SELECT tenant_id, COUNT(*)::int AS count
     FROM disciplines WHERE tenant_id IN (${placeholders})
     GROUP BY tenant_id`,
    tenantIds
  )
  const map = new Map()
  for (const row of rows) map.set(row.tenant_id, row.count)
  return map
}

// ---- Discipline CRUD ----

/**
 * Convert a PostgreSQL discipline row to API format.
 */
function rowToDiscipline(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    labelFi: row.label_fi || '',
    labelEn: row.label_en || '',
    ssiGroupId: row.ssi_group_id || null,
    ssiOrganizerId: row.ssi_organizer_id || null,
    ssiCreateUrl: row.ssi_create_url || null,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

/**
 * Create a new discipline for a tenant.
 * @param {object} params - { tenantId, name, labelFi, labelEn, ssiGroupId?, ssiOrganizerId? }
 */
export async function createDiscipline({ tenantId, name, labelFi, labelEn, ssiGroupId, ssiOrganizerId, ssiCreateUrl }) {
  const disciplineId = generateId('dis')
  const { rows } = await query(
    `INSERT INTO disciplines (id, tenant_id, name, label_fi, label_en, ssi_group_id, ssi_organizer_id, ssi_create_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [disciplineId, tenantId, name.trim(), (labelFi || '').trim(), (labelEn || '').trim(),
     ssiGroupId || null, ssiOrganizerId || null, ssiCreateUrl || null]
  )
  return { disciplineId, discipline: rowToDiscipline(rows[0]) }
}

/**
 * Get a discipline by ID.
 */
export async function getDiscipline(disciplineId) {
  const { rows } = await query(
    'SELECT * FROM disciplines WHERE id = $1',
    [disciplineId]
  )
  if (rows.length === 0) return null
  return rowToDiscipline(rows[0])
}

/**
 * List all disciplines for a tenant.
 */
export async function listTenantDisciplines(tenantId) {
  const { rows } = await query(
    'SELECT * FROM disciplines WHERE tenant_id = $1 ORDER BY created_at',
    [tenantId]
  )
  return rows.map(rowToDiscipline)
}

// Allowed fields for updateDiscipline
const DISCIPLINE_UPDATE_FIELDS = {
  name: 'name',
  labelFi: 'label_fi',
  labelEn: 'label_en',
  ssiGroupId: 'ssi_group_id',
  ssiOrganizerId: 'ssi_organizer_id',
  ssiCreateUrl: 'ssi_create_url',
}

/**
 * Update discipline fields.
 */
export async function updateDiscipline(disciplineId, updates) {
  for (const key of Object.keys(updates)) {
    if (!(key in DISCIPLINE_UPDATE_FIELDS)) {
      throw new Error(`updateDiscipline: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [disciplineId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(DISCIPLINE_UPDATE_FIELDS)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(updates[key])
      paramIndex++
    }
  }

  if (setClauses.length === 0) {
    return getDiscipline(disciplineId)
  }

  setClauses.push(`updated_at = NOW()`)

  const { rows } = await query(
    `UPDATE disciplines SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToDiscipline(rows[0])
}

/**
 * Delete a discipline by ID.
 * @returns {boolean} true if deleted, false if not found
 */
export async function deleteDiscipline(disciplineId) {
  const { rows } = await query(
    'DELETE FROM disciplines WHERE id = $1 RETURNING id',
    [disciplineId]
  )
  return rows.length > 0
}

// ---- Match Template CRUD ----

/**
 * Convert a PostgreSQL match_templates row to API format.
 * JSONB columns are parsed automatically by pg driver.
 */
function rowToTemplate(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    disciplineId: row.discipline_id,
    name: row.name,
    ssiSeedEventId: row.ssi_seed_event_id || null,
    ssiSeedSnapshot: row.ssi_seed_snapshot || null,
    overrides: row.overrides || {},
    calendarTemplate: row.calendar_template || {},
    staffingRules: row.staffing_rules || {},
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

/**
 * Create a new match template.
 * @param {object} params - { tenantId, disciplineId, name, ssiSeedEventId?, overrides?, calendarTemplate?, staffingRules? }
 */
export async function createMatchTemplate({ tenantId, disciplineId, name, ssiSeedEventId, ssiSeedSnapshot, overrides, calendarTemplate, staffingRules }) {
  const templateId = generateId('tpl')
  const { rows } = await query(
    `INSERT INTO match_templates (id, tenant_id, discipline_id, name, ssi_seed_event_id, ssi_seed_snapshot, overrides, calendar_template, staffing_rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      templateId, tenantId, disciplineId, name.trim(),
      ssiSeedEventId || null,
      ssiSeedSnapshot ? JSON.stringify(ssiSeedSnapshot) : null,
      JSON.stringify(overrides || {}),
      JSON.stringify(calendarTemplate || {}),
      JSON.stringify(staffingRules || {}),
    ]
  )
  return { templateId, template: rowToTemplate(rows[0]) }
}

/**
 * Get a match template by ID.
 */
export async function getMatchTemplate(templateId) {
  const { rows } = await query(
    'SELECT * FROM match_templates WHERE id = $1',
    [templateId]
  )
  if (rows.length === 0) return null
  return rowToTemplate(rows[0])
}

/**
 * List all match templates for a discipline.
 */
export async function listDisciplineTemplates(disciplineId) {
  const { rows } = await query(
    'SELECT * FROM match_templates WHERE discipline_id = $1 ORDER BY created_at',
    [disciplineId]
  )
  return rows.map(rowToTemplate)
}

/**
 * List all match templates for a tenant (across all disciplines).
 */
export async function listTenantTemplates(tenantId) {
  const { rows } = await query(
    'SELECT * FROM match_templates WHERE tenant_id = $1 ORDER BY created_at',
    [tenantId]
  )
  return rows.map(rowToTemplate)
}

// Allowed fields for updateMatchTemplate
const TEMPLATE_UPDATE_FIELDS = {
  name: 'name',
  ssiSeedEventId: 'ssi_seed_event_id',
  ssiSeedSnapshot: 'ssi_seed_snapshot',
  overrides: 'overrides',
  calendarTemplate: 'calendar_template',
  staffingRules: 'staffing_rules',
}

// Fields that must be JSON-stringified before storage
const TEMPLATE_JSON_FIELDS = new Set(['ssiSeedSnapshot', 'overrides', 'calendarTemplate', 'staffingRules'])

/**
 * Update match template fields.
 */
export async function updateMatchTemplate(templateId, updates) {
  for (const key of Object.keys(updates)) {
    if (!(key in TEMPLATE_UPDATE_FIELDS)) {
      throw new Error(`updateMatchTemplate: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [templateId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(TEMPLATE_UPDATE_FIELDS)) {
    if (updates[key] !== undefined) {
      const value = TEMPLATE_JSON_FIELDS.has(key)
        ? JSON.stringify(updates[key])
        : updates[key]
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(value)
      paramIndex++
    }
  }

  if (setClauses.length === 0) {
    return getMatchTemplate(templateId)
  }

  setClauses.push(`updated_at = NOW()`)

  const { rows } = await query(
    `UPDATE match_templates SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToTemplate(rows[0])
}

/**
 * Delete a match template by ID.
 * @returns {boolean} true if deleted, false if not found
 */
export async function deleteMatchTemplate(templateId) {
  const { rows } = await query(
    'DELETE FROM match_templates WHERE id = $1 RETURNING id',
    [templateId]
  )
  return rows.length > 0
}

// ---- Scheduled Events CRUD ----

/**
 * Valid scheduled event statuses.
 * Lifecycle: planned → ssi_created → calendar_published → staffed → ready → completed
 * Any state can transition to → failed (with error_details)
 */
export const EVENT_STATUSES = ['planned', 'ssi_created', 'calendar_published', 'staffed', 'ready', 'completed', 'failed']

/**
 * Convert a PostgreSQL scheduled_events row to API format.
 */
function rowToEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id || null,
    disciplineId: row.discipline_id || null,
    eventName: row.event_name || null,
    eventDate: row.event_date,
    status: row.status,
    ssiReferences: row.ssi_references || {},
    calendarReference: row.calendar_reference || {},
    assignedStaff: row.assigned_staff || [],
    errorDetails: row.error_details || null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

/**
 * Create a scheduled event for a specific date from a template.
 * @param {object} params - { tenantId, templateId, eventDate, createdBy }
 * @returns {{ eventId, event }}
 */
export async function createScheduledEvent({ tenantId, templateId, disciplineId = null, eventDate, createdBy, eventName = null }) {
  const eventId = generateId('evt')
  const { rows } = await query(
    `INSERT INTO scheduled_events (id, tenant_id, template_id, discipline_id, event_name, event_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7)
     RETURNING *`,
    [eventId, tenantId, templateId, disciplineId, eventName, eventDate, createdBy]
  )

  // Auto-populate staffing needs from template's staffing_rules
  if (templateId) {
    try {
      const template = await getMatchTemplate(templateId)
      const roles = template?.staffingRules?.roles
      if (Array.isArray(roles) && roles.length > 0) {
        for (const role of roles) {
          const needId = generateId('ned')
          await query(
            'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
            [needId, eventId, role.key, role.label || role.key, role.min || 0, role.max || 1]
          )
        }
      }
    } catch (err) {
      // Log but don't fail event creation if staffing auto-populate fails
      console.warn('[platform-store] Failed to auto-populate staffing needs:', err.message)
    }
  }

  return { eventId, event: rowToEvent(rows[0]) }
}

/**
 * Get the set of SSI event IDs that are already imported for a tenant.
 * Used to mark already-imported events in search results.
 */
export async function getImportedSsiEventIds(tenantId) {
  const { rows } = await query(
    `SELECT ssi_references->>'ssiEventId' as ssi_event_id
     FROM scheduled_events
     WHERE tenant_id = $1 AND ssi_references->>'ssiEventId' IS NOT NULL`,
    [tenantId]
  )
  return new Set(rows.map(r => r.ssi_event_id))
}

export async function importSsiEvent({ tenantId, eventName, eventDate, ssiReferences, createdBy, templateId = null, disciplineId = null }) {
  // Prevent duplicate imports: check if this SSI event is already imported for this tenant
  if (ssiReferences?.ssiEventId) {
    const { rows: existing } = await query(
      `SELECT id FROM scheduled_events WHERE tenant_id = $1 AND ssi_references->>'ssiEventId' = $2`,
      [tenantId, String(ssiReferences.ssiEventId)]
    )
    if (existing.length > 0) {
      throw new Error(`Already imported: "${eventName}" (SSI #${ssiReferences.ssiEventId})`)
    }
  }

  const eventId = generateId('evt')
  const { rows } = await query(
    `INSERT INTO scheduled_events (id, tenant_id, template_id, discipline_id, event_name, event_date, status, ssi_references, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'ssi_created', $7, $8)
     RETURNING *`,
    [eventId, tenantId, templateId, disciplineId, eventName, eventDate, JSON.stringify(ssiReferences), createdBy]
  )

  // Auto-populate staffing needs from template's staffing_rules
  if (templateId) {
    try {
      const template = await getMatchTemplate(templateId)
      const roles = template?.staffingRules?.roles
      if (Array.isArray(roles) && roles.length > 0) {
        for (const role of roles) {
          const needId = generateId('ned')
          await query(
            'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
            [needId, eventId, role.key, role.label || role.key, role.min || 0, role.max || 1]
          )
        }
      }
    } catch (err) {
      console.warn('[platform-store] Failed to auto-populate staffing needs for SSI import:', err.message)
    }
  }

  return { eventId, event: rowToEvent(rows[0]) }
}

/**
 * Create multiple scheduled events in a batch (one per date).
 * Returns array of { eventId, event } or { error, date } for failures.
 * Uses individual inserts (not transaction) so partial success is possible.
 */
export async function createScheduledEventBatch({ tenantId, templateId, dates, createdBy }) {
  // Look up template once to derive event names and disciplineId
  let template = null
  try { template = await getMatchTemplate(templateId) } catch { /* ignore */ }

  const results = []
  for (const date of dates) {
    try {
      const { eventId, event } = await createScheduledEvent({
        tenantId, templateId, eventDate: date, createdBy,
        disciplineId: template?.disciplineId || null,
        eventName: template?.name || null,
      })
      results.push({ success: true, eventId, event, date })
    } catch (err) {
      const isDuplicate = err.code === '23505' || err.message.includes('duplicate')
      results.push({
        success: false,
        date,
        error: isDuplicate ? `Event already exists for ${date}` : err.message,
      })
    }
  }
  return results
}

/**
 * Get a scheduled event by ID.
 */
export async function getScheduledEvent(eventId) {
  const { rows } = await query(
    'SELECT * FROM scheduled_events WHERE id = $1',
    [eventId]
  )
  if (rows.length === 0) return null
  return rowToEvent(rows[0])
}

/**
 * List scheduled events for a tenant, ordered by date.
 * Optionally filter by templateId and/or status.
 */
export async function listScheduledEvents(tenantId, { templateId, status } = {}) {
  let sql = 'SELECT * FROM scheduled_events WHERE tenant_id = $1'
  const params = [tenantId]
  let paramIdx = 2

  if (templateId) {
    sql += ` AND template_id = $${paramIdx}`
    params.push(templateId)
    paramIdx++
  }
  if (status) {
    sql += ` AND status = $${paramIdx}`
    params.push(status)
    paramIdx++
  }

  sql += ' ORDER BY event_date ASC'
  const { rows } = await query(sql, params)
  return rows.map(rowToEvent)
}

/**
 * Update a scheduled event's status and optional fields.
 * Used during SSI creation, calendar publishing, staffing, etc.
 */
export async function updateScheduledEvent(eventId, updates) {
  const allowedFields = {
    status: 'status',
    ssiReferences: 'ssi_references',
    calendarReference: 'calendar_reference',
    assignedStaff: 'assigned_staff',
    errorDetails: 'error_details',
  }

  for (const key of Object.keys(updates)) {
    if (!(key in allowedFields)) {
      throw new Error(`updateScheduledEvent: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [eventId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      const value = typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(value)
      paramIndex++
    }
  }

  if (setClauses.length === 0) return getScheduledEvent(eventId)

  setClauses.push('updated_at = NOW()')

  const { rows } = await query(
    `UPDATE scheduled_events SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToEvent(rows[0])
}

/**
 * Delete a scheduled event. Allows deleting events in any status (planned, failed, ssi_created, calendar_published).
 * The caller should handle cascading deletions to external systems before calling this.
 * @returns {boolean}
 */
export async function deleteScheduledEvent(eventId) {
  const { rows } = await query(
    `DELETE FROM scheduled_events WHERE id = $1 RETURNING id`,
    [eventId]
  )
  return rows.length > 0
}

// ---- Password Reset Tokens ----

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

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

const PLATFORM_SESSION_TTL = 24 * 60 * 60 // 24 hours in seconds

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

// ============================================================================
// STAFFING (ROSTER) OPERATIONS
// ============================================================================

/**
 * Get upcoming events that need staff for a tenant.
 * Returns array of { event, needs[], isUnderstaffed }.
 */
export async function getUpcomingStaffingNeeds(tenantId) {
  const result = await query(`
    SELECT 
      e.id as event_id, e.event_date, e.event_name, e.status as event_status,
      e.created_by,
      mt.name as template_name, mt.overrides as template_overrides,
      mt.ssi_seed_snapshot as seed_snapshot,
      d.name as discipline_name,
      creator.name as creator_name,
      n.id as need_id, n.role_key, n.role_label, n.min_count, n.max_count,
      s.id as signup_id, s.account_id, a.name as account_name, s.status, s.notes
    FROM scheduled_events e
    JOIN event_staffing_needs n ON e.id = n.event_id
    LEFT JOIN staff_signups s ON n.id = s.need_id AND s.status = 'confirmed'
    LEFT JOIN accounts a ON s.account_id = a.id
    LEFT JOIN match_templates mt ON e.template_id = mt.id
    LEFT JOIN disciplines d ON mt.discipline_id = d.id
    LEFT JOIN accounts creator ON e.created_by = creator.id
    WHERE e.tenant_id = $1 AND e.event_date >= CURRENT_DATE
    ORDER BY e.event_date ASC, n.role_label ASC
  `, [tenantId])

  const eventsMap = {}
  for (const row of result.rows) {
    if (!eventsMap[row.event_id]) {
      // Derive venue from template overrides
      const overrides = row.template_overrides || {}
      const snapshot = row.seed_snapshot || {}
      const venue = overrides.venue || snapshot.venue || null
      // Derive match count from seed snapshot
      const matchCount = snapshot.matchCount || (snapshot.matches ? snapshot.matches.length : null)

      eventsMap[row.event_id] = {
        event: {
          id: row.event_id,
          eventDate: row.event_date,
          eventName: row.event_name || row.template_name || 'Unnamed Event',
          status: row.event_status,
          templateName: row.template_name || null,
          disciplineName: row.discipline_name || null,
          venue,
          matchCount,
          createdBy: row.creator_name || null,
        },
        needs: [],
        isUnderstaffed: false
      }
    }
    const evt = eventsMap[row.event_id]

    let need = evt.needs.find(n => n.id === row.need_id)
    if (!need) {
      need = {
        id: row.need_id,
        roleKey: row.role_key,
        roleLabel: row.role_label,
        minCount: row.min_count,
        maxCount: row.max_count,
        signups: []
      }
      evt.needs.push(need)
    }

    if (row.signup_id) {
      need.signups.push({
        id: row.signup_id,
        accountId: row.account_id,
        accountName: row.account_name,
        status: row.status,
        notes: row.notes
      })
    }
  }

  const events = Object.values(eventsMap)
  for (const evt of events) {
    evt.isUnderstaffed = evt.needs.some(n => n.signups.length < n.minCount)
  }

  return events
}

/**
 * Get my own staffing commitments for a tenant.
 * Returns array of { event, need, signup }.
 */
export async function getMyStaffingAssignments(tenantId, accountId) {
  const result = await query(`
    SELECT 
      e.id as event_id, e.event_date, e.event_name,
      n.id as need_id, n.role_key, n.role_label,
      s.id as signup_id, s.status, s.notes, s.signed_up_at
    FROM staff_signups s
    JOIN event_staffing_needs n ON s.need_id = n.id
    JOIN scheduled_events e ON n.event_id = e.id
    WHERE e.tenant_id = $1 AND s.account_id = $2 AND s.status = 'confirmed' AND e.event_date >= CURRENT_DATE
    ORDER BY e.event_date ASC
  `, [tenantId, accountId])

  return result.rows.map(row => ({
    event: { id: row.event_id, eventDate: row.event_date, eventName: row.event_name },
    need: { id: row.need_id, roleKey: row.role_key, roleLabel: row.role_label },
    signup: { id: row.signup_id, status: row.status, notes: row.notes, signedUpAt: row.signed_up_at }
  }))
}

/**
 * Get staffing details for a specific event (needs + signups).
 * Returns { event, needs[] } or null if event not found.
 */
export async function getEventStaffing(tenantId, eventId) {
  const evtRes = await query(
    'SELECT id, event_date, event_name FROM scheduled_events WHERE id = $1 AND tenant_id = $2',
    [eventId, tenantId]
  )
  if (evtRes.rows.length === 0) return null

  const result = await query(`
    SELECT 
      n.id as need_id, n.role_key, n.role_label, n.min_count, n.max_count,
      s.id as signup_id, s.account_id, a.name as account_name, s.status, s.notes
    FROM event_staffing_needs n
    LEFT JOIN staff_signups s ON n.id = s.need_id AND s.status = 'confirmed'
    LEFT JOIN accounts a ON s.account_id = a.id
    WHERE n.event_id = $1
    ORDER BY n.role_label ASC
  `, [eventId])

  const event = { id: evtRes.rows[0].id, eventDate: evtRes.rows[0].event_date, eventName: evtRes.rows[0].event_name }
  const needsMap = {}

  for (const row of result.rows) {
    if (!row.need_id) continue
    if (!needsMap[row.need_id]) {
      needsMap[row.need_id] = {
        id: row.need_id,
        roleKey: row.role_key,
        roleLabel: row.role_label,
        minCount: row.min_count,
        maxCount: row.max_count,
        signups: []
      }
    }

    if (row.signup_id) {
      needsMap[row.need_id].signups.push({
        id: row.signup_id,
        accountId: row.account_id,
        accountName: row.account_name,
        status: row.status,
        notes: row.notes
      })
    }
  }

  return { event, needs: Object.values(needsMap) }
}

/**
 * Update staffing needs for an event (upsert/delete pattern).
 */
export async function updateEventStaffingNeeds(tenantId, eventId, needsArray) {
  const evtRes = await query('SELECT id FROM scheduled_events WHERE id = $1 AND tenant_id = $2', [eventId, tenantId])
  if (evtRes.rows.length === 0) throw new Error('Event not found')

  const { pool } = await import('./postgres.js')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const currentRes = await client.query('SELECT id, role_key FROM event_staffing_needs WHERE event_id = $1', [eventId])
    const currentNeeds = currentRes.rows

    const keptNeedIds = new Set()
    for (const need of needsArray) {
      if (need.id) {
        await client.query(
          'UPDATE event_staffing_needs SET role_label = $1, min_count = $2, max_count = $3 WHERE id = $4 AND event_id = $5',
          [need.roleLabel, need.minCount, need.maxCount, need.id, eventId]
        )
        keptNeedIds.add(need.id)
      } else {
        const newId = generateId('ned')
        await client.query(
          'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [newId, eventId, need.roleKey, need.roleLabel, need.minCount, need.maxCount]
        )
        keptNeedIds.add(newId)
      }
    }

    for (const cn of currentNeeds) {
      if (!keptNeedIds.has(cn.id)) {
        await client.query('DELETE FROM event_staffing_needs WHERE id = $1', [cn.id])
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Sign up for an event staffing role.
 * Validates need exists, role isn't full, and account hasn't already signed up.
 */
export async function signupForEventStaffing(tenantId, eventId, needId, accountId, notes) {
  const res = await query(
    'SELECT n.id, n.max_count FROM event_staffing_needs n JOIN scheduled_events e ON n.event_id = e.id WHERE n.id = $1 AND e.id = $2 AND e.tenant_id = $3',
    [needId, eventId, tenantId]
  )
  if (res.rows.length === 0) throw new Error('Need or event not found')

  const maxCount = res.rows[0].max_count

  const countRes = await query(
    "SELECT COUNT(*) as count FROM staff_signups WHERE need_id = $1 AND status = 'confirmed'",
    [needId]
  )
  if (parseInt(countRes.rows[0].count) >= maxCount) {
    throw new Error('This role is already fully staffed')
  }

  const existingRes = await query(
    "SELECT id FROM staff_signups WHERE need_id = $1 AND account_id = $2 AND status = 'confirmed'",
    [needId, accountId]
  )
  if (existingRes.rows.length > 0) {
    throw new Error('You are already signed up for this role')
  }

  const id = generateId('sup')
  const insertRes = await query(
    'INSERT INTO staff_signups (id, event_id, need_id, account_id, status, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [id, eventId, needId, accountId, 'confirmed', notes || null]
  )
  return insertRes.rows[0]
}

/**
 * Backfill staffing needs for existing events that have a template with staffing_rules
 * but no event_staffing_needs rows yet. Purely local DB — no SSI writes.
 * @param {string} tenantId
 * @returns {{ backfilledCount, skippedCount, errors[] }}
 */
export async function backfillStaffingNeeds(tenantId, { defaultTemplateId } = {}) {
  // Find upcoming events with no staffing needs rows yet
  // Includes events WITH template_id and events WITHOUT (e.g. SSI imports)
  const { rows: events } = await query(`
    SELECT e.id as event_id, e.event_name, e.template_id, e.discipline_id, e.event_date
    FROM scheduled_events e
    LEFT JOIN event_staffing_needs n ON e.id = n.event_id
    WHERE e.tenant_id = $1
      AND n.id IS NULL
      AND e.event_date >= CURRENT_DATE
  `, [tenantId])

  console.log(`[backfill] Found ${events.length} events without staffing needs for tenant ${tenantId}`)
  for (const e of events) {
    console.log(`[backfill]   event=${e.event_id} name="${e.event_name}" date=${e.event_date} tpl=${e.template_id} disc=${e.discipline_id}`)
  }

  // Pre-load all templates for this tenant (keyed by id and by discipline_id)
  const { rows: tplRows } = await query(
    `SELECT id, name, discipline_id, staffing_rules FROM match_templates WHERE tenant_id = $1`, [tenantId]
  )
  console.log(`[backfill] Found ${tplRows.length} templates for tenant`)
  for (const t of tplRows) {
    const rolesCount = Array.isArray(t.staffing_rules?.roles) ? t.staffing_rules.roles.length : 0
    console.log(`[backfill]   tpl=${t.id} name="${t.name}" disc=${t.discipline_id} roles=${rolesCount} staffing_rules=${JSON.stringify(t.staffing_rules)}`)
  }

  const templatesById = {}
  const templatesByDiscipline = {}
  for (const t of tplRows) {
    templatesById[t.id] = t
    if (t.discipline_id) {
      // Keep first match per discipline (if multiple templates, first wins)
      if (!templatesByDiscipline[t.discipline_id]) {
        templatesByDiscipline[t.discipline_id] = t
      }
    }
  }

  let backfilledCount = 0
  let skippedCount = 0
  const errors = []

  for (const evt of events) {
    try {
      // Resolve template: direct link first, then match by discipline, then default
      let tpl = evt.template_id ? templatesById[evt.template_id] : null
      let matchMethod = evt.template_id ? 'template_id' : 'none'
      if (!tpl && evt.discipline_id) {
        tpl = templatesByDiscipline[evt.discipline_id]
        if (tpl) matchMethod = 'discipline_id'
      }
      if (!tpl && defaultTemplateId) {
        tpl = templatesById[defaultTemplateId]
        if (tpl) matchMethod = 'default_template'
      }
      // Auto-link the template to the event for future consistency
      if (tpl && matchMethod !== 'template_id') {
        await query(
          'UPDATE scheduled_events SET template_id = $1, discipline_id = COALESCE(discipline_id, $2) WHERE id = $3',
          [tpl.id, tpl.discipline_id, evt.event_id]
        )
      }
      console.log(`[backfill]   processing event=${evt.event_id}: matched=${matchMethod} tpl=${tpl?.id || 'NONE'}`)

      const staffingRules = tpl?.staffing_rules || {}
      const roles = staffingRules?.roles
      if (!Array.isArray(roles) || roles.length === 0) {
        console.log(`[backfill]   SKIP event=${evt.event_id}: no roles in staffing_rules (keys: ${Object.keys(staffingRules).join(',')})`)
        skippedCount++
        continue
      }
      for (const role of roles) {
        const needId = generateId('ned')
        await query(
          'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [needId, evt.event_id, role.key, role.label || role.key, role.min || 0, role.max || 1]
        )
      }
      backfilledCount++
    } catch (err) {
      errors.push({ eventId: evt.event_id, error: err.message })
    }
  }

  return { backfilledCount, skippedCount, errors }
}

/**
 * Get staffing leaderboard for a tenant.
 * Aggregates confirmed staff_signups per account, counting distinct events staffed
 * and total role signups. Neutral framing — "volunteer activity", not competition.
 * @param {string} tenantId
 * @param {object} [options] - { period: 'all' | '12m' | '6m' | '3m' }
 * @returns {Array<{ accountId, accountName, eventsStaffed, totalSignups, roles }>}
 */
export async function getStaffingLeaderboard(tenantId, options = {}) {
  const { period = 'all' } = options

  let dateFilter = ''
  const params = [tenantId]

  if (period === '12m') {
    dateFilter = " AND e.event_date >= CURRENT_DATE - INTERVAL '12 months'"
  } else if (period === '6m') {
    dateFilter = " AND e.event_date >= CURRENT_DATE - INTERVAL '6 months'"
  } else if (period === '3m') {
    dateFilter = " AND e.event_date >= CURRENT_DATE - INTERVAL '3 months'"
  }

  const result = await query(`
    SELECT
      s.account_id,
      a.name as account_name,
      COUNT(DISTINCT s.event_id) as events_staffed,
      COUNT(s.id) as total_signups,
      ARRAY_AGG(DISTINCT n.role_label ORDER BY n.role_label) as roles
    FROM staff_signups s
    JOIN scheduled_events e ON s.event_id = e.id
    JOIN event_staffing_needs n ON s.need_id = n.id
    JOIN accounts a ON s.account_id = a.id
    WHERE e.tenant_id = $1
      AND s.status = 'confirmed'
      ${dateFilter}
    GROUP BY s.account_id, a.name
    ORDER BY events_staffed DESC, total_signups DESC, a.name ASC
  `, params)

  return result.rows.map(row => ({
    accountId: row.account_id,
    accountName: row.account_name,
    eventsStaffed: parseInt(row.events_staffed),
    totalSignups: parseInt(row.total_signups),
    roles: row.roles || [],
  }))
}

export async function withdrawFromEventStaffing(tenantId, eventId, signupId, accountId) {
  const res = await query(
    "SELECT s.id FROM staff_signups s JOIN scheduled_events e ON s.event_id = e.id WHERE s.id = $1 AND e.id = $2 AND e.tenant_id = $3 AND s.account_id = $4 AND s.status = 'confirmed'",
    [signupId, eventId, tenantId, accountId]
  )
  if (res.rows.length === 0) throw new Error('Signup not found or already withdrawn')

  const updateRes = await query(
    "UPDATE staff_signups SET status = 'withdrawn', withdrawn_at = NOW() WHERE id = $1 RETURNING *",
    [signupId]
  )
  return updateRes.rows[0]
}
