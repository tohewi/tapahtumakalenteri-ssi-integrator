# Management Site Database Schema

## Overview

This document describes the database schema for the SSI Tools Management Site, which replaces hardcoded YAML configuration files with a persistent, web-manageable configuration system.

## Requirements

- Store multiple staff management "sites" (e.g., "Temppeli-SRA", "Kupittaa reserviläisammunta")
- Each site has its own configuration: staff emails, event filters, settings
- Support admin user management (built-in root admin + delegated admins)
- Configuration must persist across redeployments
- Support "clean deploy" that resets all settings
- All data in EU (Frankfurt region)

## Database Tables

### 1. `admin_users`

Stores users who have admin access to the management site.

```sql
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  is_root BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),
  last_login_at TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_active ON admin_users(active);
```

**Fields:**
- `id` - Auto-incrementing primary key
- `email` - SSI user email address (must match SSI account)
- `is_root` - True for built-in root admin (from env var)
- `created_at` - When this admin was added
- `created_by` - Email of admin who added this user
- `last_login_at` - Last successful login timestamp
- `active` - Whether this admin account is active

**Notes:**
- Root admin is automatically created on first deploy from `ADMIN_ROOT_EMAIL` env var
- Only root admin can add/remove other admins
- Authentication still uses SSI - this table only controls who can access admin features

### 2. `staff_sites`

Stores staff management site configurations.

```sql
CREATE TABLE staff_sites (
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

CREATE INDEX idx_staff_sites_key ON staff_sites(key);
CREATE INDEX idx_staff_sites_active ON staff_sites(active);
```

**Fields:**
- `id` - Auto-incrementing primary key
- `key` - Unique identifier (e.g., "sra-training", "kupittaa-cup")
- `name` - Display name (e.g., "Temppeli-SRA", "Kupittaa reserviläisammunta")
- `organization_name` - Organization name for this site
- `organization_range` - Shooting range name
- `timezone` - Timezone for event scheduling
- `active` - Whether this site is currently active
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### 3. `staff_site_config`

Stores JSON configuration for each staff site (event discovery, training types, roles, etc.).

```sql
CREATE TABLE staff_site_config (
  site_id INTEGER NOT NULL REFERENCES staff_sites(id) ON DELETE CASCADE,
  config_key VARCHAR(100) NOT NULL,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, config_key)
);

CREATE INDEX idx_staff_site_config_site_id ON staff_site_config(site_id);
```

**Fields:**
- `site_id` - Reference to staff_sites table
- `config_key` - Configuration section key (e.g., "adminAllowlist", "eventDiscovery", "trainingTypes", "roles", "notifications")
- `config_value` - JSON configuration data
- `updated_at` - Last update timestamp

**Config Keys:**
- `adminAllowlist` - Array of email addresses allowed to sign up as staff
- `serviceAccounts` - Array of email addresses that are service accounts (excluded from staffing)
- `eventDiscovery` - Event search configuration (searchStrings, contentTypes, squadName)
- `trainingTypes` - Training type configurations (oldies, newbie, etc.)
- `roles` - Role definitions (staff, leadInstructor, equipmentManager)
- `registration` - Registration settings (closesBeforeEventHours, queueMode, etc.)
- `staffAllocation` - Staff allocation rules
- `finalization` - Finalization settings
- `notifications` - Notification templates

**Example:**
```json
{
  "config_key": "adminAllowlist",
  "config_value": ["turreskuko1@foo.bar", "tohewi@live.com"]
}
```

### 4. `site_event_filters`

Stores event filter rules for each site.

```sql
CREATE TABLE site_event_filters (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES staff_sites(id) ON DELETE CASCADE,
  filter_type VARCHAR(50) NOT NULL, -- 'name_contains', 'cup_id', 'date_range'
  filter_value TEXT NOT NULL,
  future_only BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_site_event_filters_site_id ON site_event_filters(site_id);
```

**Fields:**
- `id` - Auto-incrementing primary key
- `site_id` - Reference to staff_sites table
- `filter_type` - Type of filter (name_contains, cup_id, date_range)
- `filter_value` - Filter value (search string, cup ID, date range JSON)
- `future_only` - Only show future events (exclude history)
- `created_at` - Creation timestamp

**Filter Types:**
- `name_contains` - Match event name containing this string (e.g., "TEST TR-")
- `cup_id` - Match specific cup by ID
- `date_range` - Match events in date range (JSON: {"start": "2025-01-01", "end": "2025-12-31"})

### 5. `schema_version`

Tracks database schema version for migrations.

```sql
CREATE TABLE schema_version (
  version INTEGER NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
  description TEXT
);
```

**Fields:**
- `version` - Schema version number
- `applied_at` - When this version was applied
- `description` - Description of changes in this version

## Migration Strategy

### Initial Migration (v1)

On first deploy with empty database:

1. Create all tables
2. Insert schema_version record (version=1)
3. Create root admin from `ADMIN_ROOT_EMAIL` env var
4. Migrate existing `training-staffing-configuration.yml` to database:
   - Create "sra-training" site
   - Insert configuration from YAML into staff_site_config
   - Create event filters from eventDiscovery.searchStrings

### Clean Deploy

To reset all configuration (environment variable: `CLEAN_DEPLOY=true`):

1. Drop all tables
2. Run initial migration again
3. Recreate root admin
4. Do NOT auto-migrate YAML config (clean slate)

## Database Connection

- **Provider**: PostgreSQL (Render managed)
- **Region**: Frankfurt (EU)
- **Connection**: `DATABASE_URL` environment variable
- **Pool size**: 10 connections
- **SSL**: Required in production

## Backwards Compatibility

The existing `scoring-proxy/lib/staffing/config-loader.js` will be updated to:

1. Check if `DATABASE_URL` is set
2. If yes, load config from database
3. If no, fall back to YAML file (for local development)

This ensures:
- Local development still works without PostgreSQL
- Production uses database
- No breaking changes to existing code

## Access Patterns

### Common Queries

1. **Get site configuration**
   ```sql
   SELECT s.*, c.config_key, c.config_value
   FROM staff_sites s
   LEFT JOIN staff_site_config c ON s.id = c.site_id
   WHERE s.key = $1 AND s.active = true;
   ```

2. **Check admin access**
   ```sql
   SELECT * FROM admin_users
   WHERE email = $1 AND active = true;
   ```

3. **List active sites**
   ```sql
   SELECT * FROM staff_sites
   WHERE active = true
   ORDER BY name;
   ```

4. **Get event filters for site**
   ```sql
   SELECT * FROM site_event_filters
   WHERE site_id = $1
   ORDER BY created_at;
   ```

## Security Considerations

1. **SQL Injection**: All queries use parameterized statements
2. **Access Control**: Only authenticated admins can modify configuration
3. **Audit Trail**: All modifications tracked with timestamps and created_by fields
4. **Data Validation**: Configuration JSON validated against schema before storage
5. **Encryption**: Database connection uses SSL in production

## Future Enhancements

1. **Audit Log**: Track all configuration changes with full history
2. **Versioning**: Store configuration versions for rollback capability
3. **Multi-tenant**: Support multiple organizations with isolated configs
4. **API Keys**: Allow programmatic access to configuration
5. **Webhooks**: Notify external systems of configuration changes
