# Remediation Plan

## Goals
- Improve security for session-based APIs.
- Increase reliability under restarts and multi-instance deployments.
- Improve reusability of shared integrations and error handling.

## Scope
- Scoring proxy (Express API).
- Staffing and registration flows.
- SSI integration helpers.

## Priority Issues and Remediations

### 1) Session Lifetime and Configuration
**Problem**: Session TTL is hard-coded to 1 minute for all environments.

**Impact**: Frequent session drops, user frustration, and accidental auth failures.

**Plan**:
- Make session TTL configurable via env var with safe defaults.
- Use a production default of 30-60 minutes.
- Emit a startup warning when TTL is below 10 minutes in production.

**Files**:
- scoring-proxy/server.js

**Success Criteria**:
- Session TTL configurable via env.
- No unexpected session expiry within 30 minutes of activity.

### 2) Replace In-Memory Session and Captcha Stores
**Problem**: Sessions and captchas are stored in memory.

**Impact**: Data loss on restart and inconsistent behavior across multiple instances.

**Plan**:
- Introduce Redis (or equivalent) for session and captcha storage.
- Use TTL keys and atomic operations.
- Add a small abstraction layer for storage to keep routes clean.

**Files**:
- scoring-proxy/server.js
- scoring-proxy/routes/registration.js

**Success Criteria**:
- Sessions and captcha survive process restarts.
- Multi-instance deployment behaves consistently.

### 3) Admin Session Isolation and Rotation
**Problem**: Global admin session for registration is shared and long-lived.

**Impact**: Higher blast radius on token compromise and concurrency issues.

**Plan**:
- Move admin session into a small session manager with locking and refresh.
- Add per-request fallback when admin session refresh fails.
- Add regular credential rotation guidance and logging on refresh failures.

**Files**:
- scoring-proxy/server.js

**Success Criteria**:
- Admin session refresh does not race.
- Registration calls recover cleanly on refresh failure.

### 4) Add CSRF Protection for Cookie-Based Auth
**Problem**: API uses cookie auth without explicit CSRF protection.

**Impact**: Risk of CSRF for state-changing routes.

**Plan**:
- Add CSRF tokens for all POST/PUT/DELETE routes using cookie auth.
- Use double-submit cookie or server-side token validation.
- Exempt public endpoints where no auth cookie is required.

**Files**:
- scoring-proxy/server.js
- scoring-proxy/routes/auth.js
- scoring-proxy/routes/management.js
- scoring-proxy/routes/staffing.js
- scoring-proxy/routes/registration.js

**Success Criteria**:
- Requests without valid CSRF token are rejected with 403.
- Existing UI includes CSRF tokens in all state-changing calls.

### 5) Make SSI Side-Effects Reliable and Observable
**Problem**: Staffing signup triggers SSI updates in a fire-and-forget mode.

**Impact**: Local state can diverge from SSI with no retry or visibility.

**Plan**:
- Add a background job queue for SSI updates with retries.
- Return partial success warnings with actionable guidance.
- Add structured logs with correlation IDs for each SSI call.

**Files**:
- scoring-proxy/routes/staffing.js
- scoring-proxy/lib/staffing/engine.js
- scoring-proxy/lib/ssi-core/client.js

**Success Criteria**:
- SSI updates are retried on transient errors.
- UI shows a warning when SSI sync fails.

## Implementation Phases

### Phase 1: Quick Wins (1-2 days)
- Make session TTL configurable.
- Add CSRF protection for high-risk routes.
- Improve SSI side-effect error reporting.

### Phase 2: Reliability (2-4 days)
- Introduce Redis-backed session and captcha stores.
- Add job queue for SSI updates with retries.

### Phase 3: Hardening (2-3 days)
- Refine admin session manager with lock and refresh.
- Add health checks for Redis and job queue.

## Risks and Mitigations
- **Risk**: Redis availability issues.
  - **Mitigation**: Use managed Redis and add fallback to deny new sessions.
- **Risk**: CSRF tokens break existing clients.
  - **Mitigation**: Ship UI changes in the same release.
- **Risk**: SSI behavior changes.
  - **Mitigation**: Add feature flags and retry guards.

## Validation
- Add tests for session TTL, CSRF enforcement, and SSI retry logic.
- Run a short load test to validate session store and rate limits.
