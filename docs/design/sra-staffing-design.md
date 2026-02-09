# SRA Training Staff Management — Design Document

**Version**: 0.1.0 (Draft — Review #1)
**Date**: 2026-02-09
**Status**: Design — awaiting review
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
| **config** | `config/sra-training-config.yml` | Organization, roles, thresholds |

---

## 3. Data Model

### 3.1 Configuration Data (YAML)

```yaml
# config/sra-training-config.yml

organization:
  name: "Temppelivuori SRA"
  range: "Temppelivuori"
  timezone: "Europe/Helsinki"

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
  excessStaffAction: "move_to_shooter_squad"  # or "remove", "waitlist"
  roleAssignmentMode: "volunteer_then_random"  # or "volunteer_only", "random"
  allowDualRoles: false  # can one person hold both special roles?

notifications:
  channels: ["email"]  # future: ["email", "in_app"]
  templates:
    staffConfirmed:
      fi: "Olet vahvistettu vetäjäksi tapahtumaan {eventName}. Roolisi: {role}."
      en: "You are confirmed as staff for {eventName}. Your role: {role}."
    staffNotSelected:
      fi: "Valitettavasti et mahtunut vetäjäksi tapahtumaan {eventName}. Sinut on siirretty ampujaksi squadiin {squad}."
      en: "Unfortunately you were not selected as staff for {eventName}. You have been moved to shooter squad {squad}."
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

### 4.2 Staff Allocation (on registration close)

```
1. Determine activeSquadCount from shooterCount
2. staffPositions = activeSquadCount
3. Sort staffSignups by signupTime (FIFO)
4. First `staffPositions` signups → status = "confirmed"
5. Remaining signups → status = "overflow"
6. For overflow staff:
   - If excessStaffAction == "move_to_shooter_squad":
       Assign to shooter squads (round-robin or least-full)
   - If excessStaffAction == "waitlist":
       Keep on waitlist
7. Assign special roles (see 4.3)
8. Send notifications
```

### 4.3 Role Assignment

```
Mode: "volunteer_then_random" (configurable)

1. For each required role (leadInstructor, equipmentManager):
   a. Find confirmed staff with rolePreference matching this role
   b. If exactly one volunteer → assign
   c. If multiple volunteers → assign first by signupTime
   d. If no volunteer → randomly assign from confirmed staff without a role
2. If allowDualRoles == false:
   - A person assigned to one role is excluded from random assignment for other roles
3. If a required role cannot be filled (no confirmed staff left):
   - Send "missingRole" notification to admin
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

## 7. SSI Integration

### 7.1 Role Mapping

| Staffing Role | SSI Role | Notes |
|---------------|----------|-------|
| Lead Instructor (vastuuvetäjä) | Match director | Existing SSI role — needs verification |
| Equipment Manager (kalustovastaava) | Quarter master | Existing SSI role — needs verification |
| Staff (vetäjä) | (regular member in Squad 5) | No special SSI role |

### 7.2 SSI Operations Required

| Operation | SSI Interface | Existing Support |
|-----------|--------------|------------------|
| Get event details | GraphQL | Yes (existing queries) |
| Get squad members | GraphQL | Yes (existing queries) |
| Get shooter count per squad | GraphQL | Yes |
| Move competitor between squads | Web Forms | Needs implementation |
| Assign role to competitor | Web Forms | Needs investigation |
| Get user admin status | GraphQL | Needs investigation |

### 7.3 Open Questions for SSI

1. **Can we programmatically assign "Match director" / "Quarter master" roles?** — Need to check SSI admin forms
2. **How to verify admin status?** — Check if SSI has a permissions/role API, or if we maintain our own admin list in config
3. **Can we move a competitor from Squad 5 to Squad 1-4 via API?** — Need to check squad management forms

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
  sra-training-config.yml           # Staffing configuration

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

## 10. Open Design Questions

These questions should be resolved before detailed design:

| # | Question | Options | Impact |
|---|----------|---------|--------|
| Q1 | How to determine admin eligibility for staff signup? | a) SSI role/permissions b) Config file allowlist c) Both | Auth flow, config schema | Config file allowlist is the default.
| Q2 | Should Squad 5 be visible to non-admin users? | a) Hidden b) Visible but disabled c) Visible with "admin only" label | UI design |visible with admin only label is the default.
| Q3 | Should overflow staff auto-confirm or require acceptance when moved to shooter squads? | a) Auto-move b) Notify and require confirmation | Notification flow | auto-mode and notify.
| Q4 | Should role preference be binding or advisory? | a) Binding (guaranteed if available) b) Advisory (considered but not guaranteed) | Role assignment algorithm |binding.
| Q5 | How should the 24h pre-event window work? | a) Fully automated b) Admin triggers finalization c) Scheduled job | Infrastructure needs |Target is fully automated.
| Q6 | Should Newbie trainings have different staffing rules than Oldies? | a) Same rules b) Different config per type | Config schema |same for now.
| Q7 | Can the same person hold both special roles? | a) Yes b) No (default in config) | Role assignment logic |no.
| Q8 | Do we need SSI integration in Phase 1 or can we start standalone? | a) SSI from day 1 b) Standalone first, SSI later | Implementation scope |ssi from day one as we need to look into ssi groups etc. how to handle admin roles.

---

## 11. Implementation Phases

### Phase 1: Core Staffing (MVP)

- Configuration loader (YAML)
- Staff signup/cancel API
- Squad optimizer algorithm
- Staff allocation engine (FIFO queue)
- Basic role assignment
- Staffing status API
- Frontend: StaffingPage, StaffSignupPanel, StaffStatusBoard
- i18n strings (fi/en)
- In-memory persistence

### Phase 2: Notifications & SSI Integration

- Email notifications via existing Resend integration
- SSI role assignment (Match director, Quarter master)
- SSI squad movement (overflow → shooter squads)
- Admin eligibility check via SSI

### Phase 3: Statistics & Polish

- Staff service history tracking
- Statistics dashboard
- Database persistence
- Queue promotion notifications
- Admin role override UI

---

*This is Review #1 draft. Please review the overall architecture, data model, configuration schema, and module boundaries. Key areas for feedback: open questions (Section 10), algorithm correctness (Section 4), and SSI integration approach (Section 7).*
