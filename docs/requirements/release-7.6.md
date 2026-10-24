# Release 7.6 — Consolidation & Completion

**Created:** 2026-02-23
**Purpose:** Consolidate incomplete requirements from previous releases into a single trackable release. Each requirement references its origin release.

---

## Analysis Summary

A cross-reference of `requirements.md` against the actual codebase (Feb 2026) revealed:

1. **Release 7.0** (Authentication & Session Handling) has **25 requirements all marked "⬚ Pending"**, but the codebase shows **most are already implemented** via `lib/session/`, `middleware/auth-v7.js`, `routes/auth-v7.js`, and `lib/session/audit.js`. These status markers need correction in `requirements.md`.
2. **Release 7.2** CUP2 (DNS) is **fully implemented** (backend + UI) but marked "📋 Specified". CUP1 (squad move within Squadit) has backend support (`fix-squad`) but the UI only exposes it for inconsistent assignments, not as a general "move squadded shooter" action.
3. **Release 6.0** MG2–MG5 remain genuinely pending — UI consolidation not started.
4. **Release 7.5** ARCH3–ARCH4 remain genuinely pending — service extraction and ESLint rules.

---

## Requirements Status Corrections (R7.0)

The following Release 7.0 requirements are **already implemented** and should be updated to ✅ in `requirements.md`:

| # | Requirement | Evidence |
|---|-------------|----------|
| AUTH1 | Dual-Session Architecture | `lib/session/store.js` — `createSession()` stores `userSSI` + `adminSSI` |
| AUTH2 | Session Persistence (Redis) | `lib/session/redis.js` + `store.js` — Redis with 8h TTL |
| AUTH3 | SSI Token Validation | `middleware/auth-v7.js` — `isUserTokenValid()` called per request |
| AUTH4 | Automatic SSI Token Refresh | `middleware/auth-v7.js` — checks `userTokenNeedsRefresh()` and `adminTokenNeedsRefresh()` |
| AUTH5 | Secure Impersonation | `lib/session/impersonation.js` — `executeSSI()` guards validate user context |
| AUTH6 | Session Isolation | `store.js` — `createSession()` generates unique UUID per user |
| AUTH7 | Audit Trail | `lib/session/audit.js` — `auditLogin()`, `auditLogout()`, `auditSSIOperation()`, `auditTokenRefresh()`, `auditSecurityViolation()` |
| AUTH8 | State Restoration | Release 7.4.1 AUTH-UX1/UX2/UX3 — mount-time auth bootstrap + restoring gate |
| AUTH9 | Cross-Feature Auth | `requireAuthV7(allowedScopes)` — single login with scope validation |
| SES1 | Redis Session Store | `lib/session/redis.js` — `initRedis()`, `getRedisClient()` |
| SES2 | Session TTL Configuration | `lib/session/config.js` — `SESSION_TTL` env var, default 8h |
| SES3 | Session Cleanup | Redis TTL-based expiration (automatic) |
| SES4 | Session Security | HttpOnly, Secure, SameSite=lax cookies; `crypto.randomUUID()` session IDs |
| SES5 | Concurrent Sessions | Each login creates new session; `getUserSessions()` lists per-user |
| SES6 | Session Revocation | `deleteSession()` for logout; `revokeAllUserSessions()` for security events |
| SEC2 | Impersonation Security | `getImpersonationContext()` returns null if user token invalid |
| SEC3 | Token Validation | Both user and admin tokens validated before SSI operations |
| SEC4 | Rate Limiting | Login: 10/15min, session refresh limited in middleware |
| SEC5 | Audit Logging | `audit.js` covers all auth events and SSI operations |
| SEC6 | Error Handling | Generic auth errors: "Authentication required", "Session expired" |

The following Release 7.2 requirement is **already implemented** and should be updated:

| # | Requirement | Evidence |
|---|-------------|----------|
| CUP2 | Set Shooter as DNS | Backend: `set-dns`, `undo-dns` endpoints in `management.js`. UI: DNS toggle button in `ShooterActions.jsx` with undo support. Bilingual confirmation. |

---

## Release 7.6 Requirements

### 7.6.1 — Cup Management Completion (from R7.2)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-CUP1 | R7.2 CUP1 | **Move Squadded Shooter Between Squads**: In the "Squadit" section, allow moving a shooter to another squad with capacity enforcement (cannot move into full squad) and optional single-match scoping (`matchId`). Implemented in `SquadCard.jsx`, `SquadPickerSheet.jsx` (disables full and current squads), and `POST /api/v1/manage/cup/:id/fix-squad`. | HIGH | ✅ Implemented |

### 7.6.2 — Architecture Completion (from R7.5)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-ARCH3 | R7.5 ARCH3 | **Service Layer Completion**: Extracted business logic from routes into service modules (`cup-manage.js`, `scoring-service.js`, `registration-service.js`, `staffing-service.js`). Route files are now thin HTTP dispatchers. | MEDIUM | ✅ Implemented |
| R76-ARCH4 | R7.5 ARCH4 | **Module Boundary Enforcement via ESLint**: Configured ESLint v9 flat config in `scoring-proxy/eslint.config.js` enforcing `architecture/no-cross-domain-imports` and `architecture/no-barrel-imports` and added lint steps in `.github/workflows/ci-deploy.yml`. | MEDIUM | ✅ Implemented |

### 7.6.3 — UI Consolidation (from R6.0)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-MG2 | R6.0 MG2 | **Cup List Sorting by Proximity**: Sort cups ascending by proximity to today (closest first). Implemented for registration and management in `scoring-ui/src/components/shared.jsx` (`CupList`) and for mobile/tablet scoring in `scoring-proxy/routes/scoring.js` (`sortByProximityToNow`). | LOW | ✅ Implemented |
| R76-MG3 | R6.0 MG3 | **Front Page & Scoring Route Change**: Move scoring app from `#/` to `#/scoring`. Root URL (`#/`) renders `HomePage.jsx` with navigation to Scoring, Registration, Management, Tablet Scoring, Reports, and Staffing (`main.jsx`). | LOW | ✅ Implemented |
| R76-MG4 | R6.0 MG4 | **Shared UI Components**: Share `LoginScreen` from `scoring-ui/src/components/LoginScreen.jsx` and common UI components (`CupList`, `AppHeader`, `BackButton`, `ErrorBanner`, `Spinner`) from `scoring-ui/src/components/shared.jsx`. | LOW | ✅ Implemented |
| R76-MG5 | R6.0 MG5 | **Manage Cup List Reuse**: Reuse the same `CupList` component as Registration in `ManagePage.jsx` with `openLabel="Hallitse cupia"` and `allClickable={true}`. | LOW | ✅ Implemented |

### 7.6.4 — Security & Compliance Hardening (from R7.0)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-SEC1 | R7.0 SEC1 | **OWASP Session Management Audit**: Formal review of session handling against OWASP Session Management Cheat Sheet documented in `docs/design/session-handling.md`. | MEDIUM | ✅ Implemented |
| R76-SEC7 | R7.0 SEC7 | **Encrypted Token Storage**: Evaluated at-rest storage in `docs/design/session-handling.md` (Render internal-only Redis with `ipAllowList: []` + AES-256-GCM encryption in `lib/device-tokens.js` + `crypto.randomUUID()` session keys). | LOW | ✅ Implemented |
| R76-SES7 | R7.0 SES7 | **Session Monitoring Endpoint**: Exposed `GET /api/v1/auth/sessions` (manage scope required) returning `getActiveSessionCount()` and sanitized per-user sessions via `getUserSessions()`. | LOW | ✅ Implemented |
| R76-AUTH10 | R7.0 AUTH10 | **Registration Must Require SSI Passthrough Login**: Implemented SSI session and passthrough password verification (`ssiLogin`) in `scoring-proxy/routes/registration.js` (`FEATURE_REGISTRATION_AUTH_REQUIRED`) and `scoring-ui/src/components/RegisterPage.jsx`. | HIGH | ✅ Implemented |
| R76-COM1 | SSI API license assessment follow-up | **Public Legal Documents for Registration**: Published Privacy Policy (`#/privacy`) and Terms of Service (`#/terms`) in `LegalDocumentPage.jsx` and linked both from `RegisterPage.jsx` and `HomePage.jsx`. | MEDIUM | ✅ Implemented |
| R76-COM2 | SSI API license assessment follow-up | **Disable Paid Tracking in Tooling**: Remove paid-status tracking from management functionality. Disable paid status reads and writes in UI and backend routes, including SSI `toggle-paid` mutation usage via web scraping. Cup management must no longer provide paid bookkeeping controls in this tooling. DNS controls remain in scope. | HIGH | ✅ Implemented/Ready |
| R76-COM3 | SSI API license assessment follow-up | **Per-User SSI Execution Identity for State Changes**: State-changing management and scoring endpoints execute using `req.ssiSession` requester identity and record structured mutation audit fields (`auditMutation` in `lib/session/audit.js`). | HIGH | ✅ Implemented |

#### Technical Acceptance Checklist — R76-COM3

- **State-changing endpoints in scope**
  - `POST /api/v1/manage/cup/:id/assign-squad`
  - `POST /api/v1/manage/cup/:id/fix-squad`
  - `POST /api/v1/manage/cup/:id/add-to-cup`
  - `POST /api/v1/manage/cup/:id/approve-pending`
  - `POST /api/v1/manage/cup/:id/remove-pending`
  - `POST /api/v1/manage/cup/:id/set-dns`
  - `POST /api/v1/manage/cup/:id/undo-dns`
  - `POST /api/v1/register/submit`
  - `POST /api/v1/scoring/competitor/:id/score`

- **Execution identity rules (must pass)**
  - Each endpoint above must execute SSI write operations with the authenticated requester identity from `req.ssiSession`.
  - Shared admin/proxy SSI cookies/tokens must not be used for writes on in-scope endpoints.
  - If requester SSI session/cookies are missing or invalid, endpoint must fail with auth error (no fallback to shared identity).

- **Required audit fields per mutation (must be logged)**
  - `timestamp` (ISO-8601)
  - `requestId` (or equivalent correlation id)
  - `endpoint` + `operation`
  - `initiatingUserId` + `initiatingUserEmail` (from authenticated session)
  - `executionIdentityUserId` + `executionIdentityEmail` (the SSI identity used for the write)
  - `targetEntity` (cup/match/competitor IDs, participant ID when available)
  - `result` (`success`/`failure`) + normalized `errorCode` on failure

- **Verification criteria (must pass)**
  - Automated tests assert no in-scope write path calls shared admin session helpers.
  - Logs from test/uat runs show `initiatingUser*` equals `executionIdentity*` for all in-scope mutations.
  - Negative test: with expired requester SSI cookies, write endpoints return auth failure and perform no SSI write.

- **Approved exception criteria (strict)**
  - Exception exists only if SSI has explicit written approval (email or signed note) naming endpoint(s), allowed action(s), and validity period.
  - Exception record is stored in repo docs with owner, approval date, and review/expiry date.
  - Runtime audit logs must include `exceptionId` whenever exception path is used.
  - Exceptions are temporary by default and must be removed when SSI-compatible per-user path becomes available.

### 7.6.5 — Test Coverage (from R7.0)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-TEST1 | R7.0 TEST1 | **Session Management Unit Test Coverage**: Covered across `store.test.js`, `auth-middleware.test.js`, `impersonation.test.js`, `security.test.js`, `compat.test.js`, and `reliability-and-perf.test.js`. | MEDIUM | ✅ Implemented |
| R76-TEST2 | R7.0 TEST2 | **Integration Tests**: Multi-device session isolation, revocation, and token refresh flows verified in `test/session/`. | MEDIUM | ✅ Implemented |
| R76-TEST3 | R7.0 TEST3 | **Security Tests**: Impersonation bypass, scope manipulation, cookie replay, and expired token blocking verified in `security.test.js` and `reliability-and-perf.test.js`. | MEDIUM | ✅ Implemented |
| R76-TEST4 | R7.0 TEST4 | **Reliability Tests**: In-memory fallback and session recovery verified in `reliability-and-perf.test.js`. | LOW | ✅ Implemented |
| R76-TEST5 | R7.0 TEST5 | **Performance Benchmarks**: Verified <50ms p95 lookup latency across 100 concurrent sessions in `reliability-and-perf.test.js`. | LOW | ✅ Implemented |
| R76-TEST7 | R7.0 TEST7 | **Automated Security Scanning**: Enforced via `npm audit --audit-level=high`, ESLint gate, and GitGuardian in CI. | LOW | ✅ Implemented |

### 7.6.6 — Logging Consistency (from R7.5 quick fixes)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-LOG1 | R7.5 | **Middleware Logging Consistency**: Replaced 3 `console.warn` / `console.error` calls in `scoring-proxy/middleware/auth-v7.js` with structured `log.warn` / `log.error` from `lib/logger.js`. | HIGH | ✅ Implemented |

### 7.6.7 — Technical Debt Backlog (Code Quality Review Findings)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-TD1 | Code Review | **Monolithic SSI Client Decomposition (`scoring-proxy/lib/ssi-core/client.js`, 1,898 lines)**: Moved domain implementations out of `client.js` into `graphql.js`, `scoring.js`, `participants.js`, `management.js`, and `http-helpers.js` and removed unused `lib/ssi-client.js` compat shim. | HIGH | ✅ Implemented |
| R76-TD2 | Code Review | **Oversized UI & Route Files (>500-Line Guideline Violations)**: Decomposed `App.jsx` (599 → 475 lines), `ManagePage.jsx` (767 → 260 lines), `routes/management.js` (776 → 468 lines), and `TabletScoringView.jsx` (648 → 426 lines) into focused sub-components and helpers. | MEDIUM | ✅ Implemented |
| R76-TD3 | Code Review | **Orphaned SRA Staffing Prototype Cleanup & Staffing Tests**: Archived orphaned prototype modules (`StaffStatusBoard.jsx`, `StaffSignupPanel.jsx`, `lib/staffing/cron.js`, `notifier.js`, `role-assigner.js`, `squad-optimizer.js`, `IMMEDIATE-DEVELOPMENT-NEEDS.md`) to `archive/staffing-prototype/` and added unit tests in `scoring-proxy/test/staffing.test.js`. | MEDIUM | ✅ Implemented |
| R76-TD4 | Code Review | **Backend ESLint Configuration & CI Lint Gate**: Migrated root `.eslintrc-architectural.js` to ESLint v9 flat config (`scoring-proxy/eslint.config.js`), added `npm run lint` to `scoring-proxy/package.json`, and added UI/proxy lint steps to `.github/workflows/ci-deploy.yml`. | MEDIUM | ✅ Implemented |
| R76-TD5 | Branch Audit | **Unmerged Feature Branch Consolidation (`R7.8`, `R7.9`, `R10.0`)**: Reconcile and merge completed work sitting on unmerged feature branches: `copilot/vscode-mnw87b09-v5g9` (Release 7.8 Induction Wait List), `R79-hotfix-cup-count-status-sync` (7-day manage window + -1d lookback), and `R100-feature-registration-buffer-*` (Release 10.0 Registration Buffer). | HIGH | 📋 Backlog |

---

## Requirements NOT included in R7.6 (deferred or out of scope)

| # | Origin | Reason for exclusion |
|---|--------|---------------------|
| 35, 36 | R1.0 | On hold — auto-approve and squad copy features parked |
| 39, 42 | R2.0 | PowerShell scripting features — separate domain, not web app |
| 41 | R2.0 | Parked — requires OTP integration |
| SEC11 | R3.0 | Google auth study — research task, not implementation |
| 47, 48 | R3.1 | Data integrity / automation architecture — large scope, separate release |
| TEST6 | R7.0 | E2E Tests — deferred to when E2E framework is selected (Playwright recommended) |
| TEST8 | R7.0 | Load Tests — deferred to pre-production scaling phase |
| GQL1–6 | R7.9 | GraphQL Cup Management — separate release, different domain (PowerShell scripts) |
| MP1–7 | R8.1 | Match Management Platform — moved to separate repository (`tohewi/match-manager`) |

---

## Suggested Implementation Order

| Phase | Requirements | Effort | Impact |
|-------|-------------|--------|--------|
| **Phase 1** | R76-COM3 (per-user SSI execution identity) | 3-5 h | High compliance risk reduction |
| **Phase 2** | R76-COM2 (disable paid tracking) — ✅ completed | 1-2 h | Immediate compliance hardening |
| **Phase 3** | R76-LOG1 (middleware logging) — ✅ completed | 0.5 h | Quick win — completes logging discipline |
| **Phase 4** | R76-CUP1 (squad move) — ✅ completed | 2-3 h | High user value — completes cup management |
| **Phase 5** | R76-ARCH3 + R76-TD1/TD2 (service layer & file decomposition) | 5-8 h | Architecture — reduces monolith & route complexity |
| **Phase 6** | R76-TEST1/2/3 + R76-TD3 (test coverage & staffing cleanup) | 4-6 h | Quality — closes critical test gaps |
| **Phase 7** | R76-ARCH4 + R76-TD4 (ESLint rules & CI lint gate) | 1-2 h | Architecture — prevents drift |
| **Phase 8** | R76-SEC1/SEC7/SES7/COM1 (security/compliance) | 2-3 h | Security + compliance documentation |
| **Phase 9** | R76-MG2/3/4/5 (UI consolidation) — ✅ completed | 4-6 h | UX — shared components, front page |
| **Phase 10** | R76-TEST4/5/7 (advanced testing) | 2-3 h | Quality — reliability and perf |

**Total estimated effort:** ~26-38 hours across 10 phases (~16-23 hours remaining).

---

## Summary

- **21 consolidated requirements + 5 technical debt backlog items (`R76-TD1`–`R76-TD5`)**
- **25 completed (✅)**: All 21 R7.6 requirements (`R76-CUP1`, `R76-ARCH3`, `R76-ARCH4`, `R76-MG2`–`R76-MG5`, `R76-SEC1`, `R76-SEC7`, `R76-SES7`, `R76-AUTH10`, `R76-COM1`–`R76-COM3`, `R76-TEST1`–`R76-TEST5`, `R76-TEST7`, `R76-LOG1`) + 4 technical debt items (`R76-TD1`–`R76-TD4`)
- **1 remaining backlog item (📋)**: `R76-TD5` (Unmerged feature branch consolidation: `R7.8`, `R7.9`, `R10.0`)
