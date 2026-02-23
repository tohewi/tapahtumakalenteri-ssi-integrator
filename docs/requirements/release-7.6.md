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
| R76-CUP1 | R7.2 CUP1 | **Move Squadded Shooter Between Squads**: In the "Squadit" section, add a `→ S?` squad move button for shooters already assigned to a squad. Backend `fix-squad` endpoint exists but UI only exposes it for inconsistent assignments. Need: add squad picker trigger to all squadded shooters in SquadCard, capacity enforcement (cannot move into full squad), same UX as "Ei Squadeissa" section. | HIGH | 📋 Specified |

### 7.6.2 — Architecture Completion (from R7.5)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-ARCH3 | R7.5 ARCH3 | **Service Layer Completion**: Extract business logic from remaining routes into service modules. `scoring-service.js` and `cup-manage.js` are done. Remaining: `staffing.js` (438 lines) → `staffing-service.js`, `registration.js` (402 lines) → `registration-service.js`. Reports route (210 lines) is small enough to defer. | MEDIUM | 📋 Specified |
| R76-ARCH4 | R7.5 ARCH4 | **Module Boundary Enforcement via ESLint**: Configure ESLint rules to enforce the import hierarchy documented in AGENTS.md. Rules: routes may only import from their domain module + services + shared utils; domain modules may only import `http-helpers.js`; no barrel imports from `ssi-core/index.js`. Consider `eslint-plugin-import` with `no-restricted-imports`. | MEDIUM | 📋 Specified |

### 7.6.3 — UI Consolidation (from R6.0)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-MG2 | R6.0 MG2 | **Cup List Sorting by Proximity**: Sort cups ascending by proximity to today (closest first). Apply consistently to all cup lists: register, manage, scoring. Currently each feature may sort differently. | LOW | ⬚ Pending |
| R76-MG3 | R6.0 MG3 | **Front Page & Scoring Route Change**: Move scoring app from `#/` to `#/scoring`. Root URL (`#/`) becomes a front page with navigation to: Scoring, Registration, Management, Tablet Scoring, Reports. Currently `#/` is the scoring app directly. | LOW | ⬚ Pending |
| R76-MG4 | R6.0 MG4 | **Shared UI Components**: Extract and share common components (LoginScreen, CupList, visual design) between scoring, registration, and management features. Currently each feature has its own login and cup selection implementation. | LOW | ⬚ Pending |
| R76-MG5 | R6.0 MG5 | **Manage Cup List Reuse**: Reuse the same CUP list component as Registration. Only change text from "ilmoittautuminen" to "hallitse". Currently management has separate cup list logic. | LOW | ⬚ Pending |

### 7.6.4 — Security Hardening (from R7.0)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-SEC1 | R7.0 SEC1 | **OWASP Session Management Audit**: Formal review of session handling against OWASP Session Management Cheat Sheet. Document compliance status, identify gaps, and create remediation plan if needed. Current implementation follows guidelines but no formal audit has been performed. | MEDIUM | ⬚ Pending |
| R76-SEC7 | R7.0 SEC7 | **Encrypted Token Storage**: SSI tokens are stored in Redis as plain JSON. Evaluate and implement at-rest encryption for SSI tokens in session store. Session keys already use `crypto.randomUUID()`. Risk assessment: Redis is same-host or Render internal network — evaluate if encryption at rest adds meaningful security vs. complexity. | LOW | ⬚ Pending |
| R76-SES7 | R7.0 SES7 | **Session Monitoring Endpoint**: `getUserSessions()` and `getActiveSessionCount()` exist in code but are not exposed via any admin API endpoint. Add admin-only endpoints to view active sessions per user, last activity timestamps, and device information. Useful for security monitoring and debugging. | LOW | ⬚ Pending |
| R76-AUTH10 | R7.0 AUTH10 | **Registration Auth Evaluation**: Registration endpoints are intentionally public (no user auth required) — admin SSI credentials are used server-side. Evaluate whether this design is acceptable or if user authentication should be required before registration operations. Document the security trade-off. This is a design decision, not a bug. | LOW | ⬚ Pending |

### 7.6.5 — Test Coverage (from R7.0)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-TEST1 | R7.0 TEST1 | **Session Management Unit Test Coverage**: Current: ~50 tests covering session store, auth middleware, impersonation, security, compat. Target: verify coverage against 90% threshold for session management, token validation, and impersonation logic. Add tests for uncovered edge cases. | MEDIUM | ⬚ Pending |
| R76-TEST2 | R7.0 TEST2 | **Integration Tests**: `session-timeout.test.js` exists (manual, excluded from CI). Formalize integration test suite for complete auth flows with Redis, SSI token refresh, and session isolation. Consider running in separate CI step. | MEDIUM | ⬚ Pending |
| R76-TEST3 | R7.0 TEST3 | **Security Tests**: 7 session security tests exist. Add dedicated tests for: impersonation bypass attempts, privilege escalation (scope manipulation), session hijacking (cookie replay), and token theft scenarios. | MEDIUM | ⬚ Pending |
| R76-TEST4 | R7.0 TEST4 | **Reliability Tests**: Add tests for Redis connection failure/recovery scenarios. Verify in-memory fallback behavior when Redis is unavailable. Test session recovery after Redis restart. | LOW | ⬚ Pending |
| R76-TEST5 | R7.0 TEST5 | **Performance Benchmarks**: Add session lookup latency benchmarks (<50ms p95 target). Verify 100 concurrent user support. Can be lightweight `console.time()`-based or proper benchmark suite. | LOW | ⬚ Pending |
| R76-TEST7 | R7.0 TEST7 | **Automated Security Scanning**: Evaluate and integrate automated security scanning (e.g., `npm audit`, OWASP ZAP) into CI pipeline. Current CI runs `npm audit` but no active penetration testing. | LOW | ⬚ Pending |

### 7.6.6 — Logging Consistency (from R7.5 quick fixes)

| # | Origin | Requirement | Priority | Status |
|---|--------|-------------|----------|--------|
| R76-LOG1 | R7.5 | **Middleware Logging Consistency**: `middleware/auth-v7.js` still uses `console.warn` and `console.error` (3 occurrences). Route files are clean (v7.5 ARCH1/ARCH2 work), but middleware was not included in the sweep. Replace with `log.warn`/`log.error` to complete logging discipline. | HIGH | ⬚ Pending |

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
| MP1–7 | R8.1 | Match Management Platform — roadmap/design phase, not implementation-ready |

---

## Suggested Implementation Order

| Phase | Requirements | Effort | Impact |
|-------|-------------|--------|--------|
| **Phase 1** | R76-LOG1 (middleware logging) | 0.5 h | Quick win — completes logging discipline |
| **Phase 2** | R76-CUP1 (squad move) | 2-3 h | High user value — completes cup management |
| **Phase 3** | R76-ARCH3 (service layer) | 3-4 h | Architecture — reduces route file complexity |
| **Phase 4** | R76-TEST1/2/3 (test coverage) | 3-4 h | Quality — closes critical test gaps |
| **Phase 5** | R76-ARCH4 (ESLint rules) | 1-2 h | Architecture — prevents drift |
| **Phase 6** | R76-SEC1/SEC7/SES7/AUTH10 (security) | 2-3 h | Security — mostly audit/documentation |
| **Phase 7** | R76-MG2/3/4/5 (UI consolidation) | 4-6 h | UX — shared components, front page |
| **Phase 8** | R76-TEST4/5/7 (advanced testing) | 2-3 h | Quality — reliability and perf |

**Total estimated effort:** ~20-25 hours across 8 phases.

---

## Summary

- **18 requirements** consolidated from 5 previous releases (R6.0, R7.0, R7.2, R7.5)
- **1 HIGH priority**: R76-CUP1 (squad move) + R76-LOG1 (middleware logging)
- **5 MEDIUM priority**: R76-ARCH3, R76-ARCH4, R76-SEC1, R76-TEST1/2/3
- **12 LOW priority**: UI consolidation, security hardening, advanced testing
