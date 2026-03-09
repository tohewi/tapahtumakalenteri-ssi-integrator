# Progress

Last updated: 2026-03-09 by Cascade
Branch: `release/r80-match-manager-base` at `b40e156`
Tests: 639 backend (28 files), all passing

---

## Current Session Work

### Completed — 2026-03-08/09: Hotfix Session (SSI Sync, Login, Security)

1. **SSI discipline sync fix** — `platform-store/disciplines.js` used `group_id`/`organizer_id` columns that don't exist in DDL. Fixed to use `ssi_create_url`/`description` matching `postgres.js` schema.
2. **PR preview env vars** — Added `PLATFORM_CREDENTIALS_KEY` and `MFA_SECRET_KEY` to `.github/workflows/pr-preview.yml`, sourced from GitHub secrets.
3. **npm audit fix** — Patched `express-rate-limit` (high), `mailparser` (low), `resend` (low). 0 vulnerabilities.
4. **Graceful decryption failures** — `rowToTenant()`, `getAccountWithMfaSecrets()`, and `updateTenant()` credential merge now catch AES-GCM errors instead of crashing login with 500.
5. **Key management** — Created `docs/design/key-management.md`, `scoring-proxy/.env.example`, `scoring-proxy/scripts/rotate-credentials-key.mjs`. Updated `render.yaml` and `deployment-topology.md`.

### User Actions Completed

- [x] PLATFORM_CREDENTIALS_KEY and MFA_SECRET_KEY added to GitHub repo secrets
- [x] Keys saved in password manager (offline backup)

---

## Active Development Context

- **Branch:** `release/r80-match-manager-base` (v8+ development & production)
- **Render v8 service:** `srv-d6g5pjbuibrs739ghteg` (turres-ssi-tools-v8-pr-138)
- **Render v8 DB:** `dpg-d6mpqfp4tr6s738k41pg-a` (shared by v8 prod + PR previews)
- **Existing SSI credentials in DB were encrypted with a lost key** — decryption failures are now caught gracefully; credentials must be re-entered via tenant settings UI.

---

## What's Implemented (high-level, by release)

- **R1.0–R4.0**: SSI automation, WordPress integration, scoring app, registration — all complete
- **R6.0**: Match management & UI consolidation — 5/5 ✅
- **R7.0–R7.5**: Auth, sessions, refactoring, architecture — mostly complete, some items deferred to R7.6
- **R8.0**: Tablet scoring UI — 12/12 ✅
- **R8.1 (PA1–PA21)**: Platform auth & tenancy — 21/21 ✅ (accounts, tenants, RBAC, MFA, invitations, templates)
- **R8.2**: Authorization & workflows — 5/5 ✅ (RBAC matrix, password reset, event execution/status/cancel)
- **R8.2.1**: Architecture tech debt — 23/23 ✅ (modularity splits, tests, ESLint boundaries)
- **R9.0**: Event staffing — all implemented (needs, signups, leaderboard, notifications)
- **R9.1**: API security hardening — 4/5 ✅ (rate limits, cross-tenant validation, audit log)
- **R9.2**: SSI discipline registry — 4/4 ✅ (built-in + GraphQL auto-discovery)

## What's Next (unprioritized — pick from PRD)

- **R7.6**: Consolidation & completion (deferred items from R7.0/R7.5)
- **R7.9**: GraphQL cup management (GQL1–GQL7) — migrate from web scraping
- **R8.3**: Calendar integration (CAL-1–CAL-6) — WordPress Tapahtumakalenteri in Node.js
- **R9.1 SEC-H5**: CSRF token evaluation (design)
- **Regulatory**: GDPR, ToS, accessibility (21 design-phase requirements)
- **Backlog**: Admin dashboard (BL-1), tenant context/URL strategy (TEN-1), page-load perf (PRF-1)
