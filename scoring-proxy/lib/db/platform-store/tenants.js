// ============================================================
// Platform Store — Tenant CRUD
// ============================================================

import { query, withTransaction } from '../postgres.js'
import { NotFoundError } from '../../errors/AppError.js'
import { generateId, encryptCredentials, decryptCredentials } from './utils.js'

// ---- Slug helpers ----

/**
 * Generate a URL-friendly slug from a tenant name.
 * Lowercase, replace non-alphanumeric with hyphens, collapse, trim, max 48 chars.
 */
export function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics (å→a, ä→a, ö→o)
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumeric → hyphen
    .replace(/-{2,}/g, '-')         // collapse consecutive hyphens
    .replace(/^-|-$/g, '')          // trim leading/trailing hyphens
    .substring(0, 48)
}

/**
 * Generate a unique slug, appending -2, -3, etc. if needed.
 * @param {Function} queryFn — query(sql, params) or client.query(sql, params)
 */
async function generateUniqueSlug(name, queryFn) {
  const base = generateSlug(name)
  let candidate = base
  let suffix = 2
  while (true) {
    const { rows } = await queryFn('SELECT id FROM tenants WHERE slug = $1', [candidate])
    if (rows.length === 0) return candidate
    candidate = `${base}-${suffix}`
    suffix++
    if (suffix > 100) throw new Error('Could not generate unique slug')
  }
}

// ---- Row mapper ----

function rowToTenant(row, { includeCredentials = false } = {}) {
  if (!row) return null

  // SSI credentials: by default, return only metadata (email + configured flags).
  // Full credentials are only returned when includeCredentials is true (internal use).
  let ssiCredentials = null
  if (row.ssi_credentials) {
    try {
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
    } catch {
      // Decryption failed — key mismatch or corrupted data. Treat as unconfigured.
      // Credentials will need to be re-entered via the tenant settings UI.
      ssiCredentials = null
    }
  }

  // Calendar config: contains encrypted secrets (wpPassword, gmailAppPassword).
  // Same pattern as SSI credentials — mask secrets for API, return full for internal use.
  let calendarConfig = null
  if (row.calendar_config) {
    try {
      // Check if calendar_config is encrypted (has iv/tag/data envelope)
      const rawCfg = row.calendar_config
      if (rawCfg.iv && rawCfg.tag && rawCfg.data) {
        const decrypted = decryptCredentials(rawCfg)
        if (includeCredentials) {
          calendarConfig = decrypted
        } else {
          // Masked response: strip secrets, add has* flags
          const { wpPassword, gmailAppPassword, ...safe } = decrypted
          calendarConfig = {
            ...safe,
            hasWpPassword: !!wpPassword,
            hasGmailAppPassword: !!gmailAppPassword,
          }
        }
      } else {
        // Legacy unencrypted — return as-is (will be encrypted on next save)
        if (includeCredentials) {
          calendarConfig = rawCfg
        } else {
          const { wpPassword, gmailAppPassword, ...safe } = rawCfg
          calendarConfig = {
            ...safe,
            hasWpPassword: !!wpPassword,
            hasGmailAppPassword: !!gmailAppPassword,
          }
        }
      }
    } catch {
      calendarConfig = null
    }
  }

  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    slug: row.slug || null,
    city: row.city || null,
    country: row.country || null,
    timezone: row.timezone || null,
    locale: row.locale || null,
    hasLogo: !!row.has_logo,
    subscription: row.subscription || {},
    ssiCredentials,
    calendarConfig,
    disciplines: row.disciplines || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// ---- Tenant CRUD ----

/**
 * Create a new tenant for an account.
 * Starts with a 30-day free trial.
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

    // Generate a unique slug from the tenant name
    const slug = await generateUniqueSlug(name.trim(), (sql, params) => client.query(sql, params))

    // Insert the new tenant
    const { rows } = await client.query(
      `INSERT INTO tenants (id, account_id, name, slug, subscription, disciplines)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, accountId, name.trim(), slug, JSON.stringify(subscription), JSON.stringify([])]
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
 * Get tenant by slug.
 */
export async function getTenantBySlug(slug) {
  const { rows } = await query(
    'SELECT * FROM tenants WHERE slug = $1',
    [slug]
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
 * List ALL tenants (admin only). Includes owner info and member count.
 * Does NOT include credentials — uses default masking.
 */
export async function listAllTenants() {
  const { rows } = await query(
    `SELECT t.*,
       a.email AS owner_email, a.name AS owner_name,
       (SELECT COUNT(*) FROM tenant_members tm WHERE tm.tenant_id = t.id AND tm.status = 'active') AS member_count
     FROM tenants t
     LEFT JOIN accounts a ON a.id = t.account_id
     ORDER BY t.created_at DESC`
  )
  return rows.map(row => ({
    ...rowToTenant(row),
    ownerEmail: row.owner_email || null,
    ownerName: row.owner_name || null,
    memberCount: parseInt(row.member_count, 10) || 0,
  }))
}

/**
 * Update tenant fields.
 */
export async function updateTenant(tenantId, updates) {
  const allowedFields = {
    name: 'name',
    slug: 'slug',
    city: 'city',
    country: 'country',
    timezone: 'timezone',
    locale: 'locale',
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
          try {
            const existing = decryptCredentials(row_ssi_credentials_cache)
            merged = {
              email: updates[key].email ?? existing.email,
              password: updates[key].password || existing.password,
              apiKey: updates[key].apiKey ?? existing.apiKey,
            }
          } catch {
            // Old credentials can't be decrypted (key mismatch) — use new values only
          }
        }
        // Encrypt merged credentials before storing
        value = JSON.stringify(encryptCredentials(merged))
      } else if (key === 'calendarConfig' && updates[key] !== null) {
        // Merge with existing calendar config — omitted password fields keep current values
        let merged = updates[key]
        const { rows: cfgRows } = await query('SELECT calendar_config FROM tenants WHERE id = $1', [tenantId])
        const existing = cfgRows[0]?.calendar_config
        if (existing) {
          try {
            // Decrypt existing (encrypted or legacy plain)
            const prev = (existing.iv && existing.tag && existing.data)
              ? decryptCredentials(existing)
              : existing
            merged = {
              ...prev,
              ...updates[key],
              // Write-only fields: keep existing if not provided in update
              wpPassword: updates[key].wpPassword || prev.wpPassword,
              gmailAppPassword: updates[key].gmailAppPassword || prev.gmailAppPassword,
            }
          } catch { /* can't decrypt existing — use new values only */ }
        }
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
