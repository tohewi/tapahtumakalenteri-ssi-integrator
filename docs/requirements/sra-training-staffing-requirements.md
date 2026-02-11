# SRA Training Staffing Requirements

**Last updated**: 2026-02-11
**Status**: Implementation in progress (PR: `feature/sra-match-staffing`)
**Design**: [sra-staffing-design.md](../design/sra-staffing-design.md)

---

## 1. Background

All Matches are managed in SSI (Shoot and Score It) — squads, enrollment, shooters, and scoring. All Matches are advertised in Tapahtumakalenteri (Event Calendar).

There are two primary types of SRA trainings at Temppelivuori range:
- **Oldies** (SRAO) — experienced shooter training, max 6 trainers
- **Newbie** (SRAN) — new shooter training, max 8 trainers

All SRA trainings have the following squad structure:
- Squads 1–4 for shooters
- **Squad 5** for staff ('vetäjät') — called "Trainer Squad" in SSI

---

## 2. Requirements and Implementation Status

### Legend
- ✅ **Implemented** — working in current build
- 🔧 **Partial** — core functionality works, details pending
- 📋 **Planned** — designed but not yet implemented

---

### 2.1 Authentication and Authorization

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| A1 | Staffing section has its own login, separate from other features | ✅ | `scope: 'staffing'` in session, `/#staffing` route |
| A2 | Login uses SSI credentials (email + password + API key) | ✅ | Reuses existing `ssiLogin()` |
| A3 | Only instructors on the allowlist can access staffing | ✅ | `adminAllowlist` in `sra-training-config.yml`, checked server-side on login |
| A4 | SSI web cookies stored in session for web scraping operations | ✅ | `session.ssiCookies` set at login, used for all SSI form POSTs |

### 2.2 Event Discovery

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| E1 | Find SRA training matches from SSI by name search | ✅ | Searches for `"TEST TR-"` via GraphQL `events(search:)` |
| E2 | Determine training type (oldies/newbie) from match name | ✅ | Pattern matching: `srao` → oldies, `sran` → newbie |
| E3 | Only show future events | ✅ | Filters by `starts > now` |
| E4 | Display shooter count (excluding staff squad) | ✅ | Counts approved competitors in Squads 1–4 |
| E5 | SSI content type for SRA/IPSC matches is **22** (not 91) | ✅ | Discovered during implementation; `matchContentType: 22` in config |

### 2.3 Staff Registration (Signup)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| S1 | Three direct roles: vastuuvetäjä, kalustovastaava, vetäjä | ✅ | `leadInstructor`, `equipmentManager`, `staff` |
| S2 | One role per person per event (mutually exclusive) | ✅ | Engine checks existing role before signup |
| S3 | Registration blocked when max trainers reached | ✅ | `totalTrainers(event) >= event.maxTrainers` |
| S4 | Vastuuvetäjä and kalustovastaava are single-slot roles | ✅ | Engine rejects if slot already taken |
| S5 | Staff member can resign from their role | ✅ | `DELETE /api/staffing/events/:eventId/signup` |

### 2.4 SSI Integration — Trainer Squad

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| T1 | On signup, register user to SSI Trainer Squad (Squad 5) | ✅ | `ssiRegisterToTrainerSquad()` — web scraping |
| T2 | Search participant by email, follow register link | ✅ | POST to `/event/22/{id}/participant-search-and-add/` |
| T3 | Set squad to "Squad 5" and status to Approved on confirmation form | ✅ | Selects squad option by name match, status=`a` |
| T4 | 5-second delay before confirmation (SSI anti-bot protection) | ✅ | Hardcoded wait |

### 2.5 SSI Integration — Management Group

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| M1 | On signup, add user to match management group | ✅ | `ssiAddToMatchManagement()` — web scraping |
| M2 | All staff added as **admin** (role=1) in management group | ✅ | SSI role value `1` |
| M3 | Vastuuvetäjä gets event official: **Match Director** (MD) | ✅ | POST with `officials=MD` |
| M4 | Kalustovastaava gets event official: **Quarter Master** (QM) | ✅ | POST with `officials=QM` |
| M5 | On resign, remove user from management group | ✅ | `ssiRemoveFromMatchManagement()` — uses participant-search-and-add to resolve user ID, then GET remove-invitation-role |
| M6 | Management group ID extracted from staff page | ✅ | `ssiGetMatchGroupId()` scrapes `/event/22/{id}/staff/` for `/groups/{groupId}/` links |

### 2.6 SSI Sync on Page Load

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| L1 | On event load, read existing staff from SSI (Squad 5 + management group) | ✅ | GraphQL for Squad 5 members (with email), scrape staff page for officials |
| L2 | GraphQL squad query includes `shooter { email first_name last_name }` | ✅ | Gives email for each Squad 5 member |
| L3 | Scrape staff page to get member names + event official roles | ✅ | `ssiGetMatchOfficials()` parses 6-column HTML table |
| L4 | Cross-reference squad members (email) with staff page (name) to determine roles | ✅ | MD → leadInstructor, QM → equipmentManager, else → staff |
| L5 | Populate engine state from SSI data via `syncStaffFromSSI()` | ✅ | Fills roles only for members not already in engine state |

### 2.7 Match Creation (Test Matches)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| C1 | Test matches use `group="xxx"` (self-managed), not hardcoded group 25874 | ✅ | `New-SRATestMatches.ps1` updated |
| C2 | Match naming convention: `TEST TR-SRAO dd.MM.yyyy` / `TEST TR-SRAN dd.MM.yyyy` | ✅ | Script generates 4 matches (2 SRAO, 2 SRAN) |
| C3 | SRA match creation form URL: `/sra/create-match/` | ✅ | Using GraphQL `create_event` mutation |

### 2.8 Frontend UI

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| U1 | Staffing page at `/#staffing` with login screen | ✅ | `StaffingPage.jsx` with `LoginScreen` component |
| U2 | Event cards showing: name, date, shooter count | ✅ | EventCard component |
| U3 | Display vastuuvetäjä and kalustovastaava with register/resign buttons | ✅ | RoleRow component |
| U4 | Display vetäjät list with count/max and register button | ✅ | Staff list in EventCard |
| U5 | User's own role highlighted with "(sinä)" label | ✅ | Email comparison |
| U6 | Resign button with confirmation dialog | ✅ | `confirm()` before resign |
| U7 | Session expiry handling with re-login prompt | ✅ | `handleSessionExpired` callback |
| U8 | Finnish language UI | ✅ | i18n strings in `i18n.js` |
| U9 | Logout button | ✅ | Clears session, returns to login screen |

### 2.9 Data Persistence

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| D1 | In-memory state with JSON file persistence | ✅ | `data/staffing-events.json` |
| D2 | State survives server restart | ✅ | Loaded on module init |
| D3 | SSI is authoritative — state re-synced from SSI on each page load | ✅ | `syncStaffFromSSI()` on GET /events |

---

## 3. Planned / Not Yet Implemented

### 3.1 Squad Optimization (Phase 1 remaining)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| P1 | Determine active squad count from shooter enrollment | 📋 | `squad-optimizer.js` designed, not yet implemented |
| P2 | Staff positions = active squad count | 📋 | Currently uses fixed `maxTrainers` from config |
| P3 | Overflow staff auto-moved to shooter squads | 📋 | Requires squad optimizer + participant squad move |

### 3.2 Registration Timeline

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| P4 | Registration closes 24h before event | 📋 | Config exists (`closesBeforeEventHours: 24`), not enforced yet |
| P5 | Automated finalization on registration close | 📋 | Render Cron Job designed, not yet implemented |

### 3.3 Queue and Overflow

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| P6 | FIFO queue for staff signups | 🔧 | `signupTime` stored but no queue overflow logic yet |
| P7 | Queue promotion when a confirmed staff cancels | 📋 | Designed in engine, not yet implemented |
| P8 | Excess staff moved to shooter squads on finalization | 📋 | Requires squad optimizer |

### 3.4 Notifications

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| P9 | Email notifications for staff confirmed / moved / role assigned | 📋 | Templates in config, `notifier.js` not yet implemented |
| P10 | Missing role warning to admins | 📋 | Template exists in config |

### 3.5 Admin Tools (Phase 2)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| P11 | Admin role override UI | 📋 | `RoleAssignmentPanel.jsx` designed |
| P12 | Squad optimization visualization | 📋 | `SquadOptimizationView.jsx` designed |

### 3.6 Statistics (Phase 3)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| P13 | Staff service history tracking | 📋 | Database persistence needed |
| P14 | Statistics dashboard | 📋 | Times served, roles held, cancellation rate |

---

## 4. Key Technical Decisions

### 4.1 SSI Content Types (Discovered During Implementation)

| Entity | Content Type | URL Pattern |
|--------|-------------|-------------|
| **SRA/IPSC Match** | **22** | `/event/22/{eventId}/...` |
| **SRA/IPSC Participant** | **23** | `/event/participant/23/{participantId}/edit/` |
| Participant Search | 22 | `/event/22/{eventId}/participant-search-and-add/` |
| Cup (NordicSerie) | 136 | Not used for SRA staffing |
| Cup Participant | 137 | Not used for SRA staffing |
| Nordic Match | 91 | Not used for SRA — this is RESUL/Nordic |
| Nordic Match Participant | 93 | Not used for SRA — this is RESUL/Nordic |

> **Important**: The design document originally specified content type 91 (NordicMatch) with participant content type 93. SRA/IPSC matches use event content type **22** and participant content type **23**. This was corrected during implementation to fix the "Participant edit page HTTP 404" error when removing instructors from Squad 5.

### 4.2 SSI Management Group

- Each SSI match has an associated **management group** (linked from the staff page)
- Group ID is extracted from `/event/22/{eventId}/staff/` page links (pattern: `/groups/{groupId}/`)
- Users are added/removed via `/groups/{groupId}/add-user-with-role/{userId}/` and `/groups/{groupId}/remove-invitation-role/{userId}/`
- **Role values**: `1` = admin, `2` = staff, `7` = assistant
- **Official codes**: `MD` = Match Director, `QM` = Quarter Master
- For removal, user ID is resolved via `/event/22/{eventId}/participant-search-and-add/` (email search), because the `/groups/{groupId}/role/search/` endpoint doesn't return add/invite links for users already in the group

### 4.3 User Identification

- **Email** is the primary identifier for all operations (not SSI user ID or name)
- Email is used for: login, allowlist check, squad registration, management group operations
- Names are display-only, obtained from GraphQL `shooter { first_name last_name }`
- Cross-referencing between SSI data sources (GraphQL squad data ↔ staff page HTML) is done by name matching

### 4.4 Session and Authentication

- Staffing uses its own session scope (`staffing`), separate from `scoring`, `manage`, `reporting`
- SSI web cookies (`session.ssiCookies`) stored at login, used for all web scraping
- User's own cookies used (not admin cookies) — actions performed on behalf of the logged-in user
- Session TTL configurable (currently 1 min for debug)

### 4.5 Non-Blocking SSI Operations

- SSI web scraping (trainer squad registration, management group add/remove) runs **non-blocking** after the internal engine operation succeeds
- The staffing signup/resign API responds immediately; SSI operations complete asynchronously
- Failures in SSI operations are logged but don't fail the user-facing operation

---

## 5. File Structure (Implemented)

```
config/
  sra-training-config.yml              # ✅ Staffing config (allowlist, event discovery, roles, etc.)

scoring-proxy/
  routes/
    staffing.js                        # ✅ API routes (events, signup, resign)
    auth.js                            # ✅ Login with 'staffing' scope + allowlist gate
  lib/
    staffing/
      engine.js                        # ✅ Core logic (upsert, signup, resign, syncStaffFromSSI)
      config-loader.js                 # ✅ YAML loader + isAdminEmail()
      squad-optimizer.js               # 📋 Planned
      role-assigner.js                 # 📋 Planned
      notifier.js                      # 📋 Planned
    ssi-core/
      client.js                        # ✅ SSI web scraping functions
  data/
    staffing-events.json               # ✅ Persisted engine state

scoring-ui/
  src/
    components/
      StaffingPage.jsx                 # ✅ Main page (login, event cards, role rows)
    staffing-api.js                    # ✅ API client (fetchEvents, signup, resign)
    i18n.js                            # ✅ Finnish strings for staffing

scripts-graphql/
  New-SRATestMatches.ps1               # ✅ Creates test SRA matches (self-managed)
```

---

## 6. SSI Web Scraping Functions (Implemented)

| Function | Location | Purpose |
|----------|----------|---------|
| `ssiRegisterToTrainerSquad()` | `ssi-core/client.js` | Search by email → register → set Squad 5 + Approved |
| `ssiGetMatchGroupId()` | `ssi-core/client.js` | Scrape staff page → extract management group ID |
| `ssiGetMatchOfficials()` | `ssi-core/client.js` | Scrape staff page → extract member names + officials (MD/QM) |
| `ssiAddToMatchManagement()` | `ssi-core/client.js` | Search by email → add to group with role + officials |
| `ssiRemoveFromMatchManagement()` | `ssi-core/client.js` | Search by email → resolve user ID → remove from group |

---

## 7. API Endpoints (Implemented)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Login with `scope: 'staffing'` (checks allowlist) |
| `GET` | `/api/staffing/events` | staffing | List events with staff status (syncs from SSI) |
| `POST` | `/api/staffing/events/:id/signup` | staffing | Register for role (`leadInstructor`, `equipmentManager`, `staff`) |
| `DELETE` | `/api/staffing/events/:id/signup` | staffing | Resign from role |

---

## 8. Original Clarification Questions — Resolution Status

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Admin eligibility | ✅ Config file allowlist (`adminAllowlist` in YAML) |
| Q2 | Squad 5 visibility for non-admins | ✅ Staffing page requires login + allowlist — non-admins can't access |
| Q3 | Overflow staff handling | 📋 Auto-move + notify designed, not implemented |
| Q4 | Role preference binding | 🔧 Direct role selection implemented (no preference/queue model) |
| Q5 | Finalization trigger | 📋 Render Cron Job designed, not implemented |
| Q6 | Newbie vs Oldies rules | ✅ Same rules, different `maxTrainers` (oldies: 6, newbie: 8) |
| Q7 | Dual roles | ✅ Not allowed — one role per person per event |
| Q8 | SSI integration timing | ✅ SSI from day 1 — full web scraping integration |
| Q9 | Integration with existing system | ✅ Same app, `#/staffing` route, shared auth/i18n |
| Q10 | Registration timeline | 📋 24h close + finalization designed, not enforced |

---

## 9. Known Limitations

1. **Name-based cross-referencing**: SSI sync matches squad members to management group members by name (case-insensitive). This works reliably for our small instructor group but is not robust for large-scale use.
2. **No queue/overflow logic yet**: Current implementation allows direct role selection up to `maxTrainers`. The designed FIFO queue with overflow-to-shooter-squad is not yet implemented.
3. **No email notifications**: Templates exist in config but the notification module is not implemented.
4. **Session TTL**: Currently set to 1 minute for debug. Must be increased for production use.
5. **SSI operations are non-blocking**: If SSI web scraping fails (network, session expiry), the internal engine state will be correct but SSI won't reflect the change. Re-syncing on next page load will correct discrepancies.
