# Progress

Last updated: 2026-03-11 (midnight) by Cascade
Branch: `release/r80-match-manager-base` at `560a5a0`
Tests: 804 backend (36 files), 801 passing (3 flaky registration timeouts — pre-existing)

---

## Current Session Work

### Completed — 2026-03-11 (midnight): CAL-7 SSI Event Completion

17. **CAL-7: SSI Event Completion** (`560a5a0`) — Mark SSI events as "Completed" via web form POST. SSI GraphQL has no `update_event` mutation (confirmed by introspection + direct call tests). Uses Django edit form at `/event/{ct}/{id}/edit/`. New files: `lib/ssi-core/event-status.js` (ssiSetEventStatus — GET edit page, parseFormFields, override status, POST), `lib/services/event-complete-service.js` (completeEvent — cup: complete matches first then cup; standalone: complete directly). API: POST `/events/:id/complete-ssi` with RBAC + audit. UI: purple "Complete SSI" button in SchedulePage list view + EventCalendar popover for ssi_created/calendar_published events. 21 new tests.

### Completed — 2026-03-10 (late night): CAL-5 Calendar Statistics Update

16. **CAL-5: Calendar Statistics Update** (`4c873f0`) — Query SSI GraphQL for approved participant count (`number_of_mainmatch_competitors_approved`), calculate shots fired (×`shotsPerParticipant`), update WordPress ACF fields via `adapter.updateEvent()`. New files: `lib/ssi-core/stats-graphql.js` (ssiGetEventStats with inline fragments for Nordic/IPSC/Precision/PPC), `lib/services/calendar-stats-service.js` (updateCalendarStats — pure function for PEW-3 automation). API: POST `/update-calendar-stats` with RBAC + audit. UI: "Update Stats" button + stats display in both SchedulePage list view and EventCalendar popover. Template: `shotsPerParticipant` field (default 100). 26 new tests. Replaces `Update-TapahtumakalenteriEvent.ps1` (246 lines).

### Completed — 2026-03-10 (evening): CAL-4 UI + UAT Bug Fixes

6. **CAL-4-UI: Calendar Integration UI** (`64e26e0`) — TenantCalendarTab form (WP URL, creds, Gmail OTP), calendarConfig encryption/masking in tenant store, publishCalendarApi(), calendar links/error/retry in SchedulePage + EventCalendar.
7. **UAT fix: wpBaseUrl normalization** (`6ce96e7`) — Users pasting `/wp-admin` URL caused login to hit wrong path. `wpLogin()` now strips `/wp-admin`. UI also strips on save.
8. **UAT fix: ACF fields cleared on publish** (`1929c6e`) — `publishEvent()` wasn't re-submitting ACF values, so WordPress/ACF cleared all content on status change. Now reads + re-submits current ACF field values.
9. **UAT fix: re-publish button** (`1f880b4`) — Added "Publish Calendar", "Retry Calendar", "Re-publish Calendar" (force=true) buttons for all event states.
10. **UAT fix: content field name mismatch** (`f79607d`) — UI stores `calendarTemplate.content` but service read `.contentTemplate`. Fixed to read `.content` first.
11. **UAT fix: HTML entity encoding in ACF values** (`b616f3d`) — `extractAcfFieldValues()` extracted entity-encoded content (`&lt;div&gt;`) from WP edit page HTML. Added `decodeHtmlEntities()` to convert back to raw HTML before re-submitting.
12. **UAT fix: {ssiCupLink} placeholder missing** (`773834a`) — UI hint told users to use `{ssiCupLink}` but `buildEventContent()` only handled `{ssiCupUrl}`. Added `{ssiCupLink}` replacement.
13. **UAT fix: {ssiCupLink} as full HTML anchor** (`840d5e8`) — `{ssiCupLink}` was producing raw URL. Now produces `<a href="url" target="_blank">Cup Name</a>` matching original PowerShell solution.

### Completed — 2026-03-10 (night): Backlog Requirements

14. **PEW-1..PEW-4: Post-Event Workflows** (`a729f39`) — Added framework + 3 concrete workflow types (email shooter count, tapahtumakalenteri stats, publish scores) to backlog.
15. **INT-1: Multi-System Integration Architecture** (`1d4ecf1`) — Added design requirement for tenant-level integration configuration (event management + event scheduling systems, adapter abstraction, multi-system support).

### Completed — 2026-03-10: R8.3 CAL-4 Calendar Publishing in Event Execution

5. **CAL-4: Calendar Publishing Service** (`39ac055`) — `lib/services/calendar-publish-service.js`: orchestrates WP auth (with 2FA + Gmail OTP) → create → publish. Wired into execute endpoint (after SSI creation, non-fatal on failure). Manual retry endpoint POST /publish-calendar. 35 tests.

### Completed — 2026-03-09: R8.3 Calendar Integration (CAL-1, CAL-2, CAL-3) + Ralph Workflow

1. **Ralph Loop workflow** (`548b7d0`) — Created `progress.md`, `.windsurf/workflows/ralph.md`, updated AGENTS.md + copilot-instructions.md with cross-session discipline.
2. **CAL-1: WordPress Authentication Module** (`b8c9e13`) — `lib/calendar/wp-auth.js`: wpLogin, wpSubmitOtp, wpResendOtp, isAuthenticated, parse2faForm. Cookie jar via `tough-cookie`. 16 tests + 2 HTML fixtures.
3. **CAL-2: Gmail OTP Fetching** (`a66e87d`) — `lib/calendar/gmail-otp.js`: fetchOtpFromGmail, extractOtpFromText, buildSearchQuery. IMAP via `imapflow` + `mailparser`. 16 tests.
4. **CAL-3: WordPress Calendar Adapter** (`25daf05` + `7a16dad`) — `lib/calendar/wp-adapter.js`: WpCalendarAdapter class with createEvent, publishEvent, updateEvent, getEvent, deleteEvent, findEventBySlug. ACF field mapping, nonce extraction, taxonomy handling. 51 tests + 3 HTML fixtures. Replaces New-TapahtumakalenteriEvent.ps1 + Update-TapahtumakalenteriEvent.ps1.

### Previous — 2026-03-08/09: Hotfix Session (SSI Sync, Login, Security)

1. SSI discipline sync fix — `platform-store/disciplines.js` schema alignment
2. PR preview env vars — encryption keys in `.github/workflows/pr-preview.yml`
3. npm audit fix — 0 vulnerabilities
4. Graceful decryption failures — catch AES-GCM errors in login/tenant flows
5. Key management docs — `key-management.md`, `.env.example`, rotation script

---

## Active Development Context

- **Branch:** `release/r80-match-manager-base` (v8+ development & production)
- **Render v8 service:** `srv-d6g5pjbuibrs739ghteg` (turres-ssi-tools-v8-pr-138)
- **Render v8 DB:** `dpg-d6mpqfp4tr6s738k41pg-a` (shared by v8 prod + PR previews)
- **Existing SSI credentials in DB were encrypted with a lost key** — decryption failures are now caught gracefully; credentials must be re-entered via tenant settings UI.
- **New deps this session:** `tough-cookie` (CAL-1), `imapflow` + `mailparser` (CAL-2)

---

## What's Implemented (high-level, by release)

- **R1.0–R4.0**: SSI automation, WordPress integration, scoring app, registration — all complete
- **R6.0**: Match management & UI consolidation — 5/5 ✅
- **R7.0–R7.5**: Auth, sessions, refactoring, architecture — mostly complete, some items deferred to R7.6
- **R8.0**: Tablet scoring UI — 12/12 ✅
- **R8.1 (PA1–PA21)**: Platform auth & tenancy — 21/21 ✅ (accounts, tenants, RBAC, MFA, invitations, templates)
- **R8.2**: Authorization & workflows — 5/5 ✅ (RBAC matrix, password reset, event execution/status/cancel)
- **R8.2.1**: Architecture tech debt — 23/23 ✅ (modularity splits, tests, ESLint boundaries)
- **R8.3**: Calendar integration — 5/9 ✅ (CAL-1 WP auth, CAL-2 Gmail OTP, CAL-3 WP adapter, CAL-4 publish flow + UI, CAL-5 statistics update via GraphQL). UAT passed on PR-138 preview (7 bug fixes).
- **R9.0**: Event staffing — all implemented (needs, signups, leaderboard, notifications)
- **R9.1**: API security hardening — 4/5 ✅ (rate limits, cross-tenant validation, audit log)
- **R9.2**: SSI discipline registry — 4/4 ✅ (built-in + GraphQL auto-discovery)

## What's Next (unprioritized — pick from PRD)

- **R8.3 CAL-6**: Calendar Data Integrity — cross-reference validation SSI ↔ WP
- **R7.6**: Consolidation & completion (deferred items from R7.0/R7.5)
- **R7.9**: GraphQL cup management (GQL1–GQL7) — migrate from web scraping
- **Regulatory**: GDPR, ToS, accessibility (21 design-phase requirements)
- **Backlog**: Admin dashboard (BL-1), tenant context/URL strategy (TEN-1), page-load perf (PRF-1), post-event workflows (PEW-1..4), multi-system integration architecture (INT-1)
