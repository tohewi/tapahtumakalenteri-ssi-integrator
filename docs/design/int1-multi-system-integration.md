# INT-1: Multi-System Integration Architecture

**Date:** 2026-03-14
**Status:** Design Complete
**Author:** Cascade

---

## 1. Problem Statement

Match Manager currently hardcodes two external system integrations:

1. **ShootNScoreIt (SSI)** — event management, scoring, disciplines, squad management
2. **WordPress/Tapahtumakalenteri** — calendar publishing, event listings, attendance stats

Every service, route, and UI component that touches these systems imports SSI or WordPress code directly. A tenant cannot choose a different scoring platform or calendar system. Adding a new integration (e.g., Practiscore, a different CMS) would require changes across 30+ files.

## 2. Current Integration Map

### 2.1 Event Management (SSI)

| Layer | Files | SSI Coupling |
|-------|-------|-------------|
| **SSI Core** | `lib/ssi-core/` (15 files) | GraphQL auth, event CRUD, scoring, participants, management, seed import |
| **Event Builders** | `lib/services/event-builders/` (4 files) | SSI-specific form POST + GraphQL for cup/match/squad creation |
| **Event Services** | `event-creation-service.js`, `event-complete-service.js`, `event-deletion-service.js` | Direct `ssiLogin()`, SSI form manipulation |
| **Staffing** | `routes/platform/staffing.js` | SSI squad sync, participant registration |
| **Routes** | `routes/platform/events.js` | SSI search, SSI import, SSI execute |
| **DB Store** | `platform-store/events.js` | `ssi_event_id`, `ssi_references` columns |
| **Discipline Registry** | `ssi-core/discipline-registry.js` | SSI-specific discipline types and URLs |
| **Stats** | `ssi-core/stats-graphql.js` | SSI GraphQL for participant counts |

### 2.2 Calendar/Scheduling (WordPress)

| Layer | Files | WP Coupling |
|-------|-------|-------------|
| **WP Auth** | `lib/calendar/wp-auth.js` | WordPress login, cookie jar, 2FA form parsing |
| **Gmail OTP** | `lib/calendar/gmail-otp.js` | Gmail IMAP for WordPress 2FA codes |
| **WP Adapter** | `lib/calendar/wp-adapter.js` | WordPress REST + ACF field mapping |
| **Publish Service** | `services/calendar-publish-service.js` | Orchestrates WP auth + OTP + create/publish |
| **Stats Service** | `services/calendar-stats-service.js` | WP ACF field updates |
| **Integrity Service** | `services/calendar-integrity-service.js` | WP post verification |
| **Routes** | `routes/platform/events.js` | Calendar publish, stats update, integrity check |
| **DB** | `tenants.calendar_config` | WordPress-specific fields (wpBaseUrl, wpUsername, etc.) |

### 2.3 Tenant Credential Model (Current)

```
tenants.ssi_credentials   → { email, password, apiKey }          (AES-256-GCM encrypted)
tenants.calendar_config   → { adapter, wpBaseUrl, wpUsername,     (AES-256-GCM encrypted)
                              wpPassword, gmailAddress, ... }
```

The `calendar_config.adapter` field exists but is always `'wordpress'`. SSI credentials have no adapter concept.

## 3. Design Goals

1. **Tenant-level integration selection** — each tenant chooses which systems it uses
2. **System-agnostic business logic** — templates, scheduling, workflows don't know about SSI or WordPress
3. **Adapter pattern** — system-specific code behind common interfaces
4. **Graceful degradation** — missing integrations skip (no calendar → skip publishing)
5. **Incremental migration** — refactor without rewriting; existing SSI/WP code becomes the first adapter implementations
6. **No premature abstraction** — only abstract when a second implementation is needed

## 4. Architecture Design

### 4.1 Integration Categories

Two integration **slots** per tenant:

| Slot | Purpose | Current Implementation | Future Examples |
|------|---------|----------------------|-----------------|
| `eventSystem` | Event management, scoring, disciplines | ShootNScoreIt (SSI) | Practiscore, WinMSS, manual |
| `calendarSystem` | Event publishing, public listings | WordPress/Tapahtumakalenteri | Google Calendar, custom CMS, none |

Each slot is **optional**. A tenant with only `eventSystem` configured can create and manage events but not publish to a calendar. A tenant with neither configured can still use templates and scheduling as a planning tool.

### 4.2 Data Model Changes

#### Tenant Integration Config (replaces separate credential fields)

```sql
-- New column on tenants (M17 migration)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS integrations JSONB DEFAULT '{}';
```

```json
{
  "eventSystem": {
    "type": "ssi",
    "credentials": { "email": "...", "password": "...", "apiKey": "..." }
  },
  "calendarSystem": {
    "type": "wordpress",
    "credentials": {
      "wpBaseUrl": "https://...",
      "wpUsername": "admin",
      "wpPassword": "...",
      "gmailAddress": "...",
      "gmailAppPassword": "...",
      "gmailSenderFilter": "...",
      "gmailSubjectFilter": "..."
    }
  }
}
```

**Migration path:** Keep `ssi_credentials` and `calendar_config` columns during transition. New code reads from `integrations` with fallback to legacy columns. Migration script copies legacy data into new structure.

#### Discipline Binding

Disciplines already have `ssi_create_url` and `ssi_group_id`. These become adapter-specific metadata:

```json
// disciplines.adapter_config (new JSONB column)
{
  "ssi": { "createUrl": "/sra/create-match/", "groupId": "123", "organizerId": "456" }
}
```

This allows a discipline to work with multiple event systems (though in practice, one per tenant).

### 4.3 Adapter Interfaces

#### EventSystemAdapter

```javascript
// lib/integrations/event-system-adapter.js

/**
 * @typedef {Object} EventSystemAdapter
 * @property {function} login - Authenticate with the event system
 * @property {function} createEvent - Create event(s) from template
 * @property {function} deleteEvent - Delete/cancel event in external system
 * @property {function} completeEvent - Mark event as completed
 * @property {function} getEventStats - Fetch participant counts
 * @property {function} searchEvents - Search events for import
 * @property {function} importEventStructure - Import event structure as seed
 * @property {function} syncStaffing - Sync staff signups to external system
 * @property {function} listDisciplineTypes - List available discipline types
 */
```

#### CalendarSystemAdapter

```javascript
// lib/integrations/calendar-system-adapter.js

/**
 * @typedef {Object} CalendarSystemAdapter
 * @property {function} publishEvent - Create/publish calendar entry
 * @property {function} updateEvent - Update existing calendar entry
 * @property {function} deleteEvent - Remove calendar entry
 * @property {function} getEvent - Fetch calendar entry for verification
 * @property {function} updateStats - Update attendance/stats fields
 */
```

### 4.4 Adapter Registry

```javascript
// lib/integrations/registry.js

const EVENT_SYSTEMS = {
  ssi: {
    name: 'ShootNScoreIt',
    createAdapter: (credentials) => new SsiAdapter(credentials),
    credentialFields: ['email', 'password', 'apiKey'],
    requiredFields: ['email', 'password'],
  },
  // Future: practiscore, manual, etc.
}

const CALENDAR_SYSTEMS = {
  wordpress: {
    name: 'WordPress / Tapahtumakalenteri',
    createAdapter: (credentials) => new WpCalendarAdapter(credentials),
    credentialFields: ['wpBaseUrl', 'wpUsername', 'wpPassword', 'gmailAddress', ...],
    requiredFields: ['wpBaseUrl', 'wpUsername', 'wpPassword'],
  },
  none: {
    name: 'No calendar integration',
    createAdapter: () => new NullCalendarAdapter(),
    credentialFields: [],
    requiredFields: [],
  },
  // Future: google_calendar, custom_cms, etc.
}
```

### 4.5 Service Layer Changes

Current services call SSI/WP directly:

```javascript
// BEFORE (current)
import { ssiLogin } from '../ssi-core/client.js'
import { WpCalendarAdapter } from '../calendar/wp-adapter.js'

// Services know exactly which system they're talking to
const session = await ssiLogin(creds.email, creds.password)
const adapter = new WpCalendarAdapter(cookieJar)
```

After refactoring, services receive adapters via dependency injection:

```javascript
// AFTER (proposed)
// Route/orchestrator resolves the adapter from tenant config
const eventAdapter = getEventAdapter(tenant)
const calendarAdapter = getCalendarAdapter(tenant)

// Services work with abstract interfaces
await eventAdapter.createEvent(template, options)
await calendarAdapter.publishEvent(eventData)
```

**Key principle:** Services don't import system-specific modules. The route layer (or a thin orchestrator) resolves adapters and passes them in.

### 4.6 Migration Strategy (Incremental, 4 Phases)

#### Phase 1: Extract SSI Adapter (wrap existing code)
- Create `lib/integrations/ssi-adapter.js` that wraps `ssi-core/` functions into the `EventSystemAdapter` interface
- No behavior change — just a facade
- Services still call SSI directly but adapter exists for new code

#### Phase 2: Extract WP Calendar Adapter (already done!)
- `lib/calendar/wp-adapter.js` already implements most of the `CalendarSystemAdapter` interface
- Wrap it in a registry entry

#### Phase 3: Adapter Resolution
- Add `integrations` JSONB to tenants (M17)
- Create `getEventAdapter(tenant)` and `getCalendarAdapter(tenant)` factory functions
- Migrate event routes to use adapter resolution instead of direct SSI imports
- Fallback: if `integrations` is empty, use legacy `ssi_credentials` / `calendar_config`

#### Phase 4: UI Integration Picker
- Replace SSI credentials tab with generic "Event System" selector (dropdown: SSI, none)
- Replace Calendar tab with generic "Calendar System" selector (dropdown: WordPress, none)
- Credential forms adapt based on selected system type
- Template editor shows system-specific options based on tenant's event system

### 4.7 Null Adapters (Graceful Degradation)

When a tenant has no integration configured for a slot:

```javascript
class NullEventAdapter {
  async createEvent() { throw new AppError('No event system configured', 400) }
  async searchEvents() { return [] }
  async getEventStats() { return null }
  // ... all methods either throw or return empty
}

class NullCalendarAdapter {
  async publishEvent() { /* no-op, log skip */ }
  async updateStats() { /* no-op */ }
  // ... all methods are no-ops
}
```

This means:
- **No event system:** Templates and scheduling work as a planning tool; execution buttons are hidden
- **No calendar:** Events execute in SSI but skip calendar publishing (current behavior when `calendarConfig` is null)

### 4.8 Admin Integration Catalog

The adapter registry (§4.4) is code-level — adding a new adapter requires a deploy. But **which integrations are available to tenants** should be manageable without code changes. This requires a two-layer model:

#### Layer 1: Code (Adapters)
Developers ship adapter modules (e.g., `lib/integrations/adapters/ssi-adapter.js`). Each adapter implements the `EventSystemAdapter` or `CalendarSystemAdapter` interface and is registered in code with a unique key (e.g., `ssi`, `wordpress`, `practiscore`).

#### Layer 2: Admin Catalog (DB + UI)
A super-admin manages which adapters are **enabled** and visible to tenants.

```sql
-- New table: integration_types (M18 migration)
CREATE TABLE IF NOT EXISTS integration_types (
  id          TEXT PRIMARY KEY,           -- e.g., 'ssi', 'wordpress', 'practiscore'
  category    TEXT NOT NULL,              -- 'event_system' or 'calendar_system'
  name        TEXT NOT NULL,              -- Display name: 'ShootNScoreIt'
  description TEXT,                       -- 'Competition management & scoring platform'
  enabled     BOOLEAN DEFAULT TRUE,       -- Admin can disable without removing
  config      JSONB DEFAULT '{}',         -- System-level defaults (e.g., { ssiBaseUrl })
  credential_schema JSONB DEFAULT '[]',   -- Field definitions for tenant credential forms
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### Credential Schema (drives dynamic UI forms)

Each integration type defines its credential fields as a schema:

```json
// integration_types.credential_schema for 'ssi'
[
  { "key": "email", "label": "SSI Email", "labelFi": "SSI-sähköposti", "type": "email", "required": true },
  { "key": "password", "label": "SSI Password", "labelFi": "SSI-salasana", "type": "password", "required": true, "writeOnly": true },
  { "key": "apiKey", "label": "API Key", "labelFi": "API-avain", "type": "password", "required": false, "writeOnly": true, "hint": "Found in SSI under My Account → API Keys" }
]
```

This means the **tenant settings credential form is generated dynamically** from the schema — no frontend code changes needed when a new integration type is added.

#### Admin UI: `#/admin` → Integration Types tab

| Column | Description |
|--------|-------------|
| **Name** | ShootNScoreIt |
| **Category** | Event System |
| **Enabled** | ✅ (toggle) |
| **Tenants using** | 3 |
| **Actions** | Edit, Disable |

Admin can:
- **Enable/disable** integration types (disabled = hidden from tenant selector)
- **Edit** display name, description, system-level config
- **Edit credential schema** (add/remove/reorder fields)
- **View usage** (which tenants use this integration)

Admin **cannot** create new adapter types through the UI — that requires deploying adapter code. But once an adapter is deployed, the admin seeds a catalog entry and enables it.

#### Seeding

On first boot (or migration), the system seeds the catalog with built-in integrations:

```javascript
// Seed default integration types (in M18 migration or init script)
const BUILT_IN = [
  { id: 'ssi', category: 'event_system', name: 'ShootNScoreIt', enabled: true, ... },
  { id: 'wordpress', category: 'calendar_system', name: 'WordPress / Tapahtumakalenteri', enabled: true, ... },
  { id: 'none', category: 'calendar_system', name: 'No calendar', enabled: true, credentialSchema: [] },
  { id: 'none', category: 'event_system', name: 'No event system', enabled: true, credentialSchema: [] },
]
```

#### Tenant Settings Flow (Updated)

1. Tenant admin opens Settings → Event System
2. UI fetches `GET /api/v1/platform/integration-types?category=event_system`
3. Dropdown shows enabled types: "ShootNScoreIt", "No event system"
4. On selection, the credential form renders dynamically from `credential_schema`
5. Tenant saves → credentials stored in `tenants.integrations.eventSystem`

#### Impact on Migration Phases

- **Phase 1–3** (adapter facade + resolution): Can use hardcoded registry initially
- **Phase 4** (UI picker): Migrate to DB-backed catalog — admin UI + dynamic tenant forms
- **Phase 5** (new): Admin catalog management UI in `#/admin`

This means Phase 4 becomes larger but the tenant settings UI becomes fully dynamic — no frontend changes needed per integration type.

## 5. What NOT to Change

1. **SSI scoring proxy routes** (`/api/v1/scoring/*`, `/api/v1/management/*`) — these are the legacy scoring app and use SSI sessions, not tenant integrations. They remain unchanged.
2. **SSI session management** (`lib/session/`, `middleware/auth-v7.js`) — user-level SSI authentication for the scoring app is separate from tenant-level integration credentials.
3. **Database schema for events** — `scheduled_events` already stores `ssi_references` as JSONB, which is system-agnostic in structure.

## 6. Impact Assessment

| Area | Impact | Risk |
|------|--------|------|
| **routes/platform/events.js** | High — direct SSI/WP imports | Medium — large file, many integration touchpoints |
| **lib/services/*.js** | Medium — event/calendar services need adapter injection | Low — already function-based, easy to wrap |
| **lib/ssi-core/** | None — becomes the SSI adapter implementation, code stays | None |
| **lib/calendar/** | None — becomes the WP adapter implementation, code stays | None |
| **UI: tenant settings** | Medium — credential forms generated from catalog schema | Low — dynamic forms reduce per-integration UI work |
| **UI: admin dashboard** | Medium — new Integration Types tab for catalog management | Low — similar pattern to existing admin tables |
| **DB: tenants table** | Low — add `integrations` column, keep legacy columns | Low — additive migration |
| **DB: integration_types** | Low — new catalog table, seeded on first boot | Low — independent table, no FK to existing data |
| **Tests** | Low — adapter pattern enables better mocking | Positive — improves testability |

## 7. Decision Record

| Decision | Rationale |
|----------|-----------|
| **Two slots, not plugin architecture** | Only two integration categories exist. A generic plugin system is over-engineering for the foreseeable future. |
| **Adapter per tenant, not global** | Different tenants may use different systems (e.g., one club uses SSI, another doesn't). |
| **Incremental migration** | Rewriting all services at once is too risky. Wrap existing code first, then migrate callers. |
| **Keep legacy credential columns** | Backward compatibility during migration. Remove only after all code uses `integrations`. |
| **No adapter for scoring proxy** | The legacy scoring/manage/register apps use SSI sessions (user-level auth), not tenant integrations. They're a separate concern. |
| **NullAdapter pattern** | Cleaner than if-checks everywhere. Services call adapter methods unconditionally; null adapters handle the "not configured" case. |
| **DB-backed catalog, not code-only registry** | Admin can enable/disable integrations and edit credential schemas without deploys. Tenant settings UI renders forms dynamically from the catalog. |
| **Credential schema in DB** | Each integration type defines its credential fields (key, label, type, required, writeOnly, hint). This drives the tenant settings form — no frontend code change needed per integration type. |

## 8. Implementation Priority

Phase 1 (SSI adapter facade) and Phase 3 (adapter resolution) are the highest-value work — they establish the pattern without requiring a second system implementation. Phase 4 (UI picker) is optional until a second system is actually needed.

**Recommended order:** Phase 1 → Phase 3 → Phase 2 → Phase 4 → Phase 5

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | SSI adapter facade (wrap existing code) | ~2h |
| 2 | WP calendar adapter (already mostly done) | ~1h |
| 3 | Adapter resolution (`getEventAdapter`/`getCalendarAdapter` + `integrations` column) | ~3h |
| 4 | Dynamic tenant settings UI (reads credential schema from catalog) | ~3h |
| 5 | Admin catalog management UI (`#/admin` Integration Types tab) | ~2h |
| **Total** | | **~11h** |
