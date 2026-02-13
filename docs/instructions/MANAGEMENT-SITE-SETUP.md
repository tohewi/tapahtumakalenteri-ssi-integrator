# Management Site Setup Guide

This document explains how to set up and use the SSI Tools Management Site for managing configuration without code redeployment.

## Overview

The Management Site allows authorized administrators to:
- Create and manage multiple staff management "sites" (e.g., "Temppeli-SRA", "Kupittaa")
- Configure staff allowlists, event filters, and settings per site
- Add/remove admin users
- View and edit all configuration through a web interface

Configuration is stored in PostgreSQL and persists across redeployments.

## Prerequisites

- Render account with PostgreSQL addon
- SSI administrator account
- Email address for root admin

## Initial Setup

### 1. Environment Variables

Add these environment variables to your Render service:

```bash
# Required: PostgreSQL connection string (auto-set by Render)
DATABASE_URL=postgres://user:pass@host:5432/dbname

# Required: Root admin email (must be SSI user)
ADMIN_ROOT_EMAIL=your-admin@example.com

# Optional: Clean deploy (drops all tables and recreates)
CLEAN_DEPLOY=false
```

### 2. PostgreSQL Database

The `render.yaml` includes a PostgreSQL service:

```yaml
- type: postgres
  name: turres-ssi-tools-db
  region: frankfurt
  plan: starter
  databaseName: ssitools
  databaseUser: ssitools
  ipAllowList: []  # internal access only
```

The web service automatically links to it via `DATABASE_URL`.

### 3. First Deployment

On first deploy with `DATABASE_URL` set:

1. Server creates all database tables (schema v1)
2. Creates root admin user from `ADMIN_ROOT_EMAIL`
3. Migrates existing `config/sra-training-config.yml` to database
4. Creates "sra-training" site with all config sections

**Migration only happens once** — on subsequent deploys, existing data is preserved.

### 4. Access Admin Interface

1. Navigate to `https://your-app.onrender.com`
2. Login with SSI credentials (email must match `ADMIN_ROOT_EMAIL`)
3. Click "Järjestelmän hallinta" (System Administration)
4. You should see the admin interface

If you get "Admin access denied":
- Verify `ADMIN_ROOT_EMAIL` matches your SSI login email
- Check server logs for migration errors
- Ensure `DATABASE_URL` is set correctly

## Admin Interface Usage

### Managing Sites

**List Sites:**
- Admin page shows all configured sites
- Each site has: name, key, organization info, created date

**Create Site:**
1. Click "+ Create New Site"
2. Enter:
   - Key: unique identifier (lowercase, alphanumeric, hyphens)
   - Name: display name (e.g., "Kupittaa Cup")
   - Organization name: organization running this site
   - Organization range: shooting range (optional)
   - Timezone: event timezone (default: Europe/Helsinki)
3. Save

**Edit Site:**
- Click "Edit" on a site
- Modify configuration sections:
  - Admin allowlist (staff member emails)
  - Event discovery (search patterns, content types)
  - Training types (oldies, newbie, etc.)
  - Roles (staff, leadInstructor, etc.)
  - Notifications (email templates)
- Save changes

**Delete Site:**
- Click "Delete" on a site
- Confirm deletion
- Site is soft-deleted (marked inactive)

### Managing Admin Users

**List Admins:**
- Admin page shows all authorized users
- Root admin has "ROOT" badge (cannot be removed)

**Add Admin:**
1. Click "+ Add Admin User"
2. Enter SSI email address
3. User can now access admin interface

**Remove Admin:**
- Click "Remove" on admin user
- Only root admin can add/remove admins
- Cannot remove root admin

### Managing Event Filters

Each site can have multiple event filters to discover events:

**Filter Types:**
- `name_contains`: Match event name (e.g., "TEST TR-")
- `cup_id`: Match specific cup by ID
- `date_range`: Match events in date range

**Add Filter:**
1. Navigate to site detail page
2. Click "+ Add Filter"
3. Select filter type
4. Enter filter value
5. Toggle "Future only" (hide historical events)
6. Save

**Remove Filter:**
- Click "Delete" on filter

## Configuration Structure

### Database Tables

**admin_users:**
- Stores authorized admin users
- Root admin created from env var
- Tracks last login

**staff_sites:**
- Stores site metadata (name, key, org info)
- One site per organization/configuration

**staff_site_config:**
- Stores JSON configuration per site
- Keys: adminAllowlist, eventDiscovery, trainingTypes, roles, etc.
- Flexible schema for future additions

**site_event_filters:**
- Stores event discovery filters per site
- Supports multiple filter types
- Future-only flag to hide history

**schema_version:**
- Tracks database schema version
- Used for migrations

### Configuration Sections

Each site stores these configuration sections:

1. **adminAllowlist** - Array of email addresses allowed to sign up as staff
2. **serviceAccounts** - Array of service accounts (excluded from staffing)
3. **eventDiscovery** - Event search configuration:
   - searchStrings: patterns to match event names
   - matchContentType: SSI content type for matches (22 = IPSC/SRA)
   - cupContentType: SSI content type for cups (136 = Nordic Serie)
   - staffSquadName: name of staff squad (e.g., "Squad 5")
4. **trainingTypes** - Training type configurations (oldies, newbie, etc.)
5. **roles** - Role definitions (staff, leadInstructor, equipmentManager)
6. **registration** - Registration settings
7. **staffAllocation** - Staff allocation rules
8. **finalization** - Finalization settings
9. **notifications** - Email notification templates

## API Endpoints

All admin endpoints require authentication with 'admin' scope.

### Admin Users

```bash
GET    /api/admin/users              # List all admins
POST   /api/admin/users              # Add admin (root only)
DELETE /api/admin/users/:email       # Remove admin (root only)
```

### Sites

```bash
GET    /api/admin/sites              # List all sites
GET    /api/admin/sites/:key         # Get site with config
POST   /api/admin/sites              # Create new site
PUT    /api/admin/sites/:key         # Update site
DELETE /api/admin/sites/:key         # Delete site (soft)
```

### Event Filters

```bash
GET    /api/admin/sites/:key/filters # List filters for site
POST   /api/admin/sites/:key/filters # Add filter
DELETE /api/admin/filters/:id        # Remove filter
```

## Local Development

### Without Database

If `DATABASE_URL` is not set:
- Configuration loads from YAML files
- Admin features are disabled
- Falls back to file-based config

This allows local development without PostgreSQL.

### With Database

For local testing with database:

1. Install PostgreSQL locally
2. Create database: `createdb ssitools`
3. Set environment variable:
   ```bash
   export DATABASE_URL=postgres://localhost/ssitools
   export ADMIN_ROOT_EMAIL=your-email@example.com
   ```
4. Start server: `cd scoring-proxy && node server.js`
5. Database schema is created automatically
6. Navigate to `http://localhost:3001/#/admin`

## Clean Deploy

To reset all configuration (warning: deletes all data):

1. Set environment variable: `CLEAN_DEPLOY=true`
2. Deploy or restart service
3. All tables are dropped and recreated
4. Root admin is recreated
5. No YAML migration occurs (clean slate)
6. Remove `CLEAN_DEPLOY` env var after deploy

Use this for:
- Testing migrations
- Resetting to factory defaults
- Recovering from schema errors

## Troubleshooting

### Admin Access Denied

**Symptom:** "Admin access denied. You are not authorized."

**Solutions:**
1. Check `ADMIN_ROOT_EMAIL` matches your SSI login email
2. Verify migration completed (check server logs)
3. Check admin_users table:
   ```sql
   SELECT * FROM admin_users WHERE email = 'your-email@example.com';
   ```
4. If not found, re-run migration or add manually:
   ```sql
   INSERT INTO admin_users (email, is_root, created_by)
   VALUES ('your-email@example.com', true, 'system');
   ```

### Configuration Not Loading

**Symptom:** Staff management uses old YAML config

**Solutions:**
1. Check `DATABASE_URL` is set
2. Check server logs for database connection errors
3. Verify site exists in database:
   ```sql
   SELECT * FROM staff_sites WHERE key = 'sra-training';
   ```
4. Check config-loader.js logs for source (database vs YAML)

### Migration Failed

**Symptom:** Server fails to start, migration error in logs

**Solutions:**
1. Check DATABASE_URL format: `postgres://user:pass@host:5432/dbname`
2. Verify database is accessible (not behind firewall)
3. Check PostgreSQL logs for connection issues
4. Try clean deploy: set `CLEAN_DEPLOY=true`

### Lost Root Admin

**Symptom:** No admin users, cannot access admin interface

**Solutions:**
1. Check `ADMIN_ROOT_EMAIL` env var is set
2. Set `CLEAN_DEPLOY=true` to recreate root admin
3. Or manually insert:
   ```sql
   INSERT INTO admin_users (email, is_root, created_by)
   VALUES ('your-email@example.com', true, 'system');
   ```

## Security Considerations

1. **Database Access:** PostgreSQL is internal-only (no public access)
2. **Admin Authentication:** Checked against admin_users table
3. **SSI Authentication:** All users must authenticate via SSI
4. **Root Admin:** Only root admin can add/remove other admins
5. **Audit Trail:** All modifications tracked with timestamps
6. **Environment Variables:** Keep `ADMIN_ROOT_EMAIL` secret

## Backup and Recovery

### Manual Backup

```bash
# Backup entire database
pg_dump DATABASE_URL > backup.sql

# Backup specific tables
pg_dump -t admin_users -t staff_sites -t staff_site_config DATABASE_URL > config-backup.sql

# Restore
psql DATABASE_URL < backup.sql
```

### Automatic Backup

Render PostgreSQL includes automatic backups:
- Daily backups on Starter plan
- Point-in-time recovery on Pro plan
- Backups retained for 7 days

### Export to YAML

To export configuration back to YAML:

```bash
# Query site config
psql DATABASE_URL -c "
SELECT config_value
FROM staff_site_config
WHERE site_id = (SELECT id FROM staff_sites WHERE key = 'sra-training')
" > config.json

# Convert JSON to YAML manually or with tool
```

## Future Enhancements

Planned features:

1. **Site Detail Pages:** Full config editing for each site
2. **Audit Log:** Track all configuration changes
3. **Version History:** Rollback to previous configurations
4. **Bulk Import/Export:** Import/export configurations as JSON/YAML
5. **API Keys:** Programmatic access to configuration
6. **Webhooks:** Notify external systems of changes
7. **Multi-Organization:** Support multiple organizations
8. **User Permissions:** Fine-grained permission system

## Support

For issues or questions:
- Check server logs for errors
- Review this documentation
- Check GitHub issues
- Contact repository maintainer
