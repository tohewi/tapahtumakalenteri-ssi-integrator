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
  mfa_enabled   BOOLEAN DEFAULT FALSE,
  mfa_secret    TEXT,
  mfa_recovery_codes TEXT[],
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

-- Disciplines (competition types per tenant)
CREATE TABLE IF NOT EXISTS disciplines (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  label_fi          TEXT DEFAULT '',
  label_en          TEXT DEFAULT '',
  ssi_group_id      TEXT,
  ssi_organizer_id  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Index for listing disciplines by tenant
CREATE INDEX IF NOT EXISTS idx_disciplines_tenant_id ON disciplines (tenant_id);

-- Match templates (event blueprints per discipline)
CREATE TABLE IF NOT EXISTS match_templates (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  discipline_id     TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  ssi_seed_event_id TEXT,
  ssi_seed_snapshot JSONB,
  overrides         JSONB DEFAULT '{}',
  calendar_template JSONB DEFAULT '{}',
  staffing_rules    JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Index for listing templates by discipline
CREATE INDEX IF NOT EXISTS idx_match_templates_discipline_id ON match_templates (discipline_id);
-- Index for listing templates by tenant
CREATE INDEX IF NOT EXISTS idx_match_templates_tenant_id ON match_templates (tenant_id);

-- Scheduled events (instances of templates for specific dates, or imported SSI events)
CREATE TABLE IF NOT EXISTS scheduled_events (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id         TEXT REFERENCES match_templates(id) ON DELETE CASCADE,
  event_name          TEXT,
  event_date          DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'planned',
  ssi_references      JSONB DEFAULT '{}',
  calendar_reference  JSONB DEFAULT '{}',
  assigned_staff      JSONB DEFAULT '[]',
  error_details       TEXT,
  created_by          TEXT NOT NULL REFERENCES accounts(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index for listing events by tenant
CREATE INDEX IF NOT EXISTS idx_scheduled_events_tenant_id ON scheduled_events (tenant_id);
-- Index for listing events by template
CREATE INDEX IF NOT EXISTS idx_scheduled_events_template_id ON scheduled_events (template_id);
-- Index for date-based queries (upcoming events)
CREATE INDEX IF NOT EXISTS idx_scheduled_events_date ON scheduled_events (event_date);
-- Prevent duplicate events on the same date for the same template (only for template-based events)
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_events_template_date ON scheduled_events (template_id, event_date) WHERE template_id IS NOT NULL;

-- Tenant members (RBAC — links accounts to tenants with roles)
CREATE TABLE IF NOT EXISTS tenant_members (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  roles       TEXT[] NOT NULL DEFAULT '{}',
  invited_by  TEXT REFERENCES accounts(id),
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, account_id)
);

-- Index for listing members by tenant
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members (tenant_id);
-- Index for listing memberships by account (dashboard: "my tenants")
CREATE INDEX IF NOT EXISTS idx_tenant_members_account_id ON tenant_members (account_id);

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  roles       TEXT[] NOT NULL DEFAULT '{}',
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL REFERENCES accounts(id),
  status      TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired, revoked
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant_id ON tenant_invitations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON tenant_invitations (email);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token_hash ON tenant_invitations (token_hash);
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

      // ---- Incremental migrations for existing databases ----

      // M1: Make scheduled_events.template_id nullable (for SSI imports without a template)
      try {
        await client.query('ALTER TABLE scheduled_events ALTER COLUMN template_id DROP NOT NULL')
      } catch { /* already nullable or table doesn't exist yet */ }

      // M2: Add event_name column to scheduled_events (for imported SSI events)
      try {
        await client.query('ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS event_name TEXT')
      } catch { /* column already exists */ }

      // M3: Replace old unique index with partial index (only for template-based events)
      try {
        await client.query('DROP INDEX IF EXISTS idx_scheduled_events_template_date')
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_events_template_date ON scheduled_events (template_id, event_date) WHERE template_id IS NOT NULL')
      } catch (err) {
        log.warn('[postgres] Could not update scheduled_events unique index:', err.message)
      }

      // M4: Add MFA columns to accounts table
      try {
        await client.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE')
        await client.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_secret TEXT')
        await client.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_recovery_codes TEXT[]')
      } catch { /* columns already exist or table doesn't exist yet */ }

      // M5: Add password_reset_tokens table
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id          TEXT PRIMARY KEY,
            account_id  TEXT NOT NULL REFERENCES accounts(id),
            token_hash  TEXT NOT NULL,
            expires_at  TIMESTAMPTZ NOT NULL,
            used_at     TIMESTAMPTZ,
            created_at  TIMESTAMPTZ DEFAULT NOW()
          )
        `)
        await client.query('CREATE INDEX IF NOT EXISTS idx_prt_account ON password_reset_tokens (account_id)')
        await client.query('CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens (token_hash)')
      } catch { /* table already exists */ }

      // M7: Add discipline_id to scheduled_events (direct link, not only via template)
      try {
        await client.query('ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS discipline_id TEXT REFERENCES disciplines(id)')
        await client.query('CREATE INDEX IF NOT EXISTS idx_scheduled_events_discipline ON scheduled_events (discipline_id)')
      } catch { /* column already exists */ }

      // M8: Staffing tables
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS event_staffing_needs (
            id          TEXT PRIMARY KEY,
            event_id    TEXT NOT NULL REFERENCES scheduled_events(id) ON DELETE CASCADE,
            role_key    TEXT NOT NULL,
            role_label  TEXT NOT NULL,
            min_count   INT NOT NULL DEFAULT 1,
            max_count   INT NOT NULL DEFAULT 1,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(event_id, role_key)
          )
        `)
        await client.query(`
          CREATE TABLE IF NOT EXISTS staff_signups (
            id           TEXT PRIMARY KEY,
            event_id     TEXT NOT NULL REFERENCES scheduled_events(id) ON DELETE CASCADE,
            need_id      TEXT NOT NULL REFERENCES event_staffing_needs(id) ON DELETE CASCADE,
            account_id   TEXT NOT NULL REFERENCES accounts(id),
            status       TEXT NOT NULL DEFAULT 'confirmed', -- confirmed, withdrawn, no_show
            signed_up_at TIMESTAMPTZ DEFAULT NOW(),
            withdrawn_at TIMESTAMPTZ,
            notes        TEXT,
            UNIQUE(need_id, account_id)
          )
        `)
        await client.query('CREATE INDEX IF NOT EXISTS idx_staff_needs_event ON event_staffing_needs(event_id)')
        await client.query('CREATE INDEX IF NOT EXISTS idx_staff_signups_event ON staff_signups(event_id)')
        await client.query('CREATE INDEX IF NOT EXISTS idx_staff_signups_account ON staff_signups(account_id)')
      } catch (err) {
        log.warn('[postgres] Could not create staffing tables:', err.message)
      }

      // Optional unique constraints — may fail on existing data with duplicates.
      // App-level checks in createTenant/createAccountWithTenant still prevent new duplicates.
      try {
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name_unique ON tenants (LOWER(name))')
      } catch (err) {
        log.warn('[postgres] Could not create tenant name unique index (duplicate names exist):', err.message)
      }
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
