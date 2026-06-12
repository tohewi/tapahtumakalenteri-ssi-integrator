# R8.1 PostgreSQL Schema Draft

Status: **Draft** — design phase (MP1)
Related: `r81-roles-permissions.md`, `r81-vision-wireframes.md`

---

## 1. Context

PostgreSQL is the platform data store (decision 2026-06-10, see
`r81-roles-permissions.md` §6). This is a **greenfield** schema — the repo
currently has no SQL, migrations, or DB libraries. Existing persistence:

| Store | Holds | Future |
|-------|-------|--------|
| Redis | Sessions (V7 dual-session) | Stays — sessions/caching |
| YAML config (`config/*.yml`) | Staffing roles, allowlists, templates | Migrates to Postgres (deployment-level settings stay in YAML/env) |
| SSI (external) | Cups, matches, squads, scores, competitors | Stays — event activity backend |
| Frontend localStorage | Scoring drafts, nav state | Stays |

**Design rule:** Postgres holds *platform-owned* data (tenants, identities,
roles, registrations, templates). SSI remains the source of truth for event
execution (squad composition, scores). Platform tables reference SSI entities
by external ID — never duplicate SSI's authoritative data.

## 2. Conventions

- Primary keys: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- All platform tables carry `tenant_id` (multi-tenancy boundary), except
  `tenants` itself and cross-tenant tables (`identities`, `platform_admins`)
- Timestamps: `created_at` / `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Soft references to SSI via `ssi_*` columns (TEXT, SSI's IDs)
- Naming: `snake_case`, plural table names

## 3. Schema

### 3.1 Tenants

```sql
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,          -- e.g. 'turres', used in URLs
  name        TEXT NOT NULL,                 -- display name
  status      TEXT NOT NULL DEFAULT 'active' -- active | suspended | pending
              CHECK (status IN ('active', 'suspended', 'pending')),
  settings    JSONB NOT NULL DEFAULT '{}',   -- tenant-level config (timezone, locale, range info)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`status = 'pending'` supports the tenant registration flow (self-service
signup awaiting platform-admin approval).

### 3.2 Identities (cross-tenant)

Own identities, email as identifier (`r81-roles-permissions.md` §2.2.1).
A person is one identity across tenants.

```sql
CREATE TABLE identities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       CITEXT NOT NULL UNIQUE,        -- requires CREATE EXTENSION citext
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT,                          -- optional
  ssi_email   CITEXT,                        -- linked SSI account (NULL = no SSI link)
  ssi_user_id TEXT,                          -- SSI user reference, if known
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'disabled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_identities_ssi_email ON identities (ssi_email)
  WHERE ssi_email IS NOT NULL;
```

`ssi_email IS NOT NULL` ⇔ "ssiLinked" — determines whether the shooter is
scored in SSI.

### 3.3 Roles

Two tables: cross-tenant platform admins, and tenant-scoped role grants.

```sql
-- Cross-tenant superusers (the only cross-tenant role)
CREATE TABLE platform_admins (
  identity_id UUID PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES identities(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant-scoped role grants (replaces YAML allowlists; UI-managed)
CREATE TABLE tenant_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  role        TEXT NOT NULL
              CHECK (role IN ('event-manager', 'staff')),
  granted_by  UUID REFERENCES identities(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identity_id, role)
);

CREATE INDEX idx_tenant_roles_lookup ON tenant_roles (tenant_id, identity_id);
```

Role resolution at login (per tenant): `platform_admins` → `tenant_roles`
(`event-manager`, then `staff`) → default `shooter`. `scorer` comes from
device tokens, not identity.

Service-account exclusion (today's `serviceAccounts` YAML list) becomes a
tenant setting (`tenants.settings.serviceAccounts`) since it filters SSI sync
rather than granting permissions.

### 3.4 Magic link tokens

```sql
CREATE TABLE magic_link_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id  UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,         -- store SHA-256 hash, never raw token
  purpose      TEXT NOT NULL DEFAULT 'login'
               CHECK (purpose IN ('login', 'registration-confirm')),
  expires_at   TIMESTAMPTZ NOT NULL,         -- e.g. now() + interval '15 minutes'
  consumed_at  TIMESTAMPTZ,                  -- NULL = unused; single-use enforcement
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_link_tokens_identity ON magic_link_tokens (identity_id);
```

Flow: generate random token → email via Resend → store hash → on click,
validate hash + `expires_at` + `consumed_at IS NULL` → mark consumed → create
`shooter` session (Redis, with `identityId` + `tenantId` + `role`).

### 3.5 Training types (MP2)

Templates that define event structure. Replaces template parts of
`config/sra-training-config.yml` and the event-builder template registry.

```sql
CREATE TABLE training_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,                -- e.g. 'kupittaa-cup', 'sra-training'
  name         TEXT NOT NULL,
  description  TEXT,
  definition   JSONB NOT NULL DEFAULT '{}',  -- matches, squads, personnel roles, form fields
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
```

`definition` JSONB (validated in app layer) carries what today lives in YAML +
builder code: match list (name/discipline/shots/format), squad config
(count/max), personnel role definitions (label fi/en, ssiRole mapping,
required, maxPerEvent), SSI form field overrides.

### 3.6 Events (MP4)

Platform metadata for an event; SSI holds the actual cup/matches/squads.

```sql
CREATE TABLE events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  training_type_id UUID REFERENCES training_types(id),
  name             TEXT NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ,
  location         TEXT,
  location_detail  TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'published', 'registration-open',
                                     'live', 'closed', 'archived')),
  ssi_cup_id       TEXT,                     -- SSI cup reference (NULL for draft)
  calendar_ref     TEXT,                     -- Tapahtumakalenteri reference
  max_shooters     INTEGER,
  created_by       UUID REFERENCES identities(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_tenant_date ON events (tenant_id, starts_at);

-- SSI match references within an event
CREATE TABLE event_matches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  discipline   TEXT,
  ssi_match_id TEXT,                         -- SSI match reference
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.7 Registrations (MP5)

```sql
CREATE TABLE registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  identity_id   UUID NOT NULL REFERENCES identities(id),
  status        TEXT NOT NULL DEFAULT 'registered'
                CHECK (status IN ('registered', 'waitlisted', 'withdrawn')),
  ssi_synced    BOOLEAN NOT NULL DEFAULT false,  -- pushed to SSI? (requires ssi link)
  ssi_squad_ref TEXT,                            -- SSI squad reference if squadded
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, identity_id)
);

CREATE INDEX idx_registrations_event ON registrations (event_id, status);
```

Non-SSI shooters: `identity.ssi_email IS NULL` → `ssi_synced` stays false;
they appear in platform squad views and headcounts but not in SSI scoring.

### 3.8 Personnel assignments (MP3)

Generalizes the staffing engine's per-event signups beyond SRA training.

```sql
CREATE TABLE personnel_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  identity_id  UUID NOT NULL REFERENCES identities(id),
  role_key     TEXT NOT NULL,                -- references training_type definition roles,
                                             -- e.g. 'leadInstructor' (Match Director), 'staff'
  status       TEXT NOT NULL DEFAULT 'signed-up'
               CHECK (status IN ('signed-up', 'confirmed', 'declined', 'resigned')),
  ssi_synced   BOOLEAN NOT NULL DEFAULT false,  -- role pushed to SSI (e.g. Match director)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, identity_id, role_key)
);
```

Match Director permissions are enforced by SSI, not the platform — this table
only records the assignment and sync state (`r81-roles-permissions.md` §2.3).

### 3.9 Device tokens

Today device tokens live outside Postgres; migrating them here makes them
tenant-scoped and UI-manageable.

```sql
CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,                 -- e.g. 'Range tablet 1'
  event_id    UUID REFERENCES events(id),    -- optional: bind token to one event
  revoked_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by  UUID REFERENCES identities(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.10 Audit log

Role grants, allowlist edits, and tenant changes need an audit trail
(replaces today's `auditLogin` console logging for security-relevant actions).

```sql
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   UUID REFERENCES tenants(id),   -- NULL for platform-level actions
  actor_id    UUID REFERENCES identities(id),
  action      TEXT NOT NULL,                 -- e.g. 'role.grant', 'tenant.suspend'
  subject     JSONB NOT NULL DEFAULT '{}',   -- what was affected
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_tenant_time ON audit_log (tenant_id, created_at DESC);
```

## 4. Entity Relationships

```
tenants ─┬─< tenant_roles >── identities ──< platform_admins
         ├─< training_types ──< events ─┬─< event_matches
         ├─< device_tokens              ├─< registrations >── identities
         └─< audit_log                  └─< personnel_assignments >── identities
                       magic_link_tokens >── identities

  SSI references (TEXT, not FKs):
    events.ssi_cup_id, event_matches.ssi_match_id,
    registrations.ssi_squad_ref, identities.ssi_user_id
```

## 5. What Stays Out of Postgres

| Data | Stays in | Why |
|------|----------|-----|
| Sessions | Redis | Volatile, TTL-driven; existing V7 store works |
| Scores, squad composition | SSI | SSI is the scoring backend |
| Scoring drafts | localStorage | Offline-first scoring requirement |
| Deployment config (ports, API keys) | env vars | 12-factor |
| Cron/finalization schedules | render.yaml | Infrastructure |

## 6. Migration Path from YAML

| YAML (sra-training-config.yml) | Postgres target |
|---|---|
| `adminAllowlist` | `tenant_roles` (role = 'staff') |
| `roles:` definitions | `training_types.definition.personnelRoles` |
| `serviceAccounts` | `tenants.settings.serviceAccounts` |
| `event:`/squad defaults | `training_types.definition` |
| email templates | `tenants.settings.emailTemplates` (or stay in config initially) |

Migration is **incremental**: config-loader gets a Postgres-backed
implementation behind the same interface; YAML remains the fallback until
each consumer is migrated.

## 7. Implementation Notes

- **Driver:** `pg` (node-postgres) — plain SQL, no ORM, matching the
  codebase's no-TypeScript/minimal-dependency style. Migrations via
  `node-pg-migrate` or plain numbered SQL files executed at startup.
- **Extensions:** `citext` (case-insensitive emails), `pgcrypto` if
  `gen_random_uuid()` is unavailable (built-in from PG13+).
- **Render:** add a Postgres instance to `render.yaml` (R8.1 infra task);
  connection via `DATABASE_URL` env var.
- **Tenant scoping:** enforce in a query helper (e.g. all repository
  functions take `tenantId` as first arg) — application-level isolation;
  RLS (row-level security) is a possible hardening step later.

## 8. Open Questions

1. **Availability calendar (MP3):** staff availability ("mark available for
   date") may need an `availability` table — defer until MP3 design.
2. **Event snapshots/reports (MP7):** store generated report snapshots in
   Postgres (JSONB) or generate on demand from SSI? Defer to MP7 design.
3. **Identity merge:** what happens when an email-only shooter later links an
   SSI account that another identity already references? Needs a merge rule.
