# Release 8.1 — Public Registration Buffer

**Created:** 2026-05-23  
**Status:** 📋 Specified  
**Scope:** Requirements and design only. No runtime code changes in this PR.  
**Product variant:** Current `main`-based TurRes SSI tools product. Do not mix with the separate R80 platform product branch.

---

## Background

The current public registration flow (`#/register`) assumes that the shooter already has a Shoot'n Score It (SSI) account. The backend immediately attempts to add the shooter to the Cup and to the component matches, then assigns the selected squad. If SSI cannot find the email address, the flow fails and asks the shooter to register with SSI first.

This is not enough for Kupittaa Cup operating practice. Some shooters do not have an SSI account, but they still need to be accepted into the real event participant list and assigned to the correct day/squad group. Therefore the application needs an own persistent registration buffer. SSI becomes a synchronization target, not the source of truth for total attendance.

---

## Product Boundary

This release is for the existing `main` product variant:

- public Kupittaa Cup registration (`#/register`)
- SSI-backed squadding automation
- Render-hosted TurRes SSI tools

The R80 branch contains a different platform product variant with PostgreSQL usage patterns. R80 may be used as a reference for PostgreSQL connection, schema initialization, and testing style, but R8.1 must not copy unrelated platform product concepts into the current product unless explicitly approved.

---

## Goals

1. Make the application's own database the authoritative list of all public registrations.
2. Allow registration even when the shooter does not have an SSI account.
3. Preserve the existing successful SSI automation for shooters who can be found in SSI.
4. Track SSI synchronization state separately from registration acceptance.
5. Show organizers the true participant count per Cup and per squad.
6. Keep the public registration flow simple and Finnish-language first.
7. Keep SSI internals hidden from public users.

---

## Non-Goals

The first implementation of this release must not attempt to solve all surrounding platform needs:

- No merge from R80 platform branch.
- No tenant/account platform model unless separately approved.
- No replacement of existing scoring or management features.
- No hard dependency on creating SSI user accounts automatically.
- No browser automation from the end user's browser.
- No iframe embedding of SSI.
- No exposure of SSI participant IDs, match IDs, squad IDs, or admin details in public API responses.

---

## Requirements

### R81 Functional Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R81-REG1 | **Persistent Registration Buffer**: Every public registration submission must be stored first in PostgreSQL before any SSI synchronization attempt. | HIGH | 📋 Specified |
| R81-REG2 | **SSI Account Optional**: The public form must allow the shooter to indicate whether they have an SSI account, do not have one, or are unsure. SSI email remains optional for non-SSI registrations. | HIGH | 📋 Specified |
| R81-REG3 | **Authoritative Attendance Count**: Cup and squad capacity checks must count active buffered registrations, not only SSI competitors. SSI data may be shown as synchronization state, but not used as the sole source of attendance. | HIGH | 📋 Specified |
| R81-REG4 | **Squad Selection Stored Locally**: Selected squad must be persisted in the buffer even when SSI synchronization is not possible. | HIGH | 📋 Specified |
| R81-REG5 | **Best-Effort SSI Sync**: If the shooter provides an SSI email and can be found in SSI, the backend should attempt the existing Cup + component match registration and squad assignment flow. | HIGH | 📋 Specified |
| R81-REG6 | **Non-SSI Success Result**: If the shooter has no SSI account or cannot be found in SSI, the public registration must still succeed locally and show a clear confirmation that the organizer has received the registration. | HIGH | 📋 Specified |
| R81-REG7 | **Re-registration / Update**: A returning shooter must be able to update their squad or SSI-account answer without creating duplicate active registrations for the same Cup and email/identity. | MEDIUM | 📋 Specified |
| R81-REG8 | **Organizer View**: Organizers must be able to view all active buffered registrations grouped by Cup and squad, including SSI sync status. | HIGH | 📋 Specified |
| R81-REG9 | **CSV Export**: Organizers must be able to export the full buffered participant list for range-day fallback use. | HIGH | 📋 Specified |
| R81-REG10 | **Manual Status Changes**: Organizers must be able to mark a registration cancelled, confirmed, waitlisted, or manually handled. | MEDIUM | 📋 Specified |
| R81-REG11 | **Manual Sync Retry**: Organizers must be able to retry SSI synchronization for failed or pending registrations. | MEDIUM | 📋 Specified |
| R81-REG12 | **Scheduled Sync Candidate Model**: The design must support hourly or otherwise scheduled SSI synchronization, but the MVP may start with synchronous submit-time sync plus manual retry. | MEDIUM | 📋 Specified |
| R81-REG13 | **Confirmation Email**: Confirmation email must reflect whether the registration is fully synchronized to SSI, locally registered only, or pending sync. Email failure must not fail the registration. | MEDIUM | 📋 Specified |
| R81-REG14 | **WordPress/Tapahtumakalenteri Entry Point**: Event pages should link to the registration tool with optional Cup/date/squad URL parameters. The app must support preselection when parameters are present. | LOW | 📋 Specified |

### R81 Data Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R81-DATA1 | **PostgreSQL Storage**: Registration buffer data must be stored in PostgreSQL, not Redis. Redis remains suitable for sessions/cache only. | HIGH | 📋 Specified |
| R81-DATA2 | **EU Hosting**: Database and any additional storage used by this release must remain in Europe, consistent with project deployment constraints. | HIGH | 📋 Specified |
| R81-DATA3 | **Schema Isolation Compatibility**: Design should be compatible with PR preview schema isolation using a `DB_SCHEMA`-style approach if preview environments share a database. | MEDIUM | 📋 Specified |
| R81-DATA4 | **Idempotency**: Repeated submit or retry operations must not create duplicate active registrations or duplicate SSI side effects where preventable. | HIGH | 📋 Specified |
| R81-DATA5 | **Audit Trail**: Store registration lifecycle events and SSI sync attempts for troubleshooting and accountability. | MEDIUM | 📋 Specified |
| R81-DATA6 | **Minimal PII**: Store only data needed to operate the event: name, email, phone if required, SSI-account answer, selected Cup/squad, status, and sync state. | HIGH | 📋 Specified |

### R81 Security Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R81-SEC1 | **No Public Participant Listing**: Public endpoints must not expose registration lists, names, emails, or counts that enable participant enumeration beyond existing aggregate capacity indicators. | HIGH | 📋 Specified |
| R81-SEC2 | **Rate Limiting**: Existing public registration rate limiting and captcha protections must continue to apply to buffered submissions. | HIGH | 📋 Specified |
| R81-SEC3 | **Input Validation**: Public inputs must remain strictly validated. New optional fields must have explicit max lengths and allowed values. | HIGH | 📋 Specified |
| R81-SEC4 | **Organizer Authentication**: Organizer list, CSV export, status changes, and sync retry endpoints must require authenticated management access. | HIGH | 📋 Specified |
| R81-SEC5 | **Sanitized Errors**: SSI errors and database errors must be logged server-side but shown to public users only as generic, user-safe Finnish messages. | HIGH | 📋 Specified |
| R81-SEC6 | **Privacy-Aware Logs**: Logs must avoid unnecessary PII. Email may be masked in operational logs unless needed for admin troubleshooting. | MEDIUM | 📋 Specified |

### R81 Testing Requirements

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R81-TEST1 | **Route Tests**: Add HTTP contract tests for buffered submit, validation errors, duplicate/update behavior, user-not-found fallback, and organizer endpoints. | HIGH | 📋 Specified |
| R81-TEST2 | **Store Tests**: Add unit tests for registration store functions, including idempotency and status transitions. | HIGH | 📋 Specified |
| R81-TEST3 | **SSI Sync Tests**: Add tests proving that local registration remains successful when SSI sync fails or user is not found. | HIGH | 📋 Specified |
| R81-TEST4 | **UI Tests**: Add tests for the public form states: has SSI account, no SSI account, unsure, success locally only, and success synchronized. | MEDIUM | 📋 Specified |
| R81-TEST5 | **Migration Tests**: If schema initialization/migrations are added, test that they are idempotent and safe to run repeatedly. | MEDIUM | 📋 Specified |

---

## Suggested Implementation Phases

| Phase | Requirements | Outcome |
|-------|--------------|---------|
| Phase 0 | This PR | Requirements and design only. No runtime behavior change. |
| Phase 1 | R81-DATA1, R81-REG1, R81-REG4, R81-TEST2 | PostgreSQL-backed buffer store and tests. |
| Phase 2 | R81-REG2, R81-REG6, R81-SEC2, R81-SEC3, R81-TEST1, R81-TEST4 | Public form supports non-SSI registrations. |
| Phase 3 | R81-REG3, R81-REG8, R81-REG9, R81-SEC4 | Organizer view and CSV export. |
| Phase 4 | R81-REG5, R81-REG11, R81-REG12, R81-TEST3 | SSI sync state machine and retry handling. |
| Phase 5 | R81-REG7, R81-REG13, R81-REG14 | Re-registration polish, emails, URL preselection. |

---

## Open Decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Public identity key | Email only; email + phone; generated token | Use normalized email when provided; for no-email flow require at least email or phone before implementation. |
| Scheduled sync mechanism | Render cron; internal timer; manual only | Start with submit-time sync + manual retry, then add Render cron or scheduled job if operationally needed. |
| Admin UI location | Extend `#/manage`; add `#/registrations`; add separate report page | Prefer a separate management sub-view so public registration buffer stays conceptually distinct from SSI match management. |
| Non-SSI match-day handling | CSV only; manual SSI creation; later self-service SSI account creation | MVP: CSV + organizer status. Later: support manual mapping to SSI participant if created. |
| PostgreSQL layer source | Reuse R80 pattern; add minimal product-specific store | Reuse architectural pattern only; do not merge R80 platform domain model. |

---

## Acceptance Criteria for the First Code PR

The first code PR after this design is acceptable when:

1. Registration data is persisted in PostgreSQL before SSI sync is attempted.
2. A registration can succeed locally even if SSI lookup fails.
3. Existing successful SSI-account flow still works.
4. Capacity calculations use local active registrations.
5. Unit and route tests cover success, duplicate/update, validation, and SSI-failure cases.
6. No R80 platform product code is merged into `main` except explicitly selected PostgreSQL infrastructure patterns.
