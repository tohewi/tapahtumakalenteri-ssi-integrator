# SRA Training Staff Management — Design Document

**Version**: 0.3.0 (Final Draft)
**Date**: 2026-02-10
**Status**: Design — All review decisions incorporated, ready for sign-off
**Requirements**: [sra-training-staffing-requirements.md](../requirements/sra-training-staffing-requirements.md)

---

## 1. Overview

SRA Training Staff Management automates the coordination of training instructors ("vetäjät") for SRA practice sessions at Temppelivuori range. The system handles staff signup, queue management, role assignment, squad optimization, and notifications — integrating with the existing SSI (ShootNScoreIt) platform.

### 1.1 Goals

- Automate staff position allocation based on shooter enrollment
- Manage a signup queue with first-come-first-served ordering
- Assign special roles (lead instructor, equipment manager) with fallback logic
- Optimize squad count based on shooter numbers
- Notify staff of their assignment status
- Support multi-language UI (Finnish, English)
- Use configuration files for organization-specific settings

### 1.2 Design Principles

- **Modular**: Each concern (staffing, squads, notifications, config) is an independent module
- **Configurable**: Organization, roles, thresholds, and templates driven by YAML config
- **Multi-language**: All user-facing strings externalized via i18n (fi/en)
- **SSI-integrated**: Leverage existing SSI roles and squad structures where possible
- **Consistent**: Follow existing codebase patterns (Express routes, React components, i18n flat objects)

---

## 2. Architecture

### 2.1 System Context

```
┌──────────────────────────────────────────────────────┐
│                    Mobile / Desktop                    │
│  ┌────────────────────────────────────────────────┐  │
│  │           scoring-ui (React PWA)               │  │
│  │                                                │  │
│  │  HomePage → StaffingPage                       │  │
│  │    ├── StaffSignupPanel                        │  │
│  │    ├── StaffStatusBoard                        │  │
│  │    ├── RoleAssignmentPanel                     │  │
│  │    └── SquadOptimizationView                   │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │ HTTPS /api/staffing/*          │
└───────────────────────┼──────────────────────────────┘
                        │
          ┌─────────────▼─────────────┐
          │    scoring-proxy (Node)   │
          │                           │
          │  routes/staffing.js       │
          │  lib/staffing/            │
          │    ├── engine.js          │
          │    ├── squad-optimizer.js │
          │    ├── role-assigner.js   │
          │    ├── notifier.js        │
          │    └── config-loader.js   │
          └─────────┬─────────────────┘
                    │
       ┌────────────▼────────────┐
       │   shootnscoreit.com     │
       │                         │
       │  GraphQL API            │
       │   • Squad queries       │
       │   • Competitor lists    │
       │   • Role assignments    │
       │                         │
       │  Web Forms              │
       │   • Squad management    │
       │   • Role updates        │
       └─────────────────────────┘
```

### 2.2 Module Breakdown

| Module | Location | Responsibility |
|--------|----------|----------------|
| **staffing route** | `scoring-proxy/routes/staffing.js` | API endpoints for staff operations |
| **staffing engine** | `scoring-proxy/lib/staffing/engine.js` | Core business logic: signup, queue, allocation |
| **squad optimizer** | `scoring-proxy/lib/staffing/squad-optimizer.js` | Determine squad count from shooter enrollment |
| **role assigner** | `scoring-proxy/lib/staffing/role-assigner.js` | Special role assignment logic |
| **notifier** | `scoring-proxy/lib/staffing/notifier.js` | Email/in-app notifications |
| **config loader** | `scoring-proxy/lib/staffing/config-loader.js` | Load and validate YAML config |
| **staffing UI** | `scoring-ui/src/components/StaffingPage.jsx` | Frontend staff management page |
| **staffing API client** | `scoring-ui/src/staffing-api.js` | Frontend API calls for staffing |
| **i18n (staffing)** | `scoring-ui/src/i18n.js` | Staffing-related UI strings (fi/en) |
| **config** | `config/training-staffing-configuration.yml` | Organization, roles, thresholds |

---

## 3. Data Model

### 3.1 Configuration Data (YAML)

```yaml
# config/training-staffing-configuration.yml

organization:
  name: "Temppelivuori SRA"
  range: "Temppelivuori"
  timezone: "Europe/Helsinki"

# Admin allowlist — only these SSI users can sign up as staff (Q1: config file allowlist)
# Each entry: SSI email address
adminAllowlist:
  - "admin1@example.com"
  - "admin2@example.com"
  # Add all eligible vetäjät SSI emails here

# SSI event discovery (R3: search matches by name, R5: Cup/League→Match→Squad)
eventDiscovery:
  searchStrings:
    - "oldies"
    - "newbie"
  matchContentType: 91       # NordicMatch
  cupContentType: 136        # NordicSerie (Cup/League)
  staffSquadName: "Squad 5"  # or match by position (5th squad)

trainingTypes:
  oldies:
    label:
      fi: "Kokeneiden harjoitus"
      en: "Experienced training"
    maxSquads: 4
    shooterSquads: [1, 2, 3, 4]
    staffSquad: 5
    minShootersPerSquad: 5
  newbie:
    label:
      fi: "Uusien koulutus"
      en: "Newbie training"
    maxSquads: 4
    shooterSquads: [1, 2, 3, 4]
    staffSquad: 5
    minShootersPerSquad: 5

roles:
  staff:
    label:
      fi: "Vetäjä"
      en: "Instructor"
    ssiRole: null  # regular squad member in Squad 5
  leadInstructor:
    label:
      fi: "Vastuuvetäjä"
      en: "Lead Instructor"
    ssiRole: "Match director"
    required: true
    maxPerEvent: 1
  equipmentManager:
    label:
      fi: "Kalustovastaava"
      en: "Equipment Manager"
    ssiRole: "Quarter master"
    required: true
    maxPerEvent: 1

registration:
  closesBeforeEventHours: 24
  queueMode: "fifo"  # first-come-first-served
  allowCancellation: true
  cancellationDeadlineHours: 24  # same as registration close

staffAllocation:
  excessStaffAction: "move_to_shooter_squad_and_notify"  # Q3: auto-move AND notify
  roleAssignmentMode: "volunteer_then_random"  # Q4: binding — volunteer preference is guaranteed if available
  rolePreferenceBinding: true                  # Q4: role preference is binding (not advisory)
  allowDualRoles: false                        # Q7: one person cannot hold both special roles

finalization:
  mode: "automated"                            # Q5: fully automated on registration close
  triggerOnRegistrationClose: true             # System auto-triggers 24h before event

notifications:
  channels: ["email"]  # future: ["email", "in_app"]
  templates:
    staffConfirmed:
      fi: "Olet vahvistettu vetäjäksi tapahtumaan {eventName}. Roolisi: {role}."
      en: "You are confirmed as staff for {eventName}. Your role: {role}."
    staffMovedToShooterSquad:
      fi: "Et mahtunut vetäjäksi tapahtumaan {eventName}. Sinut on siirretty ampujaksi squadiin {squad}."
      en: "You were not selected as staff for {eventName}. You have been moved to shooter squad {squad}."
    roleAssigned:
      fi: "Sinulle on osoitettu rooli: {role} tapahtumassa {eventName}."
      en: "You have been assigned the role: {role} for {eventName}."
    missingRole:
      fi: "HUOM: Roolille {role} ei ole ilmoittautunutta tapahtumassa {eventName}."
      en: "WARNING: No volunteer for {role} in {eventName}."
    promotedFromQueue:
      fi: "Paikka vetäjänä vapautui! Olet nyt vahvistettu vetäjäksi tapahtumaan {eventName}."
      en: "A staff position opened up! You are now confirmed as staff for {eventName}."
```

### 3.2 Runtime Data Model

The staffing engine maintains state per training event. Data is stored server-side (in-memory initially, database later).

```
┌─────────────────────────────────────────────────────┐
│                   TrainingEvent                      │
├─────────────────────────────────────────────────────┤
│ eventId          : string (SSI event ID)            │
│ trainingType     : "oldies" | "newbie"              │
│ eventDate        : ISO date                         │
│ registrationClose: ISO datetime                     │
│ status           : "open" | "closed" | "finalized"  │
│ shooterCount     : number                           │
│ activeSquadCount : number (computed)                │
│ staffPositions   : number (= activeSquadCount)      │
├─────────────────────────────────────────────────────┤
│ staffSignups     : StaffSignup[]                    │
│ roleAssignments  : RoleAssignment[]                 │
│ notifications    : NotificationLog[]                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   StaffSignup                        │
├─────────────────────────────────────────────────────┤
│ userId           : string (SSI user ID)             │
│ userName         : string                           │
│ email            : string                           │
│ signupTime       : ISO datetime                     │
│ queuePosition    : number (1-based, by signupTime)  │
│ status           : "queued" | "confirmed" |         │
│                    "overflow" | "cancelled"          │
│ rolePreference   : string | null                    │
│                    ("leadInstructor" |               │
│                     "equipmentManager" | null)       │
│ assignedRole     : string | null                    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                  RoleAssignment                      │
├─────────────────────────────────────────────────────┤
│ roleId           : string (config key)              │
│ userId           : string | null                    │
│ assignmentMethod : "volunteer" | "random" | null    │
│ assignedAt       : ISO datetime | null              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 NotificationLog                      │
├─────────────────────────────────────────────────────┤
│ id               : string                           │
│ userId           : string                           │
│ templateKey      : string                           │
│ channel          : "email" | "in_app"               │
│ sentAt           : ISO datetime                     │
│ status           : "sent" | "failed"                │
│ params           : object (template variables)      │
└─────────────────────────────────────────────────────┘
```

### 3.3 Entity Relationship Diagram

```
TrainingEvent 1──*  StaffSignup
TrainingEvent 1──*  RoleAssignment
TrainingEvent 1──*  NotificationLog
StaffSignup   1──0..1 RoleAssignment (via userId)
```

---

## 4. Core Algorithms

### 4.1 Squad Optimization

Determine how many squads are needed based on shooter count and the minimum-shooters-per-squad threshold.

```
Input:  shooterCount, maxSquads, minShootersPerSquad
Output: activeSquadCount

Algorithm:
  if shooterCount == 0: return 0
  idealSquads = ceil(shooterCount / minShootersPerSquad)
  activeSquadCount = min(idealSquads, maxSquads)
  // Ensure each squad has >= minShootersPerSquad
  while activeSquadCount > 1 AND (shooterCount / activeSquadCount) < minShootersPerSquad:
    activeSquadCount -= 1
  return activeSquadCount
```

**Examples** (minShootersPerSquad=5, maxSquads=4):

| Shooters | Ideal Squads | Active Squads | Shooters/Squad | Staff Needed |
|----------|-------------|---------------|----------------|-------------|
| 3        | 1           | 1             | 3              | 1           |
| 5        | 1           | 1             | 5              | 1           |
| 10       | 2           | 2             | 5              | 2           |
| 15       | 3           | 3             | 5              | 3           |
| 20       | 4           | 4             | 5              | 4           |
| 25       | 4 (capped)  | 4             | 6.25           | 4           |

### 4.2 Staff Allocation (automated on registration close — Q5)

Finalization triggers automatically 24h before the event when registration closes. No manual admin action required.

```
1. Determine activeSquadCount from shooterCount (via squad optimizer)
2. staffPositions = activeSquadCount
3. Sort staffSignups by signupTime (FIFO)
4. First `staffPositions` signups → status = "confirmed"
5. Remaining signups → status = "overflow"
6. For overflow staff (Q3: auto-move AND notify):
   a. Automatically move to shooter squads (round-robin, least-full first)
   b. Update SSI squad assignment via participant edit form
   c. Send "staffMovedToShooterSquad" notification with assigned squad
7. Assign special roles (see 4.3)
8. Send "staffConfirmed" + "roleAssigned" notifications to confirmed staff
```

### 4.3 Role Assignment

Role preference is **binding** (Q4): if a confirmed staff member volunteered for a role, they are guaranteed it (first-come-first-served if multiple volunteers). Dual roles are **not allowed** (Q7).

```
Mode: "volunteer_then_random"

1. For each required role (leadInstructor, equipmentManager):
   a. Find confirmed staff with rolePreference matching this role
   b. If exactly one volunteer → assign (binding guarantee)
   c. If multiple volunteers → assign first by signupTime (binding, FIFO)
   d. If no volunteer → randomly assign from confirmed staff without a role
2. A person assigned to one role is excluded from assignment for other roles (no dual roles)
3. If a required role cannot be filled (no confirmed staff left):
   - Send "missingRole" notification to admin
   - Event proceeds without that role filled
```

### 4.4 Cancellation and Queue Promotion

```
When a confirmed staff member cancels:
1. Set their status to "cancelled"
2. Find the first "overflow" signup (by queuePosition)
3. If found:
   a. Promote to "confirmed"
   b. Send "promotedFromQueue" notification
   c. Re-run role assignment if needed
4. If the cancelled person held a special role:
   a. Unassign the role
   b. Re-run role assignment for that role
```

---

## 5. API Design

### 5.1 Endpoints

All endpoints under `/api/staffing/`. Auth required (existing session mechanism).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/staffing/events` | List training events with staffing status |
| `GET` | `/api/staffing/events/:eventId` | Get event staffing details |
| `POST` | `/api/staffing/events/:eventId/signup` | Sign up as staff (with optional rolePreference) |
| `DELETE` | `/api/staffing/events/:eventId/signup` | Cancel staff signup |
| `POST` | `/api/staffing/events/:eventId/finalize` | Finalize staffing (admin only, triggers allocation) |
| `GET` | `/api/staffing/events/:eventId/status` | Get current staff list, roles, queue |
| `GET` | `/api/staffing/config` | Get staffing configuration (roles, training types) |

### 5.2 Request/Response Examples

**POST /api/staffing/events/:eventId/signup**
```json
{
  "rolePreference": "leadInstructor"  // optional, null for no preference
}
```

Response:
```json
{
  "queuePosition": 3,
  "status": "queued",
  "rolePreference": "leadInstructor",
  "message": "Signed up as staff. You are position 3 in the queue."
}
```

**GET /api/staffing/events/:eventId/status**
```json
{
  "eventId": "12345",
  "trainingType": "oldies",
  "eventDate": "2026-03-15",
  "status": "open",
  "shooterCount": 18,
  "activeSquadCount": 4,
  "staffPositions": 4,
  "staffSignups": [
    { "userName": "Matti V.", "queuePosition": 1, "status": "confirmed", "assignedRole": "leadInstructor" },
    { "userName": "Liisa K.", "queuePosition": 2, "status": "confirmed", "assignedRole": "equipmentManager" },
    { "userName": "Jukka P.", "queuePosition": 3, "status": "confirmed", "assignedRole": null },
    { "userName": "Anna S.", "queuePosition": 4, "status": "confirmed", "assignedRole": null },
    { "userName": "Pekka T.", "queuePosition": 5, "status": "overflow", "assignedRole": null }
  ],
  "roleAssignments": {
    "leadInstructor": { "userId": "u1", "userName": "Matti V.", "method": "volunteer" },
    "equipmentManager": { "userId": "u2", "userName": "Liisa K.", "method": "volunteer" }
  }
}
```

---

## 6. Frontend Design

### 6.1 New Components

| Component | Description |
|-----------|-------------|
| `StaffingPage.jsx` | Main page — event list with staffing status |
| `StaffSignupPanel.jsx` | Signup form with role preference selector |
| `StaffStatusBoard.jsx` | Shows staff list, queue positions, roles |
| `RoleAssignmentPanel.jsx` | Admin view for manual role overrides |
| `SquadOptimizationView.jsx` | Visual display of squad/staff allocation |

### 6.2 Navigation

Add to `HomePage.jsx` as a new feature card:

```
{
  href: '#/staffing',
  titleKey: 'staffingTitle',
  descriptionKey: 'staffingDescription',
  icon: <StaffIcon />,
  color: 'orange',
}
```

### 6.3 i18n Additions

New keys added to the existing `fi` and `en` objects in `scoring-ui/src/i18n.js`:

```javascript
// Staffing module
staffingTitle: 'SRA-harjoitusten vetäjähallinta',     // fi
staffingTitle: 'SRA Training Staff Management',        // en
staffingDescription: 'Ilmoittaudu vetäjäksi ja seuraa tilannetta',
staffingDescription: 'Sign up as staff and track status',
staffSignup: 'Ilmoittaudu vetäjäksi',
staffSignup: 'Sign up as staff',
staffCancel: 'Peru ilmoittautuminen',
staffCancel: 'Cancel signup',
queuePosition: 'Jonopaikkasi',
queuePosition: 'Your queue position',
confirmed: 'Vahvistettu',
confirmed: 'Confirmed',
overflow: 'Jonossa',
overflow: 'In queue',
leadInstructor: 'Vastuuvetäjä',
leadInstructor: 'Lead Instructor',
equipmentManager: 'Kalustovastaava',
equipmentManager: 'Equipment Manager',
noPreference: 'Ei toivetta',
noPreference: 'No preference',
rolePreference: 'Roolitoive',
rolePreference: 'Role preference',
staffPositionsAvailable: '{count} vetäjäpaikkaa',
staffPositionsAvailable: '{count} staff positions',
registrationClosesIn: 'Ilmoittautuminen sulkeutuu {time}',
registrationClosesIn: 'Registration closes in {time}',
finalize: 'Vahvista miehitys',
finalize: 'Finalize staffing',
movedToShooterSquad: 'Siirretty ampujaksi squadiin {squad}',
movedToShooterSquad: 'Moved to shooter squad {squad}',
```

---

## 7. SSI Integration (Day 1 — Q8)

SSI integration is required from day 1 to leverage existing event, squad, and participant infrastructure.

### 7.1 Role Mapping

| Staffing Role | SSI Role | Notes |
|---------------|----------|-------|
| Lead Instructor (vastuuvetäjä) | Match director | Existing SSI role — needs form scraping to verify assignment mechanism |
| Equipment Manager (kalustovastaava) | Quarter master | Existing SSI role — needs form scraping to verify assignment mechanism |
| Staff (vetäjä) | (regular member in Squad 5) | No special SSI role needed |

### 7.2 Existing SSI Functions (reusable)

The codebase already has these functions in `scoring-proxy/lib/ssi-core/client.js`:

| Function | Purpose | Staffing Use |
|----------|---------|-------------|
| `ssiGraphQL()` | Execute GraphQL queries | Query events, squads, competitors |
| `ssiLogin()` | Web session login (cookies) | Required for all form POSTs |
| `ssiGetEventStaff()` | Scrape `/event/{ct}/{id}/staff/` | Read current event staff and their roles |
| `ssiFetchPage()` | Fetch any authenticated SSI page | Scrape admin forms for new operations |

### 7.3 SSI Operations Required

| Operation | SSI Interface | Status | Implementation |
|-----------|--------------|--------|----------------|
| Get event details | GraphQL `event()` query | ✅ Existing | Reuse `ssiGraphQL()` |
| Get squad members + counts | GraphQL `event()` → `squads` → `competitors` | ✅ Existing | Reuse `ssiGraphQL()` |
| Get event staff + roles | Web scraping `/event/{ct}/{id}/staff/` | ✅ Existing | Reuse `ssiGetEventStaff()` |
| Add participant to event | Web form `/event/{ct}/{id}/participant-search-and-add/` | ✅ Documented | See `ssi-admin-operations.md` |
| Move participant between squads | Web form `/event/participant/93/{id}/edit/` | ✅ Documented | POST with `squad` field |
| Assign SSI role to staff member | Web form (staff page) | ❓ Needs investigation | Scrape staff edit form |
| Verify admin eligibility | Config allowlist (email match) | ✅ Decided (Q1) | Compare login email against `adminAllowlist` |
| Get current user email | GraphQL `me` query | ✅ Existing | Reuse `Get-SSIMe` / `ssiGraphQL()` |

### 7.4 Admin Eligibility (Q1 Decision)

Admin status is determined by the **config file allowlist**, not SSI roles:

```
1. User logs in → system gets their SSI email via `me` GraphQL query
2. Check email against `adminAllowlist` in training-staffing-configuration.yml
3. If match → user can sign up as staff (Squad 5 visible + enabled)
4. If no match → Squad 5 visible but disabled with "admin only" label (Q2)
```

This approach is simpler and more reliable than parsing SSI group membership, which would require additional web scraping of SSI's group management pages.

### 7.5 SSI Content Types (reference)

| Entity | Content Type | Used For |
|--------|-------------|----------|
| Cup (NordicSerie) | 136 | Training event container |
| Match (NordicMatch) | 91 | Individual training session |
| Participant | 93 | Competitor/staff member edit |
| Squad | 92 | Squad management |

### 7.6 SSI Investigation Still Needed

These items require hands-on SSI form scraping during implementation:

1. **Staff role assignment form** — Scrape `/event/{ct}/{id}/staff/` to find the form for assigning "Match director" / "Quarter master" roles to individual staff members. The `ssiGetEventStaff()` function already reads this page; we need to find the edit/assignment form.
2. **Squad move for SRA events** — Verify that `/event/participant/93/{id}/edit/` works for SRA training events the same way as Kupittaa Cup events. The form fields and squad IDs may differ.
3. **Automated scheduling** — Determine how to trigger finalization 24h before event. Options: Node.js `setTimeout`/`setInterval`, external cron (Render cron job), or a lightweight scheduler library.

---

## 8. Data Persistence

### 8.1 Phase 1: In-Memory + JSON File

For initial implementation, staffing state is held in memory and periodically persisted to a JSON file (similar to how the current scoring-proxy holds session state).

```
scoring-proxy/
  data/
    staffing-events.json    # persisted staffing state
```

### 8.2 Phase 2: Database (Future)

When statistics tracking becomes important, migrate to a lightweight database (SQLite or Render Postgres).

---

## 9. File Structure (New Files)

```
config/
  training-staffing-configuration.yml # Staffing configuration

scoring-proxy/
  routes/
    staffing.js                     # API route handler
  lib/
    staffing/
      engine.js                     # Core business logic
      squad-optimizer.js            # Squad count algorithm
      role-assigner.js              # Role assignment logic
      notifier.js                   # Notification dispatch
      config-loader.js              # YAML config loader + validation

scoring-ui/
  src/
    staffing-api.js                 # API client for staffing endpoints
    components/
      StaffingPage.jsx              # Main staffing page
      StaffSignupPanel.jsx          # Signup form
      StaffStatusBoard.jsx          # Status board
      RoleAssignmentPanel.jsx       # Admin role management
      SquadOptimizationView.jsx     # Squad visualization
```

---

## 10. Design Decisions (Review #1)

| # | Question | Decision | Impact on Design |
|---|----------|----------|------------------|
| Q1 | Admin eligibility | **Config file allowlist** — `adminAllowlist` in YAML | Added `adminAllowlist` to config; auth checks email against list |
| Q2 | Squad 5 visibility | **Visible with "admin only" label** | UI shows Squad 5 to all users, disabled for non-admins |
| Q3 | Overflow staff handling | **Auto-move AND notify** | Overflow auto-moved to shooter squads + email notification |
| Q4 | Role preference | **Binding** — guaranteed if available | Volunteer preference is first-come-first-served guarantee |
| Q5 | Finalization trigger | **Fully automated** — triggers on registration close | Need scheduled job or timer infrastructure |
| Q6 | Newbie vs Oldies rules | **Same rules for now** | Single config section, both types share same thresholds |
| Q7 | Dual roles | **No** — one person cannot hold both | Role assigner excludes already-assigned staff |
| Q8 | SSI integration timing | **SSI from day 1** — investigate groups/admin handling | All phases include SSI integration; no standalone mode |

## 11. Design Decisions (Review #2)

| # | Question | Decision | Impact on Design |
|---|----------|----------|------------------|
| R1 | Automated finalization scheduling | **Render Cron Job** — separate cron service on Render | Add cron job to `render.yaml`; cron calls staffing finalization API endpoint |
| R2 | Staffing UI placement | **Same app** — add `#/staffing` route to scoring-ui | No new build/deploy; shared auth, i18n, and component library |
| R3 | Finding SRA training events | **Search SSI Matches by name** — "oldies", "newbie" as search strings | Query `events(search: "oldies")` and `events(search: "newbie")` via GraphQL |
| R4 | Email integration | **Reuse existing Resend module** | Add staffing templates to `scoring-proxy/lib/email.js` |
| R5 | SSI event structure | **Cup/League → Match → Squad** | SRA trainings are organized as a Cup/League containing Matches with Squads (1-4 for shooters, 5 for staff) |

---

## 12. Automated Finalization (R1: Render Cron Job)

A Render Cron Job runs periodically and calls the staffing finalization API. This survives server restarts and requires no in-memory state.

### 12.1 Render Cron Job Configuration

Add to `render.yaml`:

```yaml
  - type: cron
    name: sra-staffing-cron
    runtime: node
    plan: starter
    schedule: "0 * * * *"  # every hour
    repo: https://github.com/tohewi/tapahtumakalenteri-ssi-integrator
    branch: main
    buildCommand: cd scoring-proxy && npm ci
    startCommand: node lib/staffing/cron.js
    envVars:
      - key: STAFFING_API_URL
        value: https://ssi-scoring.onrender.com
      - key: STAFFING_CRON_SECRET
        fromSecret: STAFFING_CRON_SECRET
```

### 12.2 Cron Script (`scoring-proxy/lib/staffing/cron.js`)

```
1. Fetch all training events with status "open"
2. For each event where registrationClose <= now:
   a. Call POST /api/staffing/events/:eventId/finalize
3. Log results
```

The `/finalize` endpoint is idempotent — calling it multiple times on an already-finalized event is a no-op.

### 12.3 Security

The cron job authenticates via a shared secret (`STAFFING_CRON_SECRET`) passed as a header. The `/finalize` endpoint checks this secret before processing.

---

## 13. SSI Event Discovery (R3: Search by Name)

### 13.1 Search Configuration

```yaml
# In config/training-staffing-configuration.yml
eventDiscovery:
  searchStrings:
    - "oldies"
    - "newbie"
  contentType: 91          # Match (NordicMatch)
  cupContentType: 136      # Cup/League (NordicSerie)
```

### 13.2 Discovery Flow

```
1. Query SSI: events(search: "oldies") + events(search: "newbie")
2. Filter results to upcoming events (starts > now)
3. For each match, get squad details via GraphQL
4. Identify Squad 5 (staff squad) by name or position
5. Count shooters in Squads 1-4
6. Present events in StaffingPage with current signup status
```

### 13.3 SSI Event Hierarchy (R5)

```
SRA Training Cup/League (CT=136)
  ├── Match: "Oldies 15.03.2026" (CT=91)
  │   ├── Squad 1 (shooters)
  │   ├── Squad 2 (shooters)
  │   ├── Squad 3 (shooters)
  │   ├── Squad 4 (shooters)
  │   └── Squad 5 (staff / vetäjät)
  │
  └── Match: "Newbie 22.03.2026" (CT=91)
      ├── Squad 1 (shooters)
      ├── ...
      └── Squad 5 (staff / vetäjät)
```

The staffing system operates at the **Match level** — each Match has its own staff signup queue, squad optimization, and role assignments.

---

## 14. Implementation Phases

All phases include SSI integration from day 1 (Q8).

### Phase 1: Core Staffing + SSI Integration (MVP)

**Backend (`scoring-proxy`):**
- Configuration loader (`lib/staffing/config-loader.js`) — YAML with `adminAllowlist`
- SSI event discovery — search matches by "oldies"/"newbie" (reuse `ssiGraphQL()`)
- Admin eligibility check — email vs `adminAllowlist` (reuse `me` query)
- Staff signup/cancel API (`routes/staffing.js`)
- Squad optimizer (`lib/staffing/squad-optimizer.js`)
- Staff allocation engine (`lib/staffing/engine.js`) — FIFO queue
- Role assignment (`lib/staffing/role-assigner.js`) — volunteer-first, binding, no dual roles
- SSI squad movement for overflow staff (reuse participant edit form)
- Email notifications — staffing templates in existing `lib/email.js` (reuse Resend)
- In-memory + JSON file persistence
- Render Cron Job for automated finalization

**Frontend (`scoring-ui`):**
- `#/staffing` route in `main.jsx`
- StaffingPage, StaffSignupPanel, StaffStatusBoard components
- `staffing-api.js` — API client
- i18n strings (fi/en) added to existing `i18n.js`
- Feature card on HomePage

**Config:**
- `config/training-staffing-configuration.yml`
- Cron job entry in `render.yaml`

### Phase 2: SSI Roles & Admin Tools

- SSI role assignment (Match director, Quarter master) — form investigation + implementation
- Queue promotion on cancellation with notifications
- Admin role override UI (RoleAssignmentPanel)
- SquadOptimizationView (visual squad/staff display)

### Phase 3: Statistics & Polish

- Staff service history tracking (database persistence)
- Statistics dashboard (times served, roles held, cancellation rate)
- Render Postgres migration
- Statistics-based features (priority queue, preferred roles)

---

*All design decisions from Review #1 (Q1-Q8) and Review #2 (R1-R5) are incorporated. This document is ready for final sign-off before detailed implementation begins.*
