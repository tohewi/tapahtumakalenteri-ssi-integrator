# Release 10.0 — Public Registration Buffer

**Created:** 2026-05-23  
**Status:** 📋 Specified  
**Requirement prefix:** R100  
**Scope:** Requirements and design only. No runtime code changes in this PR.  
**Product variant:** Current `main`-based TurRes SSI tools product. Do not mix with the separate R80 platform product branch.

---

## Background

The current public registration flow (`#/register`) assumes that the shooter already has a Shoot'n Score It (SSI) account. The backend immediately attempts to add the shooter to the Cup and to the component matches, then assigns the selected squad. If SSI cannot find the email address, the flow fails and asks the shooter to register with SSI first.

This is not enough for Kupittaa Cup operating practice. Some shooters do not have SSI accounts, but they still need to be accepted into the real event participant list, assigned to the correct day/squad group, and reachable by email for registration-related communication. Therefore the application needs its own persistent registration buffer. SSI becomes a synchronization target, not the source of truth for total attendance.

---

## Product Boundary

This release is for the existing `main` product variant:

- public Kupittaa Cup registration (`#/register`)
- new registration management UI (`#/reg-management`)
- SSI-backed squadding automation
- Render-hosted TurRes SSI tools

The R80 branch contains a different platform product variant with PostgreSQL usage patterns. R80 may be used as a reference for PostgreSQL connection, schema initialization, and testing style, but R10.0/R100 must not copy unrelated platform product concepts into the current product unless explicitly approved.

---

## Goals

1. Make the application's own database the authoritative list of all public registrations.
2. Allow registration even when the shooter does not have an SSI account.
3. Require an email address so organizers can send registration confirmations and operational messages.
4. Preserve the existing successful SSI automation for shooters who can be found in SSI.
5. Track SSI synchronization state separately from registration acceptance.
6. Show organizers the true participant count per Cup and per squad.
7. Keep the public registration flow simple and Finnish-language first.
8. Keep SSI internals hidden from public users.
9. Keep SSI GraphQL/API usage explicit, measured, and adaptable to SSI-side `x-api-auth` header and performance requirements.

---

## Non-Goals

The first implementation of this release must not attempt to solve all surrounding platform needs:

- No merge from R80 platform branch.
- No tenant/account platform model unless separately approved.
- No replacement of existing scoring or SSI Cup management features.
- No large change to the existing `#/manage` SSI Cup management UI in the MVP.
- No hard dependency on creating SSI user accounts automatically.
- No browser automation from the end user's browser.
- No iframe embedding of SSI.
- No exposure of SSI participant IDs, match IDs, squad IDs, GraphQL internals, `x-api-auth` values, or admin details in public API responses.

---

## Requirements

### R100 Functional Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R100-REG1 | **Persistent Registration Buffer**: Every public registration submission must be stored first in PostgreSQL before any SSI synchronization attempt. | HIGH | 📋 Specified |
| R100-REG2 | **SSI Account Optional**: The public form must allow the shooter to indicate whether they have an SSI account, do not have one, or are unsure. SSI email is optional for non-SSI registrations, but contact email is mandatory for all registrations. | HIGH | 📋 Specified |
| R100-REG3 | **Mandatory Contact Email**: Every registration must include a valid contact email address so the organizer can send confirmations and operational messages. | HIGH | 📋 Specified |
| R100-REG4 | **Authoritative Attendance Count**: Cup and squad capacity checks must count active buffered registrations, not only SSI competitors. SSI data may be shown as synchronization state, but not used as the sole source of attendance. | HIGH | 📋 Specified |
| R100-REG5 | **Squad Selection Stored Locally**: Selected squad must be persisted in the buffer even when SSI synchronization is not possible. | HIGH | 📋 Specified |
| R100-REG6 | **Best-Effort SSI Sync**: If the shooter provides an SSI email and can be found in SSI, the backend should attempt the existing Cup + component match registration and squad assignment flow. | HIGH | 📋 Specified |
| R100-REG7 | **Non-SSI Success Result**: If the shooter has no SSI account or cannot be found in SSI, the public registration must still succeed locally and show a clear confirmation that the organizer has received the registration. | HIGH | 📋 Specified |
| R100-REG8 | **Re-registration / Update**: A returning shooter must be able to update their squad or SSI-account answer without creating duplicate active registrations for the same Cup and contact email. | MEDIUM | 📋 Specified |
| R100-REG9 | **Registration Management UI**: Organizers must be able to view all active buffered registrations under a new `#/reg-management` route grouped by Cup and squad, including SSI sync status. The MVP must not depend on extending the existing `#/manage` SSI Cup management UI. | HIGH | 📋 Specified |
| R100-REG10 | **CSV Export**: Organizers must be able to export the full buffered participant list for range-day fallback use. | HIGH | 📋 Specified |
| R100-REG11 | **Manual Status Changes**: Organizers must be able to mark a registration cancelled, confirmed, waitlisted, or manually handled. | MEDIUM | 📋 Specified |
| R100-REG12 | **Manual Sync Retry**: Organizers must be able to retry SSI synchronization for failed or pending registrations. | MEDIUM | 📋 Specified |
| R100-REG13 | **Scheduled Sync Candidate Model**: The design must support hourly or otherwise scheduled SSI synchronization, but the MVP may start with synchronous submit-time sync plus manual retry. | MEDIUM | 📋 Specified |
| R100-REG14 | **Confirmation and Operational Email**: Confirmation email must reflect whether the registration is fully synchronized to SSI, locally registered only, or pending sync. The stored contact email may also be used for later organizer communication about the event. Email failure must not fail the registration. | HIGH | 📋 Specified |
| R100-REG15 | **WordPress/Tapahtumakalenteri Entry Point**: Event pages should link to the registration tool with optional Cup/date/squad URL parameters. The app must support preselection when parameters are present. | LOW | 📋 Specified |

### R100 Data Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R100-DATA1 | **PostgreSQL Storage**: Registration buffer data must be stored in PostgreSQL, not Redis. Redis remains suitable for sessions/cache only. | HIGH | 📋 Specified |
| R100-DATA2 | **EU Hosting**: Database and any additional storage used by this release must remain in Europe, consistent with project deployment constraints. | HIGH | 📋 Specified |
| R100-DATA3 | **Schema Isolation Compatibility**: Design should be compatible with PR preview schema isolation using a `DB_SCHEMA`-style approach if preview environments share a database. | MEDIUM | 📋 Specified |
| R100-DATA4 | **Idempotency**: Repeated submit or retry operations must not create duplicate active registrations or duplicate SSI side effects where preventable. | HIGH | 📋 Specified |
| R100-DATA5 | **Audit Trail**: Store registration lifecycle events and SSI sync attempts for troubleshooting and accountability. | MEDIUM | 📋 Specified |
| R100-DATA6 | **Minimal PII**: Store only data needed to operate the event and communicate with participants: name, contact email, phone if required, SSI-account answer, SSI email if provided, selected Cup/squad, status, and sync state. | HIGH | 📋 Specified |

### R100 SSI GraphQL / API Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R100-GQL1 | **Track SSI GraphQL Usage**: The implementation must inventory each SSI GraphQL query/mutation used by the registration buffer and document why it is needed. | HIGH | 📋 Specified |
| R100-GQL2 | **Respect `x-api-auth` Requirements**: SSI GraphQL calls must use the current authentication/header requirements, including recent `x-api-auth` expectations where applicable. Header values must remain server-side only. | HIGH | 📋 Specified |
| R100-GQL3 | **Performance-Aware GraphQL**: GraphQL queries must request only the fields needed by the registration flow. Avoid broad nested queries in public endpoints if a narrower query or cached snapshot is sufficient. | HIGH | 📋 Specified |
| R100-GQL4 | **GraphQL Usage Logging**: Log query operation names, success/failure, duration, and sanitized error class for troubleshooting SSI performance issues. Do not log PII-heavy variables or sensitive headers. | MEDIUM | 📋 Specified |
| R100-GQL5 | **Fallback Boundary**: If SSI GraphQL is degraded, local registration must still succeed when capacity can be checked from local state or a recent safe snapshot. The design must clearly distinguish local registration success from SSI sync success. | HIGH | 📋 Specified |
| R100-GQL6 | **Implementation Review Checkpoint**: Any future code PR that adds or changes SSI GraphQL usage for this feature must include a short GraphQL usage note in the PR description. | MEDIUM | 📋 Specified |

### R100 Security Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R100-SEC1 | **No Public Participant Listing**: Public endpoints must not expose registration lists, names, emails, or counts that enable participant enumeration beyond aggregate capacity indicators. | HIGH | 📋 Specified |
| R100-SEC2 | **Rate Limiting**: Existing public registration rate limiting and captcha protections must continue to apply to buffered submissions. | HIGH | 📋 Specified |
| R100-SEC3 | **Input Validation**: Public inputs must remain strictly validated. New fields must have explicit max lengths and allowed values. | HIGH | 📋 Specified |
| R100-SEC4 | **Organizer Authentication**: `#/reg-management`, organizer list APIs, CSV export, status changes, and sync retry endpoints must require authenticated management access. | HIGH | 📋 Specified |
| R100-SEC5 | **Sanitized Errors**: SSI, GraphQL, and database errors must be logged server-side but shown to public users only as generic, user-safe Finnish messages. | HIGH | 📋 Specified |
| R100-SEC6 | **Privacy-Aware Logs**: Logs must avoid unnecessary PII. Email may be masked in operational logs unless needed for admin troubleshooting. | MEDIUM | 📋 Specified |

### R100 Testing Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R100-TEST1 | **Route Tests**: Add HTTP contract tests for buffered submit, validation errors, duplicate/update behavior, user-not-found fallback, and organizer endpoints. | HIGH | 📋 Specified |
| R100-TEST2 | **Store Tests**: Add unit tests for registration store functions, including idempotency and status transitions. | HIGH | 📋 Specified |
| R100-TEST3 | **SSI Sync Tests**: Add tests proving that local registration remains successful when SSI sync fails or user is not found. | HIGH | 📋 Specified |
| R100-TEST4 | **UI Tests**: Add tests for the public form states: has SSI account, no SSI account, unsure, success locally only, and success synchronized. | MEDIUM | 📋 Specified |
| R100-TEST5 | **Migration Tests**: If schema initialization/migrations are added, test that they are idempotent and safe to run repeatedly. | MEDIUM | 📋 Specified |
| R100-TEST6 | **GraphQL Header and Performance Tests**: Add tests/mocks that verify required SSI GraphQL headers are sent by the server-side SSI client and broad GraphQL payloads are not introduced accidentally. | MEDIUM | 📋 Specified |

---

## Suggested Implementation Phases

| Phase | Requirements | Outcome |
|-------|--------------|---------|
| Phase 0 | This PR | Requirements and design only. No runtime behavior change. |
| Phase 1 | R100-DATA1, R100-REG1, R100-REG5, R100-TEST2 | PostgreSQL-backed buffer store and tests. |
| Phase 2 | R100-REG2, R100-REG3, R100-REG7, R100-SEC2, R100-SEC3, R100-TEST1, R100-TEST4 | Public form supports mandatory contact email and non-SSI registrations. |
| Phase 3 | R100-REG4, R100-REG9, R100-REG10, R100-SEC4 | Separate `#/reg-management` organizer view and CSV export. |
| Phase 4 | R100-REG6, R100-REG12, R100-REG13, R100-GQL1..GQL6, R100-TEST3, R100-TEST6 | SSI sync state machine, GraphQL usage discipline, and retry handling. |
| Phase 5 | R100-REG8, R100-REG14, R100-REG15 | Re-registration polish, emails, URL preselection. |

---

## Open Decisions

| Decision | Selected direction |
|----------|--------------------|
| Release identifier | Use Release 10.0 / R100. |
| Public identity key | Contact email is mandatory for all registrations and is the primary local identity key. |
| Organizer UI location | Use a new `#/reg-management` route for the MVP. Do not extend existing `#/manage` unless later approved. |
| Scheduled sync mechanism | Start with submit-time sync + manual retry, then add Render cron or scheduled job if operationally needed. |
| Non-SSI match-day handling | MVP: CSV + organizer status. Later: support manual mapping to SSI participant if created. |
| PostgreSQL layer source | Reuse R80 architectural pattern only; do not merge R80 platform domain model. |
| SSI GraphQL handling | Track every GraphQL operation; keep `x-api-auth` and performance requirements explicit in implementation PRs. |

---

## Acceptance Criteria for the First Code PR

The first code PR after this design is acceptable when:

1. Registration data is persisted in PostgreSQL before SSI sync is attempted.
2. A registration can succeed locally even if SSI lookup fails.
3. Contact email is required and stored for all registrations.
4. Existing successful SSI-account flow still works.
5. Capacity calculations use local active registrations.
6. Unit and route tests cover success, duplicate/update, validation, and SSI-failure cases.
7. Any SSI GraphQL usage touched by the PR is listed in the PR description, including `x-api-auth`/header considerations and performance notes.
8. No R80 platform product code is merged into `main` except explicitly selected PostgreSQL infrastructure patterns.
