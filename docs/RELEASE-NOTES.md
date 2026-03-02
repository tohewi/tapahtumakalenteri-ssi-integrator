# Release Notes

> **Version numbering**: Release numbers align with `requirements.md` release definitions.
> Git tags may differ for historical reasons (see version mapping at the bottom).

---

## Release 8.2 — Template-Driven Event Creation (2026-03-02)

**Requirements:** MP5 (Event Execution Workflow) — bug fixes and refactoring

### Overview

Fixed Kupittaa Cup template creation to correctly produce cups with the right name, divisions, and categories. SSI's GraphQL API silently ignores multi-value form fields (weapon_groups, categories, competence_classes), so both cup and match creation were migrated to web form POST. Template overrides are now the source of truth for multi-value fields.

### Bug Fixes

- **Cup name now includes "CUP"**: Template `nameTemplate` updated to `"TEST TurRes Kupittaa CUP {date}"`.
- **Divisions and categories match template**: Previously all options were selected ("select all" fallback); now `overrides.formFields` specifies exact values (e.g., STD + Open).
- **Match names strip "CUP"**: Component match names no longer include "CUP" from the cup name. SSI's 40-character name limit is enforced with truncation.
- **Match creation via web POST**: Matches switched from GraphQL to web form POST (same as cup) so multi-value fields are applied correctly.

### New Features

- **Template `formFields` / `matchFormFields` overrides**: Multi-value fields (weapon_groups, categories, competence_classes) can be configured per template via `overrides.formFields` (simple arrays).
- **Seed import form field capture**: `ssiFetchEventStructure` attempts to capture form-level fields from SSI event edit pages via web scraping (probes multiple URL patterns).
- **`applyTemplateFormFields` merging**: Builder merges fields from: (1) `overrides.formFields` (priority), (2) `snapshot.formFields` (seed capture), (3) SSI form page defaults.

### Technical Changes

- `nordic-cup-graphql-builder.js`: Replaced `fetchFormDefaults` (select-all) with `fetchFormPage` + `applyTemplateFormFields`. Both cup and matches use web form POST.
- `seed-import.js`: Added `captureEventFormFields()` — probes SSI edit page URL patterns to capture checked/selected values for multi-value form fields.
- `event-creation-service.js`: Exported `postForm`, `extractEventIds`, `extractFormErrors`, `extractPageTitle` for builder reuse.

### Test Harness

- `test-cup-no-cleanup.mjs`: End-to-end cup creation test (schedule → execute → verify).
- `cleanup-event.mjs`: Delete platform events after testing.
- `check-squads.mjs`, `check-cup-snapshot.mjs`: Diagnostic utilities.

---

## Release 7.5 — Architecture V2 Foundation (2026-02-23)

**Requirements:** ARCH1 ✅, ARCH2 ✅, ARCH5 ✅, ARCH3–ARCH4 📋

### Overview

Architecture V2 foundation release. Standardizes API versioning, centralizes error handling across all routes, enforces logging discipline, and documents architecture patterns and guidelines for positive evolution.

### New Features

- **Versioned API structure enabled:** Feature routers are mounted under `/api/v1/*` as the primary path.
- **Legacy alias compatibility:** Temporary `/api/*` aliases remain available and now return deprecation guidance headers for migration.
- **Scoring router wiring fixed:** Scoring routes are mounted in the server routing graph (previously imported but not mounted).
- **Frontend registration client aligned:** Registration client now calls versioned `/api/v1/register/*` endpoints.
- **Architecture guidelines documented:** AGENTS.md and copilot-instructions.md now include comprehensive architecture integrity guidelines: module boundaries, error handling patterns, logging discipline, router factory pattern, test requirements, and merge conflict prevention.

### Bug Fixes

- **Centralized error flow adoption:** All 7 remaining `res.status(500).json()` calls in `registration.js` (3), `management.js` (3), and `auth-v7.js` (1) replaced with `next(internalError(...))` flowing through centralized error middleware.
- **Logging discipline enforced:** All 50 `console.error/warn/log` calls across route files (`management.js`, `staffing.js`, `registration.js`, `reports.js`, `auth-v7.js`) replaced with `log.error/warn/debug` to respect `LOG_LEVEL` control.
- **Router factory safety:** Route modules were refactored to stateless router factory pattern to prevent accidental handler duplication from shared router instances.
- **Test alignment updates:** API client and backend tests were updated for versioned paths and middleware-driven error responses.

### Documentation Updates

- **architecture-review.md:** Updated with current line counts, test counts (413 total), accurate coupling diagram, migration status, and refactoring roadmap reflecting completed v7.4 work.
- **AGENTS.md / copilot-instructions.md:** Repository structure updated to reflect all route files, middleware, lib subdirectories, services, ssi-core domain modules, session management, and error classes. Key Files table updated with current file paths. Added sections: Error Handling, Logging Discipline, Router Factory Pattern, Test Requirements, Merge Conflict Prevention.
- **requirements.md:** ARCH5 marked as implemented; summary counts updated.

### Requirements Met

- **ARCH1:** Centralized error handling pattern consistently adopted across all route modules — zero `res.status(500).json()` calls remain in routes.
- **ARCH2:** `/api/v1` is now the canonical API base path, with backward-compatible `/api` aliases and deprecation headers.
- **ARCH5:** Architecture documentation updated with modular monolith patterns, module boundaries, migration progress, and explicit import rules/anti-patterns in AGENTS.md and copilot-instructions.md.

### Test Status

| Suite | Passing | Notes |
|-------|--------:|-------|
| Backend (scoring-proxy) | 223 | Full suite green after error-flow and logging hardening |
| Frontend (scoring-ui) | 190 | Full suite green with versioned registration API paths |

---

## Release 7.4.1 — Authentication UX Hardening (2026-02-22)

**Requirements:** AUTH-UX1–AUTH-UX5 ✅

### Overview

Patch release focused on authentication experience and architecture consistency. Reload now restores protected feature state behind a neutral restoring gate instead of visibly flashing the login screen.

### New Features

- **Auth Bootstrap + Auth Gate (default pattern):** Protected feature entry now starts in a temporary `restoring` state, checks `/api/auth/status`, and then restores previous feature state or routes to login.
- **Documentation baseline updated:** `session-handling.md` now defines this as the default startup pattern for all protected domains (`scoring`, `manage`, `reporting`).
- **Architecture cross-reference added:** `scoring-architecture.md` links to the canonical session-handling implementation section.
- **UAT guide added:** New short authentication UAT plan with practical use cases for login, reload, expiry, scope mismatch, and restoration.

### Bug Fixes

- **Login flash on reload removed (mobile + tablet scoring):** Apps no longer initialize directly to login during bootstrap when a valid session exists.
- **Fallback behavior clarified:** If session status check fails or scope does not match, app now transitions cleanly to login after bootstrap.

### Requirements Met

- **AUTH-UX1:** Protected features use mount-time auth bootstrap (`/api/auth/status`) before deciding login vs restore.
- **AUTH-UX2:** Protected features render a neutral `restoring` gate while bootstrap is in progress.
- **AUTH-UX3:** Existing session status is restored without auto-login (`/api/auth/login` is never called on mount).
- **AUTH-UX4:** Architecture docs define the pattern as default across protected domains.
- **AUTH-UX5:** Authentication UAT plan exists in the implementation docs.

### Test Status

| Suite | Passing | Notes |
|-------|--------:|-------|
| Frontend (scoring-ui) | 190 | Full suite green after auth-gate updates |
| UAT (manual) | Completed | Reload/session/authentication scenarios reported OK |

---

## Release 8.0 — Tablet Scoring UI (2026-02-20)

**Git tag:** `v7.0.0` → HEAD | **Requirements:** TS1–TS12 ✅

### Overview

Tablet scoring UI for range officers — enter competition scores on a tablet or desktop during Kupittaa CUP events. Includes session reliability fixes that benefit all scoring modes.

### New: Tablet Scoring (`#/scoring-tablet`)

- **3-column layout**: Shooter list (left), score card (center), number pad (right) — optimized for landscape tablets
- **Score card**: 5×6 grid (5 shots × 6 series) that scales dynamically to fit the screen without scrolling
- **Number pad**: Tap zone buttons (X, 10–1, M) to add scores to the first available series
- **Double-tap delete**: Double-tap any score on the card to remove it
- **Auto-save on switch**: Scores are automatically saved to SSI when switching between shooters
- **Persistent shooter order**: Reorder shooters once (▲/▼ buttons) and the order persists across all squads and matches within the same cup
- **Read-only mode**: Completed matches (status `cp`) are displayed but cannot be edited
- **Real user name**: Fetches and displays the scorer's full name from SSI (non-blocking)
- **Breadcrumb navigation**: Cup › Match › Squad with back-navigation at each level
- **Remember me**: Encrypted credential storage with auto-login (shared with mobile scoring)

### New: Frontend Logging Utility

- **`log.js`**: localStorage-gated debug logging — silent in production, enable with `localStorage.setItem('LOG_LEVEL', 'debug')`
- All 22 debug `console.log` calls across 5 UI files converted to `log.debug`/`log.warn`
- Mirrors the backend `LOG_LEVEL` pattern for consistent debugging

### Bug Fix: SSI JWT Token Refresh

- **Root cause**: The SSI GraphQL `refresh_token` mutation requires `revoke_refresh_token: Boolean!` but we weren't providing it
- **Symptom**: Every ~14 minutes the JWT expired, refresh failed, and the system fell back to a full re-login — causing brief interruptions during scoring
- **Fix**: Added the required parameter. JWT now refreshes silently in the background
- **Impact**: All scoring sessions (mobile + tablet) now run uninterrupted for the full cup duration (typically 9:20–12:00, ~2.5 hours)

### Bug Fix: Blank Tablet Scoring Page (R80 Hotfix)

- **Root cause**: `setSelectedScoreIndex(null)` called in `TabletScoringView` but the state variable was removed during score interaction simplification — caused `ReferenceError` on mount
- **Symptom**: Blank page after login when stale localStorage restored the scoring view
- **Fix**: Removed leftover `setSelectedScoreIndex(null)` calls, added `ErrorBoundary` to `main.jsx`, fixed `LoginScreen` props in `TabletApp`, added defensive `restoreNavState`

### Hotfix: Tablet Session Stability & Score Preservation (TS10–TS12)

- **Root cause #1 (forced re-login):** auth middleware validated user SSI JWT expiry before any refresh attempt, so ~15 minute JWT rollover returned 401 during active scoring requests
- **Root cause #2 (score loss):** tablet scoring mount logic always replaced restored local `ssi_scores` with SSI baseline data, which dropped unsaved local edits after re-login/remount
- **Fix (backend):**
  - `requireAuthV7` now attempts user token refresh before rejecting expired token requests
  - `server.js` now wires `req._ssiRefreshUserToken` and `req._ssiRefreshAdminToken` hooks for all protected routes
- **Fix (frontend):** `TabletScoringView` now preserves restored local scores and only initializes from SSI when local score state is empty
- **Miss score impact:** `M` values were not a parsing/mapping bug — they were overwritten with other unsaved local edits. Preserving local state fixes this symptom too

### Regression Test Coverage Added

- **Backend:** auth middleware tests now cover
  - expired token + refresh callback succeeds (session continues)
  - expired token + refresh callback fails (401)
  - simulated ~3 hour active scoring flow with repeated refresh cycles
- **Frontend:** new tablet session persistence tests cover
  - restored local scores are not overwritten by SSI on mount
  - SSI bootstrap still works when no local scores exist
  - simulated 3-hour remount/re-login flow keeps local miss scores (`M`)

### Accessibility (WCAG 2.1 AA)

- `role="listbox"` / `role="option"` on shooter list with `aria-selected`
- `aria-label` on all interactive buttons (score pad, score card, breadcrumbs, save)
- `aria-live="polite"` region announces save status to screen readers
- Keyboard support: Enter/Space to select shooters, Tab navigation
- Visible focus indicators on breadcrumb buttons
- Accessible reorder buttons (▲/▼) replacing HTML5 drag-and-drop

### Other Improvements

- **Translation fixes**: Tulosrata → Tuloskortti, Sarake → Sarja, Score Track → Score Card
- **Touch targets**: Score card buttons meet 56px minimum (TS6 requirement)
- **`/me` endpoint**: Removed PII debug logging
- **Test fix**: Timezone-dependent `isToday` assertion now works in all timezones

### Test Status

| Suite | Passing | Notes |
|-------|--------:|-------|
| Backend (scoring-proxy) | 137 | All green |
| Frontend (scoring-ui) | 163 | All green |

---

## Release 7.2 — Kupittaa Cup Management (2026-02-18)

**Requirements:** CUP1 📋, CUP2 📋, CUP3 ✅

### New Features

- **Mark Payment Received** (CUP3): Per-competitor paid toggle at the cup level. Solid green button for paid shooters — immediately visible when scanning the list. State stored in SSI via `toggle-paid` endpoint
- **Management site enhancements**: Improved logging architecture, backend logging with `LOG_LEVEL` env var

### Specified (Not Yet Implemented)

- **CUP1**: Move shooter between squads within a match
- **CUP2**: Set shooter as DNS (Did Not Start) at cup + all matches, with undo

---

## Release 7.1 — Management Availability (2026-02-14)

**Requirements:** MGMT1 ✅

### New Features

- **Management Independent of Registration**: Kupittaa Cup Hallinta keeps cups available for management independent of registration status. Management available from registration start date until cup end date (or starts + 24h fallback). Dedicated `/api/manage/cups` endpoint

---

## Release 7.0 — Authentication & Session Handling (2026-02-12)

**Git tag:** `v7.0.0` | **Requirements:** Partial implementation of AUTH/SES/SEC requirements

### Overview

Major infrastructure overhaul replacing in-memory session handling with Redis-backed dual sessions. Includes service rename and EU infrastructure compliance.

### New Features

- **Redis-backed sessions**: `express-session` with `connect-redis` for persistent session storage surviving server restarts
- **Dual-session architecture**: User session + admin SSI delegation with impersonation security
- **Audit logging**: All SSI operations logged with user context, timestamp, and success/failure
- **Proactive admin JWT refresh**: Separate cookie TTL (4h) from JWT TTL (14min)
- **Configurable log verbosity**: `LOG_LEVEL` env var (debug/info/warn/error)
- **Service rename**: `ssi-scoring` → `turres-ssi-tools`
- **UI rename**: "Kupittaa Cup" → "SSI apurit/SSI Helpers"

### Bug Fixes

- Fix StaffingPage 'Remember me' never clearing credentials when unchecked
- Fix squad query using user session instead of admin JWT
- Fix web scraping for squad removal (GraphQL doesn't support it)
- Fix startup race condition: await `initRedis()` before `app.listen`

### Infrastructure

- Redis Key Value added to `render.yaml`
- All services deployed in EU (Frankfurt region)
- Preview environment support via GitHub Actions

---

## Release 6.0 — Match Management & UI Consolidation (2026-02-12)

**Git tag:** `v6.0.0` | **Requirements:** MG1 ✅, MG-ID1–MG-ID5 ✅

### Overview

Match management UI for Kupittaa CUP administration — consolidated squadding overview, shooter identification by email, and management operations.

### New Features

- **Match Management UI** (`#/manage`): Password-protected. Pick an active cup, see consolidated squadding overview — per-squad cross-match table, unsquadded shooters, CUP/match membership mismatches
- **Email-first identification**: Email as primary identifier for all shooter operations. Eliminates ambiguity from SSI wildcard name searches
- **Exact match enforcement**: Operations require explicit participant IDs — no silent fallback to name-based matching
- **Shooter state management**: Approve, remove, and manage pending shooters with proper CUP + match state handling

### SRA Training Staffing (Release 5.0)

- **Staffing system** (`#/staffing`): SRA Training match personnel signup/resign with SSI integration
- **Role-based signup**: Define roles per training type, manage availability
- **SSI sync**: Staffing changes synced to SSI squad assignments
- **Email notifications**: Signup/resign confirmation emails via Resend

### Other Improvements

- Development modularity guidelines and shared component process
- PR preview environments via GitHub Actions
- Remember me hook refactored for role-specific storage

---

## Release 4.0 — Registration Frontend & Scoring Application (2026-02-07)

**Git tag:** `v4.0.0` | **Requirements:** R1–R14 ✅, RSEC1–RSEC11 ✅, S1–S10 ✅, P1–P4 ✅, M1–M3 ✅, B1–B4 ✅, SEC1–SEC10 ✅

### Overview

Registration frontend and scoring application — shooters can self-register for Kupittaa CUP events via a mobile-friendly web form, and range officers score matches on phones/tablets. Both apps share a single backend deployed on Render.

### New: Registration App (`#/register`)

- **Self-service registration**: Shooters register for CUP events without admin intervention
- **Mobile-first wizard**: Captcha → Cup selection → Squad selection → Email → Submit
- **Real-time progress**: NDJSON streaming shows match-by-match registration progress
- **Re-registration**: Returning shooters can change their squad — system is fully idempotent
- **Confirmation email**: HTML email via Resend with match list, squad assignments, and instructions
- **User not found**: Links to SSI signup page when email isn't in the system

### New: Scoring App (`#/scoring`)

- **Touch-optimized scoring**: Zone-tap buttons (X, 10–1, M) for entering scores on the range
- **PWA installable**: Works offline-capable, installable on mobile devices
- **Per-user sessions**: Multi-user JWT + cookie isolation with 8h TTL
- **Remember me**: AES-GCM encrypted credential storage with auto-login
- **Navigation persistence**: Cup/match/squad/series state survives app restarts
- **Read-back verification**: Submitted scores verified via GraphQL query
- **Double-series mode**: Navigate 6 series per shooter for efficiency
- **Component order**: Match list preserves SSI component order (1-Tarkkuus, 2-Pika, 3-Kuvio)

### Security (RSEC1–RSEC11)

All 11 registration security requirements implemented:

- **No user enumeration** — generic error responses only
- **Strict input validation** — regex/bounds on all fields
- **Request size limits** — 1KB registration, 10KB global
- **Rate limiting** — 4 limiters with IP logging and curfew tracking
- **Captcha anti-replay** — single-use, 15min TTL
- **HTML injection prevention** — `escapeHtml()` on all SSI data in email templates
- **Helmet + CORS** — locked to production origin
- **Admin credential isolation** — server-side env vars only

### Infrastructure

- **Render**: Single web service serving both UI and API
- **GitHub Actions**: CI pipeline — install → test → audit → build → deploy
- **Resend**: Transactional email from `no-reply@ssi.towi.me`

---

## Release 2.0 — WordPress Integration (2026-02-01)

**Requirements:** Req 38 ✅, 40 ✅, 43 ✅, 44 ✅, 45 ✅, 46 ✅

### Overview

WordPress Tapahtumakalenteri integration and batch processing capabilities.

### New Features

- **Calendar Event Creation**: Automatically creates events in Turun Reservilaiset WordPress calendar
- **Auto-Publish**: Validates SSI and WordPress URLs, then publishes calendar event
- **Statistics Update**: Updates shots fired count after Cup completion
- **2FA Support**: Handles email-based OTP authentication for WordPress
- **Batch Creation**: Create multiple events from a date list file
- **Single Authentication**: One OTP prompt for entire batch — sessions reused

### New Scripts

| Script | Purpose |
|--------|---------|
| `Connect-WordPress.ps1` | WordPress authentication with 2FA |
| `New-TapahtumakalenteriEvent.ps1` | Calendar event creation |
| `Update-TapahtumakalenteriEvent.ps1` | Statistics update |
| `New-KupittaaCupBatch.ps1` | Batch creation from date list |

---

## Release 1.0 — SSI Cup Automation (2026-01-25)

**Git tag:** `v1.0` | **Requirements:** Req 1–34 ✅, 37 ✅

### Overview

First release with full SSI Cup automation via PowerShell web scraping.

### Features

- **Cup Creation**: Automated RESUL CUP event creation on shootnscoreit.com
- **Match Creation**: Creates 3 child matches (Tarkkuus, Pika, Kuvio)
- **Match Linking**: Links matches to parent Cup as components
- **Squad Creation**: Creates 3 squads per match (Oma ase 1, Oma ase 2, Laina-ase)
- **YAML Configuration**: All settings in `kupittaa-cup-config.yml`
- **Duplicate Check**: Prevents duplicate event names
- **Test Mode**: `-TestMode` flag for safe testing
- **Username/Password Auth**: Login without manual session ID

### Architecture

- **Frontend**: React 19 + Tailwind CSS 4, built with Vite 7
- **Backend**: Express 5 proxy (JWT for GraphQL reads, session cookies for score writes)
- **Deployment**: Single Node.js process serves both API and built UI

### Known Limitations

- Venue coordinates must be added manually via SSI map UI
- Event deletion must be done manually

---

## Version Mapping

Historical git tags don't always match requirements release numbers. This table maps them:

| Requirements Release | Git Tag | Date | Key Feature |
|---------------------|---------|------|-------------|
| Release 1.0 | `v1.0` | 2026-01-25 | SSI Cup Automation |
| Release 2.0 | *(no tag)* | 2026-02-01 | WordPress Integration |
| Release 4.0 | `v4.0.0` | 2026-02-07 | Scoring + Registration |
| Release 5.0 + 6.0 | `v6.0.0` | 2026-02-12 | SRA Staffing + Management |
| Release 7.0 | `v7.0.0` | 2026-02-12 | Redis Sessions |
| Release 7.1 | *(post v7.0.0)* | 2026-02-14 | Management Availability |
| Release 7.2 | *(post v7.0.0)* | 2026-02-18 | Cup Management |
| Release 8.0 | *(post v7.0.0)* | 2026-02-20 | Tablet Scoring |

> **Note:** Release 3.0 (Scoring) and Release 5.0 (SRA Staffing) were never released independently — they shipped as part of Release 4.0 and Release 6.0 respectively. Package.json versions (`1.0.0`, `1.1.0`) track the scoring-ui/scoring-proxy components specifically, not the overall project releases.
