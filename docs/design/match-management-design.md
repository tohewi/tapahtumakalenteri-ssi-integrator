# Match Management System — Design Draft

**Status:** Draft v0.3 — Envisioning  
**Date:** 2026-02-25  
**Authors:** Design session (user + Cascade)

---

## 1. Vision

Replace the PowerShell-based event creation scripts (`New-KupittaaCup.ps1`, batch scripts) with a **web-based match management system** that:

- Uses **SSI as the template editor** — no duplication of SSI's event creation UI
- Creates events across **multiple disciplines** (Kupittaa Cup, SRA, RA, PRS, extensible)
- Publishes to **external calendars** (Tapahtumakalenteri / WordPress, pluggable)
- Manages **instructor rosters** and event staffing
- Supports **multi-tenancy** (TurRes, RaiResUps, others — complete isolation)
- Stores **minimal data** — SSI is the source of truth for event structure
- Offers **self-service onboarding** — clubs sign up, configure, and manage their own tenant (free trial → paid)

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USERS (Browser)                         │
│   Platform Owner · Tenant Admin · Match Director · Instructor  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│                    MATCH MANAGEMENT UI                          │
│  React (Vite + TailwindCSS) — same stack as scoring-ui         │
│                                                                 │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────┐│
│  │  Template    │ │  Schedule    │ │ Instructor │ │  Tenant   ││
│  │  Browser    │ │  & Create    │ │  Roster    │ │  Admin    ││
│  └─────────────┘ └──────────────┘ └────────────┘ └───────────┘│
└──────────────────────────┬──────────────────────────────────────┘
                           │ /api/v1/manage/
┌──────────────────────────▼──────────────────────────────────────┐
│                   MATCH MANAGEMENT API                          │
│  Express.js routes (same proxy server)                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Service Layer                           │  │
│  │  template-service  ·  scheduling-service                  │  │
│  │  instructor-service  ·  tenant-service                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Integration Adapters                         │  │
│  │  ┌────────────┐  ┌─────────────────┐  ┌──────────────┐  │  │
│  │  │  SSI       │  │  Calendar       │  │  Notification│  │  │
│  │  │  GraphQL   │  │  (pluggable)    │  │  (Resend)    │  │  │
│  │  │  + API     │  │  ├─ WordPress   │  │              │  │  │
│  │  │            │  │  ├─ (future)    │  │              │  │  │
│  │  └────────────┘  └─────────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Data Store (Redis / JSON)                     │  │
│  │  Tenants · Templates · Scheduled Events · Instructors     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
│  SSI         │   │  WordPress       │   │  Email       │
│  (shootn     │   │  (Tapahtuma-     │   │  (Resend)    │
│   scoreit)   │   │   kalenteri)     │   │              │
└──────────────┘   └──────────────────┘   └──────────────┘
```

**Key decision:** This lives within the existing `scoring-proxy` / `scoring-ui` codebase, not as a separate application. The match management features are a natural extension of the existing Express server with its SSI integration, session management, and auth.

---

## 3. Domain Model

```
┌─────────────────────────────────────────────────────────────────┐
│ PLATFORM OWNER (signs up, creates tenants)                      │
│ id · email · name · passwordHash                                │
│ tenants[] · createdAt                                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ owns one or more
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ TENANT                                                          │
│ id · name · ownerId · ssiCredentials (encrypted)                │
│ calendarConfig                                                  │
│ disciplines[] · instructors[] · templates[]                     │
│                                                                 │
│ SUBSCRIPTION                                                    │
│   plan (free_trial | basic | pro)                               │
│   status (trial | active | past_due | cancelled)                │
│   trialEndsAt · currentPeriodEnd                                │
│   paymentMethod { type, last4, expiresAt }                      │
│   cancelledAt · cancellationReason                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐    ┌──────────────────────────────────────┐ │
│  │  DISCIPLINE   │    │  INSTRUCTOR                          │ │
│  │  id · name    │    │  id · name · email (SSI identity)    │ │
│  │  label_fi     │    │  qualifiedDisciplines[]               │ │
│  │  label_en     │    │  roles[] (lead, equipment, staff)     │ │
│  │  ssiGroupId   │    │                                      │ │
│  │  ssiOrganizer │    │                                      │ │
│  │  Id           │    │                                      │ │
│  │               │◄──►│  status (pending → approved → active  │ │
│  │               │    │          → inactive)                  │ │
│  │               │    │  registeredAt · approvedBy            │ │
│  └──────┬────────┘    └──────────────────────────────────────┘ │
│         │                                                       │
│         │ has many                                               │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  EVENT TEMPLATE                                           │  │
│  │  id · name · disciplineId                                 │  │
│  │  ssiSeedEventId — reference to the SSI "seed" event       │  │
│  │  ssiSeedSnapshot — cached structure from SSI at import    │  │
│  │                                                           │  │
│  │  Overrides (applied on top of seed):                      │  │
│  │    nameTemplate · descriptionTemplate · informationTpl    │  │
│  │    cupSettings{} · matchSettings{} · squadDefinitions[]   │  │
│  │    registrationRules{} · timingRules{}                    │  │
│  │                                                           │  │
│  │  Calendar template:                                       │  │
│  │    calendarTitleTemplate · calendarContent (HTML)          │  │
│  │    calendarShortDescription · calendarLocation             │  │
│  │    calendarTaxonomyIds[]                                   │  │
│  │                                                           │  │
│  │  Staffing rules:                                          │  │
│  │    minInstructors · maxInstructors                         │  │
│  │    requiredRoles[] · staffSquadConfig{}                    │  │
│  └──────────────┬───────────────────────────────────────────┘  │
│                 │                                               │
│                 │ instantiated as                                │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SCHEDULED EVENT                                          │  │
│  │  id · templateId · date · status                          │  │
│  │                                                           │  │
│  │  Status lifecycle:                                        │  │
│  │    planned → ssi_created → calendar_published →           │  │
│  │    staffed → ready → completed                            │  │
│  │                                                           │  │
│  │  SSI references (created events):                         │  │
│  │    ssiCupId · ssiCupUrl                                   │  │
│  │    ssiMatches[] { id, url, name, componentNumber }        │  │
│  │                                                           │  │
│  │  Calendar reference:                                      │  │
│  │    calendarEventId · calendarUrl                           │  │
│  │                                                           │  │
│  │  Staffing:                                                │  │
│  │    assignedInstructors[] { instructorId, role }            │  │
│  │                                                           │  │
│  │  Audit:                                                   │  │
│  │    createdAt · createdBy · lastModifiedAt                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mapping to current system

| Current (scripts/config)           | New (match management)          |
|------------------------------------|---------------------------------|
| `kupittaa-cup-config.yml`          | EventTemplate (Kupittaa Cup)    |
| `sra-training-config.yml`          | EventTemplate (SRA) + staffing  |
| `kupittaa-cup-dates.txt`           | ScheduledEvent records          |
| `config/api-key.yml`               | Tenant SSI credentials          |
| `New-KupittaaCup.ps1`             | scheduling-service + SSI adapter|
| `New-KupittaaCupBatch.ps1`        | Batch scheduling UI             |
| Staffing engine (`lib/staffing/`)  | instructor-service (evolved)    |

---

## 4. Core Workflows

### 4.1 Template Creation (from SSI Seed Event)

```
 User                    System                        SSI
  │                        │                             │
  │  1. Create seed event  │                             │
  │  ─────────────────────────────────────────────────► │
  │  (manually in SSI UI)  │                             │
  │                        │                             │
  │  2. Enter SSI URL/ID   │                             │
  │  ─────────────────────►│                             │
  │                        │  3. Fetch event structure    │
  │                        │  ───────────────────────────►│
  │                        │  ◄───────────────────────────│
  │                        │  (cup + matches + squads     │
  │                        │   + settings + descriptions) │
  │                        │                             │
  │  4. Visualize structure│                             │
  │  ◄─────────────────────│                             │
  │                        │                             │
  │  ┌──────────────────────────────────────────┐       │
  │  │  TEMPLATE EDITOR VIEW                    │       │
  │  │                                          │       │
  │  │  Seed: SSI #12345 "Test Kupittaa CUP"   │       │
  │  │  Discipline: [Kupittaa Cup ▼]            │       │
  │  │                                          │       │
  │  │  ┌─ Cup Structure ─────────────────────┐│       │
  │  │  │ Name: TurRes Kupittaa CUP {date}    ││       │
  │  │  │ Matches: 3                           ││       │
  │  │  │  ├─ {date} Tarkkuus (25m kuvio)     ││       │
  │  │  │  ├─ {date} Pika (25m kuvio)         ││       │
  │  │  │  └─ {date} Kuvio (25m kuvio)        ││       │
  │  │  │ Squads per match: 3                  ││       │
  │  │  │  ├─ Laina-ase (max 9)               ││       │
  │  │  │  ├─ Oma ase 1 (max 9)              ││       │
  │  │  │  └─ Oma ase 2 (max 7)              ││       │
  │  │  └─────────────────────────────────────┘│       │
  │  │                                          │       │
  │  │  ┌─ Descriptions (editable) ───────────┐│       │
  │  │  │ Cup description: [___________]       ││       │
  │  │  │ Cup information: [___________]       ││       │
  │  │  │ Match descriptions: [per match]      ││       │
  │  │  └─────────────────────────────────────┘│       │
  │  │                                          │       │
  │  │  ┌─ Calendar Template ─────────────────┐│       │
  │  │  │ Title: Kupittaan ampumavuoro {date}  ││       │
  │  │  │ Location: [___________]              ││       │
  │  │  │ Content (HTML): [___________]        ││       │
  │  │  └─────────────────────────────────────┘│       │
  │  │                                          │       │
  │  │  ┌─ Staffing Rules ────────────────────┐│       │
  │  │  │ Min instructors: 2                   ││       │
  │  │  │ Required roles: Lead instructor      ││       │
  │  │  └─────────────────────────────────────┘│       │
  │  │                                          │       │
  │  │  [Save Template]  [Preview]  [Cancel]   │       │
  │  └──────────────────────────────────────────┘       │
  │                        │                             │
  │  5. Save template      │                             │
  │  ─────────────────────►│                             │
  │                        │  (stores template + snapshot)│
  │  ◄─────────────────────│                             │
```

### 4.2 Event Scheduling (Batch Creation)

```
 User                    System                   SSI         Calendar
  │                        │                       │             │
  │  1. Select template    │                       │             │
  │  ─────────────────────►│                       │             │
  │                        │                       │             │
  │  2. Enter dates        │                       │             │
  │  ┌─────────────────┐   │                       │             │
  │  │ Add dates:       │   │                       │             │
  │  │ 14.2.2026       │   │                       │             │
  │  │ 21.2.2026       │   │                       │             │
  │  │ 28.2.2026       │   │                       │             │
  │  │ [+ Add more]     │   │                       │             │
  │  │                  │   │                       │             │
  │  │ [Create All]     │   │                       │             │
  │  └─────────────────┘   │                       │             │
  │  ─────────────────────►│                       │             │
  │                        │                       │             │
  │  3. Progress view      │  For each date:       │             │
  │  ◄─────────────────────│                       │             │
  │                        │  a. Check duplicates   │             │
  │  ┌─────────────────┐   │  ────────────────────►│             │
  │  │ 14.2 ✅ SSI     │   │  b. Create cup        │             │
  │  │      ✅ Calendar│   │  ────────────────────►│             │
  │  │      ✅ Done    │   │  c. Create matches     │             │
  │  │ 21.2 ⏳ SSI...  │   │  ────────────────────►│             │
  │  │      ⬜ Calendar│   │  d. Link matches       │             │
  │  │ 28.2 ⬜ Pending │   │  ────────────────────►│             │
  │  └─────────────────┘   │  e. Create squads      │             │
  │                        │  ────────────────────►│             │
  │                        │  f. Create calendar    │             │
  │                        │  ────────────────────────────────►│
  │                        │                       │             │
  │  4. Completion summary │                       │             │
  │  ◄─────────────────────│                       │             │
  │                        │                       │             │
  │  ┌──────────────────────────────────────────┐  │             │
  │  │  CREATION SUMMARY                        │  │             │
  │  │                                          │  │             │
  │  │  14.2.2026  ✅ Created                   │  │             │
  │  │    SSI: shootnscoreit.com/cup/12345     │  │             │
  │  │    Cal: turunreservilaiset.fi/event/789  │  │             │
  │  │                                          │  │             │
  │  │  21.2.2026  ✅ Created                   │  │             │
  │  │    SSI: shootnscoreit.com/cup/12346     │  │             │
  │  │    Cal: turunreservilaiset.fi/event/790  │  │             │
  │  │                                          │  │             │
  │  │  28.2.2026  ❌ Failed (duplicate name)   │  │             │
  │  │    Error: Cup already exists             │  │             │
  │  └──────────────────────────────────────────┘  │             │
```

### 4.3 Instructor Roster (Standalone Module)

The Instructor Roster is a **dedicated subsite/module** — not embedded in the scheduling
workflow. It focuses purely on managing the pool of qualified instructors. The staffing
matrix (who is assigned to which event) lives in the Schedule view.

#### Roles

- **Instructor Admin** — manages the roster: approve/reject registrations, edit
  instructor profiles, assign disciplines and roles, deactivate instructors.
  Later: invite instructors.
- **Instructor** — self-registers, manages own profile (disciplines, roles,
  contact info). Views own upcoming assignments.

#### Instructor Lifecycle

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  (new)   │────►│ Pending  │────►│ Approved │────►│  Active  │
  │          │     │          │     │          │     │          │
  └──────────┘     └──────────┘     └──────────┘     └──────────┘
   self-register   admin reviews    admin activates   can be assigned
                   or auto-approve  (or auto)         to events
                        │                                  │
                        ▼                                  ▼
                   ┌──────────┐                      ┌──────────┐
                   │ Rejected │                      │ Inactive │
                   └──────────┘                      └──────────┘
```

**Phase 1 (now):** Open self-registration → auto-approved (small trusted community)  
**Phase 2 (later):** Invite + approve flow, instructor admin approval required

#### Self-Registration Flow

```
 Instructor                System                       Instructor Admin
  │                          │                              │
  │  1. Navigate to          │                              │
  │     /instructors/join    │                              │
  │  ────────────────────►   │                              │
  │                          │                              │
  │  2. Enter details:       │                              │
  │     - Name               │                              │
  │     - Email (SSI)        │                              │
  │     - Disciplines []     │                              │
  │     - Preferred roles [] │                              │
  │  ────────────────────►   │                              │
  │                          │  3. (If approval required)   │
  │                          │  ────────────────────────────►│
  │                          │     Notification: new signup  │
  │                          │                              │
  │                          │  4. Admin approves            │
  │                          │  ◄────────────────────────────│
  │                          │                              │
  │  5. Confirmation email   │                              │
  │  ◄──────────────────────│                              │
  │  "Welcome to TurRes      │                              │
  │   instructor roster"     │                              │
```

#### Roster Views

```
INSTRUCTOR ADMIN VIEW (full roster management):
┌────────────────────────────────────────────────────────────┐
│  Instructor Roster                         [+ Invite]     │
│                                                           │
│  Filter: [All ▼]  Status: [Active ▼]  Search: [______]   │
│                                                           │
│  Name          │ Email      │ Disciplines │ Roles │ Status│
│  ─────────────────────────────────────────────────────────│
│  Tapio S.      │ tapio@...  │ SRA, KC     │ Lead  │ ✅    │
│  Jarkko A.     │ jarkko@... │ SRA, PRS    │ Staff │ ✅    │
│  Joose O.      │ joose@...  │ SRA         │ Equip │ ✅    │
│  Antti L.      │ antti@...  │ KC, RA      │ Staff │ ✅    │
│  Matti V.      │ matti@...  │ SRA         │ —     │ ⏳    │
│                                                           │
│  Pending Approvals (1)                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Matti Virtanen (matti@...) — Applied: SRA, Staff     │ │
│  │ [Approve]  [Reject]  [View details]                  │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘

INSTRUCTOR SELF-VIEW (own profile + assignments):
┌────────────────────────────────────────────────────────────┐
│  My Instructor Profile                                     │
│                                                           │
│  Name: Tapio Santavuori                                   │
│  Email: tapiosantavuori@protonmail.com                     │
│  Disciplines: SRA, Kupittaa Cup                           │
│  Roles: Lead Instructor, Staff                            │
│  Status: Active                                           │
│  [Edit Profile]                                           │
│                                                           │
│  My Upcoming Events:                                       │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 28.02 Kupittaa Cup — Vastuuvetäjä (Lead)            │ │
│  │ 01.03 SRA Oldies — Vetäjä (Staff)                   │ │
│  │ 08.03 SRA Newbie — Vetäjä (Staff)                   │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

> **Note:** The staffing matrix (instructor × event assignment grid) lives in the
> **Schedule** view, not here. The roster is about *who is available*; scheduling
> is about *who goes where*.

---

## 5. Multi-Tenancy

### 5.1 Isolation Model

```
┌─────────────────────────────────────────────────────────────┐
│                     SYSTEM                                   │
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │  TENANT: TurRes     │    │  TENANT: RaiResUps  │        │
│  │                     │    │                     │        │
│  │  SSI Group: 25874   │    │  SSI Group: xxxxx   │        │
│  │  Organizer: 1215    │    │  Organizer: yyyy    │        │
│  │                     │    │                     │        │
│  │  Disciplines:       │    │  Disciplines:       │        │
│  │  ├─ Kupittaa Cup    │    │  ├─ SRA             │        │
│  │  ├─ SRA             │    │  └─ PRS             │        │
│  │  └─ RA              │    │                     │        │
│  │                     │    │  Templates: ...     │        │
│  │  Templates:         │    │  Instructors: ...   │        │
│  │  ├─ Kupittaa Cup    │    │  Events: ...        │        │
│  │  ├─ SRA Oldies      │    │                     │        │
│  │  └─ SRA Newbie      │    │  Calendar:          │        │
│  │                     │    │  └─ WordPress       │        │
│  │  Instructors:       │    │     (rairesups.fi)  │        │
│  │  ├─ Tapio S.        │    │                     │        │
│  │  ├─ Jarkko A.       │    └─────────────────────┘        │
│  │  └─ ...             │                                    │
│  │                     │    ┌─────────────────────┐        │
│  │  Calendar:          │    │  TENANT: ...        │        │
│  │  └─ WordPress       │    │  (future tenants)   │        │
│  │     (turunreservi   │    └─────────────────────┘        │
│  │      laiset.fi)     │                                    │
│  └─────────────────────┘                                    │
│                                                             │
│  SHARED: Auth system, SSI GraphQL client, notification      │
│  engine, calendar adapter framework                         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Authentication & Authorization

```
Platform Owner (self-service, signs up independently)
  │
  ├─ Can: create new tenants (self-service)
  ├─ Can: manage billing, payment methods, subscription plan
  ├─ Can: cancel service / request data export
  ├─ Can: view all own tenants and switch between them
  ├─ Can: do everything Tenant Admin can do (for owned tenants)
  └─ Cannot: see other owners' tenants

Tenant Admin
  │
  ├─ Can: manage tenant settings, disciplines, templates
  ├─ Can: create/delete scheduled events
  ├─ Can: assign instructors to events
  ├─ Can: do everything Instructor Admin can do
  └─ Cannot: see other tenants' data or manage billing

Instructor Admin (roster manager)
  │
  ├─ Can: view full instructor roster
  ├─ Can: approve/reject instructor registrations
  ├─ Can: edit instructor profiles, disciplines, roles
  ├─ Can: deactivate instructors
  ├─ Can: (later) invite instructors
  └─ Cannot: manage templates, events, or tenant settings

Match Director (per discipline)
  │
  ├─ Can: create events from templates they have access to
  ├─ Can: assign instructors to their events
  ├─ Can: view instructor availability
  └─ Cannot: modify templates, roster, or tenant settings

Instructor
  │
  ├─ Can: self-register to join the roster
  ├─ Can: manage own profile (disciplines, roles)
  ├─ Can: view own upcoming event assignments
  ├─ Can: sign up / resign from events (if self-service enabled)
  └─ Cannot: create events, modify templates, or see other profiles
```

**Auth approach:** Extend current V7 session system with tenant context. User ↔ Tenant mapping stored in tenant config. SSI email is the identity key (same as current staffing allowlist pattern).

---

## 6. Data Storage (Minimal)

### 6.1 What we store

```yaml
# Stored in Redis (or JSON file for simple deployments)

# --- Platform level ---
owner:{ownerId}:profile         # Name, email, passwordHash, createdAt
owner:{ownerId}:tenants         # List of owned tenant IDs

# --- Tenant level (keyed by tenant ID — complete isolation) ---
tenant:{tenantId}:config        # Tenant settings, SSI creds, calendar config
tenant:{tenantId}:subscription  # Plan, status, trial dates, payment method
tenant:{tenantId}:disciplines   # Discipline definitions (incl. ssiGroupId, ssiOrganizerId)
tenant:{tenantId}:templates     # Event templates (seed ref + overrides)
tenant:{tenantId}:instructors   # Instructor roster
tenant:{tenantId}:events        # Scheduled events (IDs, status, dates)
tenant:{tenantId}:users         # User ↔ role mappings
```

### 6.2 What we DON'T store

- Event structure details (read from SSI on demand)
- Competitor lists (SSI is the source)
- Scores (SSI is the source)
- Calendar event content after creation (calendar system is the source)

### 6.3 Example: Event Template (stored)

```json
{
  "id": "tpl_kupittaa_cup",
  "name": "Kupittaa Cup",
  "disciplineId": "kupittaa_cup",
  "ssiSeedEventId": "12345",
  "ssiSeedSnapshot": {
    "fetchedAt": "2026-02-24T10:00:00Z",
    "cupContentType": 136,
    "matchContentType": 91,
    "structure": {
      "matchCount": 3,
      "matches": [
        { "suffix": "Tarkkuus", "subRule": "p2p" },
        { "suffix": "Pika", "subRule": "p2p" },
        { "suffix": "Kuvio", "subRule": "p2p" }
      ],
      "squadsPerMatch": 3,
      "squads": [
        { "name": "Laina-ase", "maxCompetitors": 9 },
        { "name": "Oma ase 1", "maxCompetitors": 9 },
        { "name": "Oma ase 2", "maxCompetitors": 7 }
      ]
    },
    "ssiSettings": { "...all SSI field values from seed..." }
  },
  "overrides": {
    "cupNameTemplate": "TurRes Kupittaa CUP {displayDate}",
    "matchNameTemplate": "Kupittaa {displayDate} {matchSuffix}",
    "timing": {
      "startTime": "09:00",
      "endTime": "12:00",
      "registrationDaysBefore": 7
    }
  },
  "calendarTemplate": {
    "titleTemplate": "Kupittaan ampumavuoro {displayDate}",
    "location": "Kupittaan urheiluhallin ampumarata",
    "shortDescription": "Lauantain ampumavuoro...",
    "content": "<div>...HTML...</div>"
  },
  "staffing": {
    "minInstructors": 2,
    "maxInstructors": 4,
    "requiredRoles": ["leadInstructor"]
  }
}
```

### 6.4 Example: Scheduled Event (stored)

```json
{
  "id": "evt_20260214",
  "templateId": "tpl_kupittaa_cup",
  "date": "2026-02-14",
  "status": "completed",
  "ssi": {
    "cupId": "54321",
    "cupUrl": "https://shootnscoreit.com/nordic/serie/54321/",
    "matches": [
      { "id": "54322", "name": "Tarkkuus", "componentNumber": 1 },
      { "id": "54323", "name": "Pika", "componentNumber": 2 },
      { "id": "54324", "name": "Kuvio", "componentNumber": 3 }
    ]
  },
  "calendar": {
    "eventId": "789",
    "url": "https://turunreservilaiset.fi/event/789/"
  },
  "instructors": [
    { "instructorId": "inst_tapio", "role": "leadInstructor" },
    { "instructorId": "inst_jarkko", "role": "staff" }
  ],
  "createdAt": "2026-01-20T10:00:00Z",
  "createdBy": "tohewi@live.com"
}
```

---

## 7. Calendar Backend (Pluggable)

```
┌────────────────────────────────────────┐
│  CalendarAdapter Interface             │
│                                        │
│  createEvent(template, date) → eventId │
│  updateEvent(eventId, changes) → void  │
│  deleteEvent(eventId) → void           │
│  getEvent(eventId) → eventDetails      │
└──────────────┬─────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌──────────────┐   ┌──────────────┐
│  WordPress   │   │  (Future)    │
│  Adapter     │   │  Google Cal  │
│              │   │  Adapter     │
│  Uses WP     │   │              │
│  REST API    │   │              │
│  + auth      │   │              │
└──────────────┘   └──────────────┘
```

WordPress adapter handles:
- Authentication (username/password + optional OTP)
- Event creation via WP REST API
- Taxonomy assignment (event format IDs)
- SSI link injection into content (`{ssiCupLink}` replacement)

---

## 8. Discipline Configuration

Disciplines are extensible. Each has its own characteristics:

| Discipline    | Event Type     | Cup? | Matches/Cup | Squads | Staffing Model |
|---------------|---------------|------|-------------|--------|----------------|
| Kupittaa Cup  | RESUL 25m     | Yes  | 3           | 3      | Instructor roster |
| SRA Oldies    | SRA Match     | No   | 1           | 4+1    | Self-signup + allocation |
| SRA Newbie    | SRA Match     | No   | 1           | 4+1    | Self-signup + allocation |
| RA            | RESUL Match   | Var  | Varies      | Varies | Instructor roster |
| PRS           | PRS Match     | No   | 1           | Varies | Instructor roster |

**Key insight:** The template-from-seed approach handles this naturally. Each discipline's SSI structure is captured from the seed event — no hardcoded discipline logic needed.

---

## 9. Notification Framework (Placeholder)

> *"More about those later"* — but the system should be designed to support:

```
Notification triggers:
  ├─ Event created → notify instructors (availability request)
  ├─ Instructor assigned → confirmation
  ├─ Staffing gap detected → alert to tenant admin
  ├─ Registration milestone → info to match director
  ├─ Event approaching (T-24h) → reminder to assigned instructors
  └─ Event completed → summary

Channels:
  ├─ Email (Resend — already integrated)
  └─ (future: push, SMS, Telegram)

Templates:
  └─ Per-tenant, per-language (fi/en), with variable substitution
      (same pattern as current sra-training-config.yml notifications)
```

---

## 10. Migration Path

### Phase 0: Platform & Self-Service Onboarding
- Platform owner sign-up (email + password)
- Tenant creation wizard (name, owner details, SSI creds)
- Free trial (30 days, full functionality, no payment required)
- Subscription management (plan selection, upgrade/downgrade)
- Payment method capture (Stripe or equivalent)
- Service cancellation + data export
- Single hard-coded tenant (TurRes) initially — self-service portal wraps it

### Phase 1: Template + Scheduling (replaces scripts)
- Import existing `kupittaa-cup-config.yml` as first template
- Build template browser, seed-event import, scheduling UI
- SSI event creation (replaces `New-KupittaaCup.ps1`)
- Calendar publishing (replaces WordPress section of batch script)

### Phase 2: Instructor Roster (standalone module)
- Instructor self-registration (open, auto-approve for now)
- Instructor admin view (roster CRUD, profile management)
- Instructor self-view (own profile, upcoming assignments)
- Event ↔ instructor assignment (in Schedule view)
- Staffing matrix (in Schedule view)
- Evolve current staffing engine

### Phase 2b: Invite & Approve (later)
- Instructor Admin can invite by email
- Approval workflow (pending → approved → active)
- Instructor Admin notifications on new registrations

### Phase 3: Multi-Tenancy (full)
- Multiple tenants per owner
- Tenant isolation in data store
- Tenant switcher in UI
- Per-tenant SSI credentials and calendar configs
- Usage-based limits per plan

### Phase 4: Notifications
- Notification templates per tenant
- Event-driven triggers
- Email delivery via Resend
- Notification history/audit

---

## 11. Open Questions

| # | Question | Notes |
|---|----------|-------|
| 1 | Should the seed event be "consumed" (deleted from SSI after import) or kept as a living reference that can be re-synced? | Re-sync is more useful but adds complexity |
| 2 | Can an instructor belong to multiple tenants? | Probably not (complete isolation), but same person could have accounts in both |
| 3 | Should scheduled events support modification after SSI creation? (e.g., change description) | SSI is the source — push changes back to SSI? |
| 4 | Is there a concept of "seasons" (e.g., Spring 2026 Kupittaa Cup series)? | Helps with batch operations and reporting |
| 5 | Should the system support deleting/cancelling events it created? | Useful for test events; needs SSI delete API |
| 6 | Where does WordPress auth (OTP) fit in the web workflow? | Current batch script prompts interactively |
| 7 | How do SRA self-signup instructors relate to the instructor roster? | Roster = qualified pool, self-signup = per-event commitment? |
| 8 | Should templates version-controlled? (e.g., description changed mid-season) | Could just overwrite, or keep version history |

---

## 12. UI Navigation (Proposed)

```
PRE-LOGIN (unauthenticated):
┌─────────────────────────────────────────────────┐
│  🏠 Welcome / Sign-Up                           │
│     Landing page with feature overview           │
│     Free trial registration form                 │
│     Sign-in link → Dashboard                     │
└─────────────────────────────────────────────────┘

POST-LOGIN (authenticated — default view = Dashboard):
┌─────────────────────────────────────────────────┐
│  Match Management                    [TurRes ▼] │
├─────────────────────────────────────────────────┤
│  ─── Management ───                             │
│  🏠 Dashboard    │  At-a-glance overview         │
│  📋 Templates    │  Manage event templates      │
│  📅 Schedule     │  Events + staffing matrix     │
│                                                 │
│  ─── Instructor Roster (standalone) ───         │
│  👥 Roster       │  All instructors (admin)     │
│  🙋 Join         │  Self-register (public)       │
│  👤 My Profile   │  Own profile + assignments   │
│                                                 │
│  ─── Admin ───                                  │
│  📊 My Tenants   │  Owner's tenant list          │
│  💳 Billing      │  Plan, payment, cancel        │
│  ⚙️ Settings     │  Tenant configuration         │
│                                                 │
│  ─── Also ───                                   │
│  🎯 Scoring      │  (existing scoring app)      │
│  📊 Reports      │  (existing reports)          │
│  👤 Staffing     │  (existing SRA staffing)     │
│                                                 │
└─────────────────────────────────────────────────┘
```

This integrates into the existing app's navigation, with the tenant selector in the header for multi-tenant users.
