/**
 * Database migration script for SSI Tools Management Site
 *
 * This script creates the database schema for persistent configuration storage.
 * Run automatically on server startup if schema_version table doesn't exist.
 *
 * Usage:
 *   - Automatic: Set DATABASE_URL env var and start server
 *   - Manual: node scoring-proxy/lib/db/migrate.js
 *   - Clean deploy: Set CLEAN_DEPLOY=true to drop and recreate all tables
 */

import { createRequire } from 'module'

const require = createRequire(import.meta.url)

let Pool = null
let pgLoadError = null

function getPoolCtor() {
  if (Pool || pgLoadError) return Pool

  try {
    const pg = require('pg')
    Pool = pg.Pool
  } catch (err) {
    pgLoadError = err
    Pool = null
  }

  return Pool
}

// Lazy pool initialization - only create when migrate() is called
let pool = null

function getPool() {
  if (!pool) {
    const DATABASE_URL = process.env.DATABASE_URL

    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required')
    }

    const PoolCtor = getPoolCtor()
    if (!PoolCtor) {
      throw new Error(`DATABASE_URL is set but pg package is not available: ${pgLoadError?.message || 'unknown error'}`)
    }

    pool = new PoolCtor({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }
  return pool
}

/**
 * Check if schema_version table exists
 */
async function schemaExists() {
  const result = await getPool().query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'schema_version'
    );
  `)
  return result.rows[0].exists
}

/**
 * Get current schema version
 */
async function getCurrentVersion() {
  try {
    const result = await getPool().query('SELECT MAX(version) as version FROM schema_version')
    return result.rows[0].version || 0
  } catch (err) {
    return 0
  }
}

/**
 * Drop all tables (for clean deploy)
 */
async function dropAllTables() {
  console.log('⚠️  CLEAN DEPLOY: Dropping all tables...')
  await getPool().query(`
    DROP TABLE IF EXISTS site_event_filters CASCADE;
    DROP TABLE IF EXISTS staff_site_config CASCADE;
    DROP TABLE IF EXISTS staff_sites CASCADE;
    DROP TABLE IF EXISTS admin_users CASCADE;
    DROP TABLE IF EXISTS schema_version CASCADE;
  `)
  console.log('✓ All tables dropped')
}

/**
 * Migration v1: Initial schema
 */
async function migrateV1() {
  console.log('Running migration v1: Initial schema...')

  // Create schema_version table first
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
      description TEXT
    );
  `)

  // Create admin_users table
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      is_root BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by VARCHAR(255),
      last_login_at TIMESTAMP,
      active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
    CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(active);
  `)

  // Create staff_sites table
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS staff_sites (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      organization_name VARCHAR(255) NOT NULL,
      organization_range VARCHAR(255),
      timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Helsinki',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_staff_sites_key ON staff_sites(key);
    CREATE INDEX IF NOT EXISTS idx_staff_sites_active ON staff_sites(active);
  `)

  // Create staff_site_config table
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS staff_site_config (
      site_id INTEGER NOT NULL REFERENCES staff_sites(id) ON DELETE CASCADE,
      config_key VARCHAR(100) NOT NULL,
      config_value JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (site_id, config_key)
    );

    CREATE INDEX IF NOT EXISTS idx_staff_site_config_site_id ON staff_site_config(site_id);
  `)

  // Create site_event_filters table
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS site_event_filters (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL REFERENCES staff_sites(id) ON DELETE CASCADE,
      filter_type VARCHAR(50) NOT NULL,
      filter_value TEXT NOT NULL,
      future_only BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_site_event_filters_site_id ON site_event_filters(site_id);
  `)

  // Record migration
  await getPool().query(`
    INSERT INTO schema_version (version, description)
    VALUES (1, 'Initial schema: admin_users, staff_sites, staff_site_config, site_event_filters')
    ON CONFLICT (version) DO NOTHING;
  `)

  console.log('✓ Migration v1 complete')
}

/**
 * Initialize root admin from environment variable
 */
async function initRootAdmin() {
  const rootEmail = process.env.ADMIN_ROOT_EMAIL
  
  console.log('\n[admin-init] Checking root admin configuration...')
  console.log(`[admin-init] ADMIN_ROOT_EMAIL env var: ${rootEmail ? rootEmail : '(not set)'}`)
  
  if (!rootEmail) {
    console.warn('⚠️  ADMIN_ROOT_EMAIL not set - no root admin will be created')
    console.warn('   To enable admin features, set ADMIN_ROOT_EMAIL environment variable')
    console.warn('   Example: ADMIN_ROOT_EMAIL=admin@example.com')
    return
  }

  // Check if root admin already exists
  const existing = await getPool().query(
    'SELECT id, email, is_root FROM admin_users WHERE email = $1',
    [rootEmail]
  )

  if (existing.rows.length > 0) {
    const user = existing.rows[0]
    console.log(`✓ Root admin already exists: ${user.email} (id: ${user.id}, root: ${user.is_root})`)
    return
  }

  // Create root admin
  console.log(`[admin-init] Creating root admin: ${rootEmail}`)
  const result = await getPool().query(`
    INSERT INTO admin_users (email, is_root, created_by)
    VALUES ($1, true, 'system')
    RETURNING id
  `, [rootEmail])

  console.log(`✓ Root admin created: ${rootEmail} (id: ${result.rows[0].id})`)
  console.log('  This user can now log in to access the admin UI and add other admins')
}

/**
 * Migrate existing YAML config to database
 */
async function migrateYamlConfig() {
  // Check if sra-training site already exists
  const existing = await pool.query(
    'SELECT id FROM staff_sites WHERE key = $1',
    ['sra-training']
  )

  if (existing.rows.length > 0) {
    console.log('✓ YAML config already migrated (sra-training site exists)')
    return
  }

  console.log('Migrating sra-training-config.yml to database...')

  // Import config loader to read YAML
  const { loadConfig } = await import('../staffing/config-loader.js')
  const config = await loadConfig()

  // Create staff site
  const siteResult = await pool.query(`
    INSERT INTO staff_sites (key, name, organization_name, organization_range, timezone)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [
    'sra-training',
    config.organization.name,
    config.organization.name,
    config.organization.range,
    config.organization.timezone
  ])

  const siteId = siteResult.rows[0].id

  // Insert config sections
  const configSections = [
    { key: 'adminAllowlist', value: config.adminAllowlist },
    { key: 'serviceAccounts', value: config.serviceAccounts || [] },
    { key: 'eventDiscovery', value: config.eventDiscovery },
    { key: 'trainingTypes', value: config.trainingTypes },
    { key: 'roles', value: config.roles },
    { key: 'registration', value: config.registration },
    { key: 'staffAllocation', value: config.staffAllocation },
    { key: 'finalization', value: config.finalization },
    { key: 'notifications', value: config.notifications }
  ]

  for (const section of configSections) {
    await getPool().query(`
      INSERT INTO staff_site_config (site_id, config_key, config_value)
      VALUES ($1, $2, $3)
    `, [siteId, section.key, JSON.stringify(section.value)])
  }

  // Create event filters from searchStrings
  if (config.eventDiscovery?.searchStrings) {
    for (const searchStr of config.eventDiscovery.searchStrings) {
      await getPool().query(`
        INSERT INTO site_event_filters (site_id, filter_type, filter_value, future_only)
        VALUES ($1, $2, $3, $4)
      `, [siteId, 'name_contains', searchStr, true])
    }
  }

  console.log(`✓ Migrated sra-training-config.yml (site_id: ${siteId})`)
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    console.log('Starting database migration...')

    // Check for clean deploy
    if (process.env.CLEAN_DEPLOY === 'true') {
      await dropAllTables()
    }

    // Check if schema exists
    const exists = await schemaExists()

    if (!exists) {
      console.log('Schema does not exist, creating...')
      await migrateV1()
      await initRootAdmin()
      await migrateYamlConfig()
    } else {
      // Check current version and apply missing migrations
      const currentVersion = await getCurrentVersion()
      console.log(`Current schema version: ${currentVersion}`)

      if (currentVersion < 1) {
        await migrateV1()
        await initRootAdmin()
        await migrateYamlConfig()
      }

      // Future migrations would go here
      // if (currentVersion < 2) { await migrateV2() }
    }

    console.log('✓ Migration complete')
  } catch (err) {
    console.error('Migration failed:', err)
    throw err
  }
}

/**
 * Close database connection pool
 */
async function close() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// Export for use in server.js
export { migrate, close }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => {
      console.log('✓ Done')
      process.exit(0)
    })
    .catch((err) => {
      console.error('✗ Failed:', err)
      process.exit(1)
    })
}
