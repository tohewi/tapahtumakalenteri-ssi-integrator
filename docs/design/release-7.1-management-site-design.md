---
description: Release 7.1 staffing multi-site management site design and proof of concept
---

# Release 7.1 - Staffing Multi-Site Management Site Design

## 1. Objective

Release 7.1 introduces a management site for configuring staffing sub-sites without code redeploys.

The design goals are:

1. Move staffing configuration from hardcoded/YAML-only settings to database-backed per-site configuration.
2. Support multiple staffing sites (for example, `temppeli-sra`, `kupittaa-reservilaisammunta`).
3. Keep SSI authentication for users while introducing delegated management admin rights.
4. Make staffing event discovery and staffing actions site-aware using `siteKey`.
5. Persist settings across normal deploys and allow explicit clean reset (`CLEAN_DEPLOY=true`).

## 2. Scope

### In scope (PoC)

- Site management CRUD API (admin-protected).
- Admin delegation API (root admin can grant/revoke).
- Per-site staffing configuration loading through DB + YAML fallback.
- Site-specific event filters (`name_contains`, `cup_id`, `date_range`, `futureOnly`).
- Site-aware staffing auth/session propagation (`siteKey` in login/status/session metadata).
- Site-aware staffing UI login flow and staffing API calls.

### Out of scope (for later releases)

- Full audit history UI for every config change.
- Role-based admin levels beyond root + delegated admin.
- Cross-site global analytics dashboard.

## 3. Architecture Overview

```text
[Staffing UI]
  - site selector (login scope)
  - staffing calls with siteKey
        |
        v
[Auth v7 routes + middleware]
  - login(scope=staffing, siteKey)
  - session metadata.staffingSiteKey
  - req.staffingSiteKey
        |
        v
[Staffing routes]
  - resolveRequestSiteKey(req)
  - loadConfig(siteKey)
  - event filters by site
  - engine operations by site
        |
        v
[Staffing engine + config loader]
  - site-scoped event state keys
  - DB config merge + YAML fallback
        |
        v
[PostgreSQL]
  - admin_users
  - staff_sites
  - staff_site_config
  - site_event_filters
```

## 4. Data Model

See also: `docs/design/management-site-database-schema.md`

Core tables:

- `admin_users`
  - Management admin access control.
  - Root admin seeded by `ADMIN_ROOT_EMAIL`.

- `staff_sites`
  - Site identity (`key`) and display metadata.

- `staff_site_config`
  - Per-site configuration sections (JSONB), merged over YAML template.

- `site_event_filters`
  - Event discovery filter rules per site.

## 5. Auth and Authorization Flow

### 5.1 Staffing login

1. UI submits `/api/auth/login` with `scope=staffing` and selected `siteKey`.
2. Backend normalizes `siteKey`.
3. Backend verifies user against per-site allowlist (`isAdminEmail(email, siteKey)`).
4. Session is created with `metadata.staffingSiteKey`.
5. `/api/auth/status` returns `siteKey` for staffing scope.

### 5.2 Request context

`requireAuthV7` now resolves and attaches:

- `req.staffingSiteKey` (normalized, only for staffing scope)

This is used by staffing routes to enforce session-site consistency.

## 6. Site-Aware Staffing API Behavior

### 6.1 Site resolution rule

`resolveRequestSiteKey(req)` resolves effective `siteKey` from:

1. Session context (`req.staffingSiteKey`) when available.
2. Explicit request `siteKey` (query/body) when not conflicting.
3. Fallback default (`sra-training`).

If explicit `siteKey` conflicts with session site, request is rejected (`403`).

### 6.2 Staffing route changes (PoC)

- `GET /api/staffing/sites`
  - Returns available site keys/names.
  - Falls back to default site from YAML if DB unavailable.

- `GET /api/staffing/events`
  - Loads config by `siteKey`.
  - Loads per-site event filters.
  - Applies `futureOnly` + filter matching in discovery.
  - Uses site-aware engine read/write calls.

- `POST /api/staffing/events/:eventId/signup`
- `DELETE /api/staffing/events/:eventId/signup`
- `GET /api/staffing/config`
  - All use resolved `siteKey`.

## 7. Frontend Design (Staffing UI PoC)

### 7.1 Site selection

Before staffing login, UI loads available sites from `/api/staffing/sites`.

User picks one site, then logs in. The selected `siteKey` is sent in login payload.

### 7.2 Site-aware calls

After login, staffing event loading and signup/resign calls include `siteKey`.

Session `siteKey` from `/api/auth/status` is used to restore the correct active site after refresh.

## 8. Persistence and Deployment Behavior

### Normal deploy/restart

- Configuration persists in PostgreSQL.
- In-memory caches are rebuilt from DB on first access.

### Clean deploy

With `CLEAN_DEPLOY=true`:

- management tables are reset,
- root admin is recreated,
- system starts from clean baseline.

## 9. Backward Compatibility

- If DB is unavailable, staffing config falls back to YAML template.
- Default site key remains `sra-training`.
- Existing non-staffing features are unaffected by site-aware staffing changes.

## 10. Test Strategy (PoC)

### Implemented / updated

- Auth middleware tests for staffing site context propagation.
- API client tests for staffing login payload including `siteKey`.

### Recommended next additions

1. Staffing route integration tests for site mismatch (`403`) and filter behavior.
2. UI tests for staffing site selection + login flow.
3. Regression tests for YAML fallback behavior when DB is unavailable.

## 11. Open Risks and Follow-ups

1. `GET /api/staffing/sites` is currently public (no auth) for login UX.
   - Acceptable for PoC because it returns only site key/name metadata.
2. Existing legacy/unused staffing UI helpers should be cleaned up in later refactor.
3. Additional observability (per-site metrics and audit events) is recommended for production hardening.

## 12. Proof of Concept Completion Checklist

- [x] Management schema documented.
- [x] Site-aware config loading and filter helper layer implemented.
- [x] Staffing auth captures siteKey in session metadata.
- [x] Auth middleware exposes normalized `req.staffingSiteKey`.
- [x] Staffing routes use site-aware engine/config calls.
- [x] Staffing UI uses site selector and passes `siteKey`.
- [x] Requirements updated with Release 7.1 entries.
- [ ] Full route-level integration tests for staffing multi-site behavior.
