# Progress

Last updated: 2026-03-09 by Cascade
Branch: `release/r80-match-manager-base` at `6011f0a`
Tests: 671 backend (30 files), all passing

---

## Current Session Work

### Completed — 2026-03-09: R8.3 Calendar Integration (CAL-1, CAL-2) + Ralph Workflow

1. **Ralph Loop workflow** (`548b7d0`) — Created `progress.md`, `.windsurf/workflows/ralph.md`, updated AGENTS.md + copilot-instructions.md with cross-session discipline.
2. **CAL-1: WordPress Authentication Module** (`b8c9e13`) — `lib/calendar/wp-auth.js`: wpLogin, wpSubmitOtp, wpResendOtp, isAuthenticated, parse2faForm. Cookie jar via `tough-cookie`. 16 tests + 2 HTML fixtures.
3. **CAL-2: Gmail OTP Fetching** (`a66e87d`) — `lib/calendar/gmail-otp.js`: fetchOtpFromGmail, extractOtpFromText, buildSearchQuery. IMAP via `imapflow` + `mailparser`. 16 tests.

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
- **R8.3**: Calendar integration — 2/9 ✅ (CAL-1 WP auth, CAL-2 Gmail OTP)
- **R9.0**: Event staffing — all implemented (needs, signups, leaderboard, notifications)
- **R9.1**: API security hardening — 4/5 ✅ (rate limits, cross-tenant validation, audit log)
- **R9.2**: SSI discipline registry — 4/4 ✅ (built-in + GraphQL auto-discovery)

## What's Next (unprioritized — pick from PRD)

- **R8.3 CAL-3**: WordPress Calendar Adapter — the big one: createEvent, updateEvent, publishEvent with ACF fields + nonce handling
- **R8.3 CAL-4–6**: Calendar publishing workflow, stats update, integrity check
- **R7.6**: Consolidation & completion (deferred items from R7.0/R7.5)
- **R7.9**: GraphQL cup management (GQL1–GQL7) — migrate from web scraping
- **Regulatory**: GDPR, ToS, accessibility (21 design-phase requirements)
- **Backlog**: Admin dashboard (BL-1), tenant context/URL strategy (TEN-1), page-load perf (PRF-1)
