// ============================================================
// PostgreSQL Connection Pool & Schema Initialization
//
// Manages the connection pool and runs schema migrations on
// startup. If DATABASE_URL is not set, the pool remains null
// and Postgres-backed platform features are unavailable.
//
// Usage:
//   import { initPostgres, getPool, query } from './postgres.js'
//   await initPostgres()          // call once at startup
//   const { rows } = await query('SELECT * FROM accounts')
// ============================================================

import pg from 'pg'
import { ManagedIdentityCredential } from '@azure/identity'
import { log } from '../logger.js'

const { Pool } = pg

// Scope for Azure Database for PostgreSQL Flexible Server Entra ID tokens
const PG_ENTRA_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default'

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

// ---- Versioned Migrations ----
//
// Rules:
//   1. Never edit or delete an existing migration — only append new ones.
//   2. version must be a monotonically increasing integer.
//   3. Each migration is wrapped in a transaction automatically by runMigrations.
//   4. Migrations that use CREATE … IF NOT EXISTS / ALTER … IF NOT EXISTS are
//      already idempotent at the SQL level; the version table prevents re-runs.

const MIGRATIONS = [
  {
    version: 1,
    description: 'Make scheduled_events.template_id nullable (for SSI imports without a template)',
    async run(client) {
      await client.query('ALTER TABLE scheduled_events ALTER COLUMN template_id DROP NOT NULL')
    },
  },
  {
    version: 2,
    description: 'Add event_name column to scheduled_events',
    async run(client) {
      await client.query('ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS event_name TEXT')
    },
  },
  {
    version: 3,
    description: 'Replace scheduled_events unique index with partial index for template-based events only',
    async run(client) {
      await client.query('DROP INDEX IF EXISTS idx_scheduled_events_template_date')
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_events_template_date
          ON scheduled_events (template_id, event_date) WHERE template_id IS NOT NULL
      `)
    },
  },
  {
    version: 4,
    description: 'Add MFA columns to accounts table',
    async run(client) {
      await client.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE')
      await client.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_secret TEXT')
      await client.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_recovery_codes TEXT[]')
    },
  },
  {
    version: 5,
    description: 'Create password_reset_tokens table',
    async run(client) {
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
    },
  },
  {
    version: 6,
    description: 'Add discipline_id to scheduled_events',
    async run(client) {
      await client.query('ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS discipline_id TEXT REFERENCES disciplines(id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_scheduled_events_discipline ON scheduled_events (discipline_id)')
    },
  },
  {
    version: 7,
    description: 'Create event_staffing_needs and staff_signups tables',
    async run(client) {
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
          status       TEXT NOT NULL DEFAULT 'confirmed',
          signed_up_at TIMESTAMPTZ DEFAULT NOW(),
          withdrawn_at TIMESTAMPTZ,
          notes        TEXT,
          UNIQUE(need_id, account_id)
        )
      `)
      await client.query('CREATE INDEX IF NOT EXISTS idx_staff_needs_event ON event_staffing_needs(event_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_staff_signups_event ON staff_signups(event_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_staff_signups_account ON staff_signups(account_id)')
    },
  },
  {
    version: 8,
    description: 'Add ssi_create_url to disciplines',
    async run(client) {
      await client.query('ALTER TABLE disciplines ADD COLUMN IF NOT EXISTS ssi_create_url TEXT')
    },
  },
  {
    version: 9,
    description: 'Add SSI identity columns to staff_signups (shooter + participant ID cache)',
    async run(client) {
      await client.query('ALTER TABLE staff_signups ADD COLUMN IF NOT EXISTS ssi_shooter_id TEXT')
      await client.query('ALTER TABLE staff_signups ADD COLUMN IF NOT EXISTS ssi_participant_id TEXT')
    },
  },
  {
    version: 10,
    description: 'Create audit_log table (SEC-H4)',
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id          TEXT PRIMARY KEY,
          tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
          account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          action      TEXT NOT NULL,
          target_type TEXT,
          target_id   TEXT,
          metadata    JSONB,
          ip_address  TEXT,
          created_at  TIMESTAMPTZ DEFAULT NOW()
        )
      `)
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_log(account_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)')
    },
  },
  {
    version: 11,
    description: 'Create ssi_discovered_disciplines table (SSI-R3)',
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ssi_discovered_disciplines (
          id             TEXT PRIMARY KEY,
          display_name   TEXT NOT NULL,
          ssi_create_url TEXT,
          is_cup         BOOLEAN NOT NULL,
          rule_code      TEXT NOT NULL,
          description    TEXT,
          last_seen_at   TIMESTAMPTZ DEFAULT NOW()
        )
      `)
    },
  },
  {
    version: 12,
    description: 'Add post_event_workflows column to match_templates (PEW-1)',
    async run(client) {
      await client.query("ALTER TABLE match_templates ADD COLUMN IF NOT EXISTS post_event_workflows JSONB DEFAULT '[]'")
    },
  },
  {
    version: 13,
    description: 'Add regional settings columns to tenants (city, country, timezone, locale)',
    async run(client) {
      await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city TEXT')
      await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country TEXT')
      await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT')
      await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS locale TEXT')
    },
  },
  {
    version: 14,
    description: 'Create tenant_logos table and add has_logo flag to tenants (MP9 Branding)',
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_logos (
          tenant_id    TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
          content_type TEXT NOT NULL,
          image_data   BYTEA NOT NULL,
          file_size    INTEGER NOT NULL,
          uploaded_at  TIMESTAMPTZ DEFAULT NOW()
        )
      `)
      await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS has_logo BOOLEAN DEFAULT FALSE')
    },
  },
  {
    version: 15,
    description: 'Add slug column to tenants and backfill from name (TEN-1)',
    async run(client) {
      await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT')
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug)')

      // Backfill slugs for existing tenants — runs only once thanks to version tracking
      const { rows: noSlug } = await client.query('SELECT id, name FROM tenants WHERE slug IS NULL')
      for (const row of noSlug) {
        const base = row.name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 48)
        let slug = base
        let suffix = 2
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { rows: dup } = await client.query('SELECT id FROM tenants WHERE slug = $1 AND id != $2', [slug, row.id])
          if (dup.length === 0) break
          slug = `${base}-${suffix}`
          suffix++
        }
        await client.query('UPDATE tenants SET slug = $1 WHERE id = $2', [slug, row.id])
      }
    },
  },
  {
    version: 16,
    description: 'Add integrations JSONB column to tenants (INT-1 Phase 3)',
    async run(client) {
      await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS integrations JSONB DEFAULT '{}'")
    },
  },
  {
    version: 17,
    description: 'Make ssi_create_url nullable in ssi_discovered_disciplines (Y8)',
    async run(client) {
      await client.query('ALTER TABLE ssi_discovered_disciplines ALTER COLUMN ssi_create_url DROP NOT NULL')
    },
  },
  {
    version: 18,
    description: 'Migrate legacy ssiCredentials + calendarConfig into integrations JSONB (INT-1 data migration)',
    async run(client) {
      const { rows: tenantsToMigrate } = await client.query(`
        SELECT id, ssi_credentials, calendar_config, integrations FROM tenants
        WHERE (integrations IS NULL OR integrations = '{}' OR integrations = 'null')
          AND (ssi_credentials IS NOT NULL OR calendar_config IS NOT NULL)
      `)
      for (const t of tenantsToMigrate) {
        const integrations = {}

        // ssi_credentials is stored encrypted — record the type flag so the new UI
        // knows which event system is active (credentials read from legacy column)
        if (t.ssi_credentials) {
          integrations.eventSystem = { type: 'ssi' }
        }

        if (t.calendar_config) {
          try {
            const cfg = typeof t.calendar_config === 'string' ? JSON.parse(t.calendar_config) : t.calendar_config
            if (cfg && (cfg.wpBaseUrl || (cfg.iv && cfg.tag))) {
              integrations.calendarSystem = { type: 'wordpress' }
            }
          } catch { /* ignore parse errors on malformed calendar_config */ }
        }

        if (Object.keys(integrations).length > 0) {
          await client.query('UPDATE tenants SET integrations = $1 WHERE id = $2', [JSON.stringify(integrations), t.id])
          log.info(`[postgres] M18: Migrated integrations for tenant ${t.id}: ${JSON.stringify(integrations)}`)
        }
      }
    },
  },
  {
    version: 19,
    description: 'Create tenant name unique index (best-effort — may skip if duplicates exist)',
    async run(client) {
      // This migration is best-effort: if duplicate names exist in the database it will
      // fail and the version will NOT be recorded, so it retries on next startup.
      // App-level guards in createTenant prevent future duplicates regardless.
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name_unique ON tenants (LOWER(name))')
    },
  },
]

/**
 * Run all pending versioned migrations.
 * Creates schema_migrations tracking table if it doesn't exist.
 * Each migration runs inside its own transaction and is recorded atomically.
 */
async function runMigrations(client) {
  // Create the version-tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Fetch already-applied versions in one query
  const { rows } = await client.query('SELECT version FROM schema_migrations')
  const applied = new Set(rows.map(r => r.version))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue

    log.info(`[postgres] Running migration v${migration.version}: ${migration.description}`)
    try {
      await client.query('BEGIN')
      await migration.run(client)
      await client.query(
        'INSERT INTO schema_migrations (version, description) VALUES ($1, $2)',
        [migration.version, migration.description]
      )
      await client.query('COMMIT')
      log.info(`[postgres] Migration v${migration.version} applied successfully`)
    } catch (err) {
      await client.query('ROLLBACK')
      // Non-fatal: log and continue. Structural migrations (CREATE TABLE IF NOT EXISTS,
      // ALTER … IF NOT EXISTS) are already idempotent, so these errors are typically
      // "column already exists" races on first deployment.
      log.warn(`[postgres] Migration v${migration.version} failed (skipping): ${err.message}`)
    }
  }
}

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
    // Detect passwordless URL → Entra ID token auth (Azure UAMI).
    // URL format: postgresql://<uami-name>@<host>:5432/<db>?sslmode=require
    // pg v8 supports password as an async function — called on each new physical connection.
    let parsed
    try { parsed = new URL(databaseUrl) } catch { parsed = null }
    const isEntraId = parsed && parsed.username && !parsed.password

    if (isEntraId) {
      const clientId = process.env.AZURE_CLIENT_ID
      const credential = new ManagedIdentityCredential({ clientId })
      log.info('[postgres] Using Entra ID token auth (UAMI)')
      pool = new Pool({
        host: parsed.hostname,
        port: parseInt(parsed.port || '5432'),
        user: decodeURIComponent(parsed.username),
        database: parsed.pathname.slice(1),
        password: async () => {
          const token = await credential.getToken(PG_ENTRA_SCOPE)
          return token.token
        },
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      })
    } else {
      pool = new Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        // Render internal Postgres uses self-signed certs — rejectUnauthorized: false
        // is required. MITM risk accepted on Render's trusted internal network.
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      })
    }

    // ---- Schema isolation (DB_SCHEMA env var) ----
    // PR preview services set DB_SCHEMA=pr_{N} so each branch gets its own
    // PostgreSQL schema within the shared database. Production uses 'public'.
    const dbSchema = process.env.DB_SCHEMA || 'public'

    if (dbSchema !== 'public') {
      // Set search_path for every new physical connection in the pool
      pool.on('connect', (pgClient) => {
        pgClient.query(`SET search_path TO "${dbSchema}"`)
      })
    }

    // Verify connection
    const client = await pool.connect()
    try {
      if (dbSchema !== 'public') {
        // Create the schema if it doesn't exist (runs in default search_path)
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${dbSchema}"`)
        // Switch this client to the target schema
        await client.query(`SET search_path TO "${dbSchema}"`)
        log.info(`[postgres] Using schema: ${dbSchema}`)
      }

      await client.query('SELECT 1')
      log.info('[postgres] Connected to PostgreSQL')

      // Run base schema DDL (all CREATE TABLE IF NOT EXISTS — always safe to re-run)
      await client.query(SCHEMA_SQL)
      log.info('[postgres] Schema initialized')

      // ---- Versioned migration system ----
      // Each migration runs exactly once, tracked in schema_migrations.
      // Add new migrations to the end of MIGRATIONS — never edit or remove existing ones.
      await runMigrations(client)
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
