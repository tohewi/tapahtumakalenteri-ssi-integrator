# Platform Data Model

**Status:** v1.0 — Implemented (Phase 0)  
**Date:** 2026-02-26  
**Relates to:** `match-management-design.md` (domain model section)

---

## 1. Overview

The Match Management Platform stores **only the data it owns**. SSI remains the source of truth for event structure, competitors, and scores. The platform's data model covers identity, tenancy, and the operational configuration needed to drive SSI and calendar integrations.

### What we store vs. what we reference

| Category | Examples | Storage | Reason |
|----------|----------|---------|--------|
| **Identity & tenancy** | Accounts, tenants, subscriptions | PostgreSQL | Permanent, relational, needs backup |
| **Operational config** | Templates, disciplines, instructor roster | PostgreSQL | Permanent, queried frequently |
| **Scheduled work** | Scheduled events, staffing assignments | PostgreSQL | Permanent, status tracking |
| **Sessions & caches** | Login sessions, SSI token cache | Redis | Ephemeral, TTL-based |
| **Deploy-time config** | Cup YAML, staffing YAML | File system | Version-controlled, not user-editable |
| **Event details** | Stages, squads, scores, competitors | SSI (external) | Source of truth — never copied locally |
| **Calendar entries** | Published events | WordPress (external) | Reference IDs stored, content lives there |

---

## 2. Entities

### 2.1 Account

The person who signs up to the platform. Can own one or more tenants.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `acc_` + 16 hex chars |
| `email` | string | Login identity. Unique, case-insensitive. Not necessarily an SSI email |
| `name` | string | Display name |
| `password_hash` | string | bcrypt (12 rounds). Never exposed via API |
| `created_at` | timestamp | Registration time |
| `updated_at` | timestamp | Last profile change |

**Key behaviors:**
- Email is normalized to lowercase on write
- No direct relationship to SSI identity — SSI credentials are per-tenant, not per-account
- An account with zero tenants is valid (all tenants deleted/cancelled)

### 2.2 Tenant

An isolated organization or club. All operational data is scoped to a tenant.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `ten_` + 16 hex chars |
| `account_id` | string | FK → Account. The account that owns this tenant |
| `name` | string | Organization display name (e.g., "TurRes", "RaiResUps") |
| `subscription` | object | Billing state (see §3.1) |
| `ssi_credentials` | object | Encrypted SSI email + password + API key for this org |
| `calendar_config` | object | Calendar backend settings (WordPress URL, auth, taxonomy IDs) |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Key behaviors:**
- Complete isolation: one tenant's data is never visible to another
- SSI credentials are per-tenant — different tenants may use different SSI accounts
- First tenant is created automatically during account sign-up

### 2.3 Discipline (Future — Phase 1)

A type of competition event within a tenant.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `dis_` + 16 hex chars |
| `tenant_id` | string | FK → Tenant |
| `name` | string | Internal name (e.g., "kupittaa_cup") |
| `label_fi` | string | Finnish display name |
| `label_en` | string | English display name |
| `ssi_group_id` | string | SSI group reference |
| `ssi_organizer_id` | string | SSI organizer reference |

### 2.4 Event Template (Future — Phase 1)

A reusable blueprint for creating events. Imported from an SSI "seed" event.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `tpl_` + 16 hex chars |
| `tenant_id` | string | FK → Tenant |
| `discipline_id` | string | FK → Discipline |
| `name` | string | Template name |
| `ssi_seed_event_id` | string | SSI event used as the structural source |
| `ssi_seed_snapshot` | object | Cached SSI structure at import time |
| `overrides` | object | Name templates, timing, squad definitions, registration rules |
| `calendar_template` | object | Title template, content HTML, location, taxonomy IDs |
| `staffing_rules` | object | Min/max instructors, required roles |

### 2.5 Scheduled Event (Future — Phase 1)

An instance of a template for a specific date. Created by the scheduling workflow.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `evt_` + 16 hex chars |
| `tenant_id` | string | FK → Tenant |
| `template_id` | string | FK → Event Template |
| `date` | date | Event date |
| `status` | string | Lifecycle state (see §3.2) |
| `ssi_references` | object | Cup ID, match IDs, URLs created in SSI |
| `calendar_reference` | object | Calendar event ID and URL |
| `assigned_instructors` | array | `[{ instructor_id, role }]` |
| `created_by` | string | Account ID of who scheduled it |
| `created_at` | timestamp | |

### 2.6 Tenant Member (RBAC)

Links an account to a tenant with one or more roles. Created automatically when a tenant is created (owner role) or via invitation by an admin.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `mbr_` + 16 hex chars |
| `tenant_id` | string | FK → Tenant |
| `account_id` | string | FK → Account |
| `roles` | string[] | One or more of: `owner`, `tenant_admin`, `discipline_admin`, `instructor_admin`, `match_admin`, `instructor` |
| `invited_by` | string | FK → Account (null for auto-created owner) |
| `status` | string | `active`, `invited`, `suspended` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Key behaviors:**
- UNIQUE(tenant_id, account_id) — one membership per account per tenant
- When a tenant is created, the creating account automatically gets `{owner}` membership (in same transaction)
- Owner role is protected: cannot remove the last owner from a tenant
- `tenant_admin` can assign/revoke all roles except `owner`
- `owner` can assign any role including `owner` (ownership transfer)
- A member can hold multiple roles simultaneously (e.g., `match_admin` + `instructor_admin`)

#### Role Definitions

| Role | Description | Permissions |
|------|-------------|-------------|
| `owner` | Tenant creator/billing contact | All permissions. Billing, SSI credentials, delete tenant. Implicit access to everything below |
| `tenant_admin` | Organization administrator | Manage members & roles (except owner), tenant name, all operational permissions below. NOT billing or SSI credentials |
| `discipline_admin` | Discipline manager | CRUD disciplines |
| `instructor_admin` | Instructor manager | Manage & approve instructors, view instructor roster |
| `match_admin` | Match operations | CRUD templates, schedule matches, view disciplines (read-only) |
| `instructor` | Staff member | Read-only tenant info, self-register as match staff (director, quartermaster, instructor) |

#### Permission Matrix

| Action | owner | tenant_admin | discipline_admin | instructor_admin | match_admin | instructor |
|--------|:-----:|:------------:|:----------------:|:----------------:|:-----------:|:----------:|
| Billing & subscription | ✅ | | | | | |
| SSI credentials | ✅ | | | | | |
| Tenant name & settings | ✅ | ✅ | | | | |
| Manage members & roles | ✅ | ✅ | | | | |
| CRUD disciplines | ✅ | ✅ | ✅ | | | |
| Manage instructors | ✅ | ✅ | | ✅ | | |
| CRUD templates | ✅ | ✅ | | | ✅ | |
| Schedule matches | ✅ | ✅ | | | ✅ | |
| View disciplines (read) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View tenant info (read) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Self-register as staff | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

#### Implications for Existing and Future Features

- **All tenant-scoped routes** must check membership roles instead of `account_id` ownership
- **Discipline routes**: require `owner`, `tenant_admin`, or `discipline_admin`
- **Template routes**: require `owner`, `tenant_admin`, or `match_admin`
- **Tenant detail/settings read**: any member role
- **Tenant settings write (name)**: `owner` or `tenant_admin`
- **SSI credentials write**: `owner` only
- **Future instructor routes**: `owner`, `tenant_admin`, or `instructor_admin`
- **Future scheduling routes**: `owner`, `tenant_admin`, or `match_admin`
- **Dashboard tenant list**: must query `tenant_members` instead of `tenants.account_id`

### 2.7 Instructor (Future — Phase 2)

A person available for event staffing. Self-registers via the platform.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `ins_` + 16 hex chars |
| `tenant_id` | string | FK → Tenant |
| `name` | string | Display name |
| `email` | string | SSI identity (used for SSI event registration) |
| `status` | string | Lifecycle state (see §3.3) |
| `qualified_disciplines` | array | Discipline IDs this instructor can staff |
| `roles` | array | e.g., `["lead", "equipment", "staff"]` |
| `approved_by` | string | Account ID who approved |
| `registered_at` | timestamp | |

---

## 3. Lifecycles

### 3.1 Subscription Lifecycle

Every tenant has a subscription. The system enforces access based on subscription status.

```
                    ┌──────────┐
  sign-up ─────────►│  trial   │
                    └────┬─────┘
                         │ payment added
                         ▼
                    ┌──────────┐
                    │  active  │◄─── payment succeeds
                    └────┬─────┘
                         │ payment fails
                         ▼
                    ┌──────────┐
                    │ past_due │─── retry window (14 days)
                    └────┬─────┘
                         │ retry fails / manual cancel
                         ▼
                    ┌───────────┐
                    │ cancelled │  (data retained 90 days, then purged)
                    └───────────┘

  Note: trial → cancelled is also valid (trial expires without payment)
```

| Status | Access | Duration |
|--------|--------|----------|
| `trial` | Full functionality | 30 days from tenant creation |
| `active` | Full functionality | Until subscription ends |
| `past_due` | Read-only (no new events) | 14-day grace period |
| `cancelled` | No access (data retained) | 90-day retention, then purge |

### 3.2 Scheduled Event Lifecycle (Future — Phase 1)

```
  ┌─────────┐     ┌──────────────┐     ┌─────────────────────┐
  │ planned │────►│ ssi_created  │────►│ calendar_published  │
  └─────────┘     └──────────────┘     └──────────┬──────────┘
                                                   │
                                        ┌──────────▼──────────┐
                                        │      staffed        │
                                        └──────────┬──────────┘
                                                   │
                                        ┌──────────▼──────────┐
                                        │      ready          │
                                        └──────────┬──────────┘
                                                   │
                                        ┌──────────▼──────────┐
                                        │    completed        │
                                        └─────────────────────┘

  Any state can transition to → failed (with error details)
```

| Status | Meaning |
|--------|---------|
| `planned` | Date selected, not yet created in SSI |
| `ssi_created` | SSI cup + matches created successfully |
| `calendar_published` | Calendar event published |
| `staffed` | Required instructors assigned |
| `ready` | All prerequisites met |
| `completed` | Event has occurred, scores finalized in SSI |
| `failed` | Creation or publishing failed (retryable) |

### 3.3 Instructor Lifecycle (Future — Phase 2)

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ pending  │────►│ approved │────►│ inactive │
  └──────────┘     └──────────┘     └──────────┘
                        │                 │
                        └─────────────────┘
                          (can reactivate)
```

---

## 4. Relationships

```
Account 1 ──────* Tenant          (via tenant_members)
Account 1 ──────* Tenant Member
Tenant  1 ──────* Tenant Member
Tenant  1 ──────* Discipline
Tenant  1 ──────* Instructor
Discipline 1 ──* Event Template
Event Template 1 ──* Scheduled Event
Scheduled Event *──* Instructor  (via assigned_instructors)
```

**Access rules:**
- An account can only see/modify tenants where it has a membership in `tenant_members`
- The membership's `roles` array determines what actions are allowed (see §2.6 Permission Matrix)
- The `owner` role has implicit access to all permissions — no need to check specific roles
- The `tenant_admin` role has implicit access to all operational permissions (not billing/SSI)
- All operational data (disciplines, templates, events, instructors) is scoped to a tenant
- Cross-tenant access is never allowed

---

## 5. Storage Strategy

### PostgreSQL (persistent data)

All entities in §2 are stored in PostgreSQL. Reasons:
- ACID transactions (e.g., creating an account + first tenant atomically)
- Automatic backups on Render (daily on paid plans)
- SQL queries for filtering/reporting (e.g., "all events next month")
- Schema migrations for evolving the model
- JSONB columns for flexible nested data (subscription, SSI credentials, overrides)

### Redis (ephemeral data)

| Key pattern | Data | TTL |
|-------------|------|-----|
| `ssi_sessions:{id}` | SSI scoring/manage sessions | 8h (scope-dependent) |
| `platform:session:{id}` | Platform login sessions | 24h |

Redis is **not** used for any permanent data. If Redis is flushed, the only impact is that active sessions are invalidated (users must re-login).

### File system (deploy-time config)

| File | Purpose |
|------|---------|
| `config/kupittaa-cup-config.yml` | Legacy cup config (migrates to templates in Phase 1) |
| `config/sra-training-config.yml` | Legacy staffing config (migrates to templates in Phase 1) |

These files will eventually be superseded by database-stored templates but remain functional during the migration period.

---

## 6. ID Format Convention

All entity IDs use a type prefix + 16 random hex characters:

| Entity | Prefix | Example |
|--------|--------|---------|
| Account | `acc_` | `acc_a1b2c3d4e5f67890` |
| Tenant | `ten_` | `ten_f0e1d2c3b4a59876` |
| Discipline | `dis_` | `dis_1234567890abcdef` |
| Template | `tpl_` | `tpl_abcdef1234567890` |
| Event | `evt_` | `evt_fedcba0987654321` |
| Member | `mbr_` | `mbr_9876543210fedcba` |
| Instructor | `ins_` | `ins_0123456789abcdef` |

Prefixed IDs make debugging easier (you can tell what kind of entity an ID refers to in logs, URLs, and database queries).

---

## 7. Security Considerations

- **Passwords**: bcrypt with 12 rounds. Never stored in plaintext, never returned via API
- **SSI credentials**: Encrypted with AES-256-GCM before storage. Each write uses a fresh random IV (96-bit). Decrypted transparently on read. Encryption key set via `PLATFORM_CREDENTIALS_KEY` env var (64 hex chars = 32 bytes)
- **Tenant isolation**: Every query includes `tenant_id` in its WHERE clause. No shared tables without tenant scoping
- **Session cookies**: HttpOnly, SameSite=Lax, Secure in production. Separate cookies for platform auth (`platform_sid`) and SSI auth (`ssi_session`)
- **Data retention**: Cancelled tenant data retained 90 days for recovery, then permanently purged

---

## 8. Migration Path

| Phase | Entities added | Storage |
|-------|---------------|---------|
| **Phase 0** (current) | Account, Tenant, Subscription | PostgreSQL |
| **Phase 1** | Discipline, Event Template, Scheduled Event | PostgreSQL |
| **Phase 2** | Instructor | PostgreSQL |
| **Phase 2.5** | Tenant Members (RBAC) — roles, permissions, membership | PostgreSQL |
| **Phase 3** | Full multi-tenancy (invitation flow, role management UI) | PostgreSQL |
| **Phase 4** | Notification preferences, audit log | PostgreSQL |

The database schema grows incrementally. Each phase adds tables via migration scripts. No existing tables are altered destructively.
