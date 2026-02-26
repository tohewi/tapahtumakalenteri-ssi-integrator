// ============================================================
// PostgreSQL Connection Pool & Schema Initialization
//
// Manages the connection pool and runs schema migrations on
// startup. Falls back to null pool for environments without
// DATABASE_URL (local dev without Postgres uses in-memory).
//
// Usage:
//   import { initPostgres, getPool, query } from './postgres.js'
//   await initPostgres()          // call once at startup
//   const { rows } = await query('SELECT * FROM accounts')
// ============================================================

import pg from 'pg'
import { log } from '../logger.js'

const { Pool } = pg

let pool = null

// ---- Schema DDL ----

const SCHEMA_SQL = `
-- Platform accounts (sign-up users who own tenants)
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  tenants       JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for email lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts (LOWER(email));

-- Tenants (organizations owned by accounts)
CREATE TABLE IF NOT EXISTS tenants (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES accounts(id),
  name             TEXT NOT NULL,
  subscription     JSONB DEFAULT '{}',
  ssi_credentials  JSONB,
  calendar_config  JSONB,
  disciplines      JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for listing tenants by account
CREATE INDEX IF NOT EXISTS idx_tenants_account_id ON tenants (account_id);
`

// ---- Initialization ----

/**
 * Initialize the PostgreSQL connection pool and run schema migrations.
 * Safe to call multiple times — idempotent.
 */
export async function initPostgres() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    log.info('[postgres] No DATABASE_URL configured — PostgreSQL disabled')
    return false
  }

  try {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      // Render Postgres requires SSL in production
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })

    // Verify connection
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
      log.info('[postgres] Connected to PostgreSQL')

      // Run schema migrations
      await client.query(SCHEMA_SQL)
      log.info('[postgres] Schema initialized')
    } finally {
      client.release()
    }

    return true
  } catch (err) {
    log.error('[postgres] Failed to initialize:', err.message)
    pool = null
    return false
  }
}

/**
 * Get the connection pool. Returns null if Postgres is not configured.
 */
export function getPool() {
  return pool
}

/**
 * Execute a parameterized query. Throws if Postgres is not initialized.
 */
export async function query(text, params) {
  if (!pool) {
    throw new Error('PostgreSQL not initialized. Call initPostgres() first or set DATABASE_URL.')
  }
  return pool.query(text, params)
}

/**
 * Execute a callback inside a database transaction using row-level locking.
 * The callback receives a pg Client and must use it for all queries.
 * Automatically commits on success and rolls back on error.
 * Uses the default READ COMMITTED isolation level; callers can use
 * SELECT ... FOR UPDATE inside the callback to lock individual rows.
 *
 * @param {(client: pg.PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  if (!pool) {
    throw new Error('PostgreSQL not initialized. Call initPostgres() first or set DATABASE_URL.')
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Check if PostgreSQL is available.
 */
export function isPostgresAvailable() {
  return pool !== null
}

/**
 * Graceful shutdown — drain the pool.
 */
export async function closePostgres() {
  if (pool) {
    await pool.end()
    pool = null
    log.info('[postgres] Connection pool closed')
  }
}

// For testing — allows injecting a mock pool
export function _setPool(mockPool) {
  pool = mockPool
}
