/**
 * Database client for SSI Tools configuration management
 *
 * Provides functions to read and write configuration from PostgreSQL.
 * Falls back to YAML file if DATABASE_URL is not set (local development).
 */

import pg from 'pg'
const { Pool } = pg

let pool = null

/**
 * Initialize database connection pool
 */
export function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set - configuration will load from YAML file')
    return null
  }

  if (pool) return pool

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err)
  })

  return pool
}

/**
 * Get database connection pool
 */
export function getDb() {
  if (!pool) {
    initDb()
  }
  return pool
}

/**
 * Check if database is available
 */
export function isDbAvailable() {
  return pool !== null && process.env.DATABASE_URL !== undefined
}

/**
 * Close database connection pool
 */
export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// ============================================================
// Admin Users
// ============================================================

/**
 * Check if a user is an admin
 * @param {string} email - User email
 * @returns {Promise<{id: number, isRoot: boolean, email: string} | null>}
 */
export async function getAdminUser(email) {
  if (!isDbAvailable()) return null

  const result = await pool.query(
    'SELECT id, email, is_root FROM admin_users WHERE email = $1 AND active = true',
    [email]
  )

  if (result.rows.length === 0) return null

  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    isRoot: result.rows[0].is_root
  }
}

/**
 * Update last login timestamp for admin user
 * @param {string} email - User email
 */
export async function updateAdminLogin(email) {
  if (!isDbAvailable()) return

  await pool.query(
    'UPDATE admin_users SET last_login_at = NOW() WHERE email = $1',
    [email]
  )
}

/**
 * List all admin users
 * @returns {Promise<Array<{id: number, email: string, isRoot: boolean, createdAt: Date}>>}
 */
export async function listAdminUsers() {
  if (!isDbAvailable()) return []

  const result = await pool.query(`
    SELECT id, email, is_root, created_at, last_login_at, active
    FROM admin_users
    WHERE active = true
    ORDER BY is_root DESC, created_at ASC
  `)

  return result.rows.map(row => ({
    id: row.id,
    email: row.email,
    isRoot: row.is_root,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    active: row.active
  }))
}

/**
 * Add a new admin user
 * @param {string} email - New admin email
 * @param {string} createdBy - Email of admin creating this user
 * @returns {Promise<{id: number}>}
 */
export async function addAdminUser(email, createdBy) {
  if (!isDbAvailable()) {
    throw new Error('Database not available')
  }

  const result = await pool.query(
    'INSERT INTO admin_users (email, created_by) VALUES ($1, $2) RETURNING id',
    [email, createdBy]
  )

  return { id: result.rows[0].id }
}

/**
 * Remove admin user (soft delete)
 * @param {string} email - Admin email to remove
 */
export async function removeAdminUser(email) {
  if (!isDbAvailable()) {
    throw new Error('Database not available')
  }

  // Cannot remove root admin
  const admin = await getAdminUser(email)
  if (admin?.isRoot) {
    throw new Error('Cannot remove root admin')
  }

  await pool.query(
    'UPDATE admin_users SET active = false WHERE email = $1',
    [email]
  )
}

// ============================================================
// Staff Sites
// ============================================================

/**
 * List all active staff sites
 * @returns {Promise<Array<{id: number, key: string, name: string}>>}
 */
export async function listStaffSites() {
  if (!isDbAvailable()) return []

  const result = await pool.query(`
    SELECT id, key, name, organization_name, organization_range, timezone, created_at
    FROM staff_sites
    WHERE active = true
    ORDER BY name
  `)

  return result.rows.map(row => ({
    id: row.id,
    key: row.key,
    name: row.name,
    organizationName: row.organization_name,
    organizationRange: row.organization_range,
    timezone: row.timezone,
    createdAt: row.created_at
  }))
}

/**
 * Get staff site by key
 * @param {string} key - Site key
 * @returns {Promise<{id: number, key: string, name: string, config: object} | null>}
 */
export async function getStaffSite(key) {
  if (!isDbAvailable()) return null

  const siteResult = await pool.query(`
    SELECT id, key, name, organization_name, organization_range, timezone
    FROM staff_sites
    WHERE key = $1 AND active = true
  `, [key])

  if (siteResult.rows.length === 0) return null

  const site = siteResult.rows[0]

  // Load all config sections for this site
  const configResult = await pool.query(`
    SELECT config_key, config_value
    FROM staff_site_config
    WHERE site_id = $1
  `, [site.id])

  const config = {
    organization: {
      name: site.organization_name,
      range: site.organization_range,
      timezone: site.timezone
    }
  }

  for (const row of configResult.rows) {
    config[row.config_key] = row.config_value
  }

  return {
    id: site.id,
    key: site.key,
    name: site.name,
    config
  }
}

/**
 * Create a new staff site
 * @param {object} site - Site data
 * @returns {Promise<{id: number}>}
 */
export async function createStaffSite(site) {
  if (!isDbAvailable()) {
    throw new Error('Database not available')
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Insert site
    const siteResult = await client.query(`
      INSERT INTO staff_sites (key, name, organization_name, organization_range, timezone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      site.key,
      site.name,
      site.organizationName,
      site.organizationRange || '',
      site.timezone || 'Europe/Helsinki'
    ])

    const siteId = siteResult.rows[0].id

    // Insert config sections if provided
    if (site.config) {
      for (const [key, value] of Object.entries(site.config)) {
        if (key !== 'organization') { // organization stored in site table
          await client.query(`
            INSERT INTO staff_site_config (site_id, config_key, config_value)
            VALUES ($1, $2, $3)
          `, [siteId, key, JSON.stringify(value)])
        }
      }
    }

    await client.query('COMMIT')

    return { id: siteId }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Update staff site configuration
 * @param {string} key - Site key
 * @param {object} updates - Fields to update
 */
export async function updateStaffSite(key, updates) {
  if (!isDbAvailable()) {
    throw new Error('Database not available')
  }

  const site = await getStaffSite(key)
  if (!site) {
    throw new Error(`Site not found: ${key}`)
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Update site metadata if provided
    if (updates.name || updates.organizationName || updates.organizationRange || updates.timezone) {
      const fields = []
      const values = []
      let paramIndex = 1

      if (updates.name) {
        fields.push(`name = $${paramIndex++}`)
        values.push(updates.name)
      }
      if (updates.organizationName) {
        fields.push(`organization_name = $${paramIndex++}`)
        values.push(updates.organizationName)
      }
      if (updates.organizationRange !== undefined) {
        fields.push(`organization_range = $${paramIndex++}`)
        values.push(updates.organizationRange)
      }
      if (updates.timezone) {
        fields.push(`timezone = $${paramIndex++}`)
        values.push(updates.timezone)
      }

      fields.push(`updated_at = NOW()`)
      values.push(key)

      await client.query(`
        UPDATE staff_sites
        SET ${fields.join(', ')}
        WHERE key = $${paramIndex}
      `, values)
    }

    // Update config sections if provided
    if (updates.config) {
      for (const [configKey, value] of Object.entries(updates.config)) {
        if (configKey !== 'organization') {
          await client.query(`
            INSERT INTO staff_site_config (site_id, config_key, config_value, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (site_id, config_key)
            DO UPDATE SET config_value = $3, updated_at = NOW()
          `, [site.id, configKey, JSON.stringify(value)])
        }
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
 * Delete staff site
 * @param {string} key - Site key
 */
export async function deleteStaffSite(key) {
  if (!isDbAvailable()) {
    throw new Error('Database not available')
  }

  await pool.query(
    'UPDATE staff_sites SET active = false WHERE key = $1',
    [key]
  )
}

// ============================================================
// Event Filters
// ============================================================

/**
 * Get event filters for a staff site
 * @param {string} siteKey - Site key
 * @returns {Promise<Array<{id: number, type: string, value: string, futureOnly: boolean}>>}
 */
export async function getEventFilters(siteKey) {
  if (!isDbAvailable()) return []

  const site = await getStaffSite(siteKey)
  if (!site) return []

  const result = await pool.query(`
    SELECT id, filter_type, filter_value, future_only
    FROM site_event_filters
    WHERE site_id = $1
    ORDER BY created_at
  `, [site.id])

  return result.rows.map(row => ({
    id: row.id,
    type: row.filter_type,
    value: row.filter_value,
    futureOnly: row.future_only
  }))
}

/**
 * Add event filter for a staff site
 * @param {string} siteKey - Site key
 * @param {object} filter - Filter data
 */
export async function addEventFilter(siteKey, filter) {
  if (!isDbAvailable()) {
    throw new Error('Database not available')
  }

  const site = await getStaffSite(siteKey)
  if (!site) {
    throw new Error(`Site not found: ${siteKey}`)
  }

  await pool.query(`
    INSERT INTO site_event_filters (site_id, filter_type, filter_value, future_only)
    VALUES ($1, $2, $3, $4)
  `, [site.id, filter.type, filter.value, filter.futureOnly !== false])
}

/**
 * Remove event filter
 * @param {number} filterId - Filter ID
 */
export async function removeEventFilter(filterId) {
  if (!isDbAvailable()) {
    throw new Error('Database not available')
  }

  await pool.query('DELETE FROM site_event_filters WHERE id = $1', [filterId])
}
