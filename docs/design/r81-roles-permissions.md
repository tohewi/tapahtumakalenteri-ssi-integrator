# R8.1 Roles & Permissions Design

Status: **Draft** — design phase (MP1)
Related: `r81-vision-wireframes.md`, `requirements.md` (R8.1)

---

## 1. Existing Access Control (As-Is Inventory)

The current system has **four separate mechanisms**, none of which is a real role model:

### 1.1 Session scopes (auth-v7)

Defined in `apps/scoring-app/routes/auth-v7.js`:

```js
const validScopes = ['scoring', 'manage', 'reporting', 'staffing']
```

- Scope is **chosen by the user at login**, not derived from identity.
- Any valid SSI user can pick `scoring`, `manage`, or `reporting` — there is no
  authorization beyond "has SSI credentials".
- `staffing` is the only gated scope: login is rejected unless the email is on
  the instructor allowlist (`isAdminEmail()` → `adminAllowlist` in config).
- Scope TTLs: default session TTL; `staffing` overrides to 5 minutes
  (`packages/ssi-core/lib/session/config.js`).
- Enforced via `requireAuthV7(allowedScopes)` / `requireScopeV7()` in
  `packages/ssi-core/lib/auth/middleware.js`.

### 1.2 Device tokens (scoring)

- Pre-provisioned tokens for range devices (`DeviceTokens.jsx` UI).
- Validating a token creates a session with hardcoded `scope: 'scoring'`.
- No user identity — the token *is* the identity (label only).

### 1.3 Staffing event roles (config-driven)

Defined in `config/sra-training-config.yml` → `roles:`

| Key | Label (fi/en) | Maps to SSI role | Constraints |
|-----|---------------|------------------|-------------|
| `staff` | Vetäjä / Instructor | — | |
| `leadInstructor` | Vastuuvetäjä / Lead Instructor | Match director | required, max 1/event |
| `equipmentManager` | Kalustovastaava / Equipment Manager | Quarter master | required, max 1/event |

Plus:
- `adminAllowlist` — emails allowed to sign up as staff
- `serviceAccounts` — automation identities excluded from staffing lists

These are **per-event assignments**, not system roles.

### 1.4 SSI-side roles (external)

SSI itself has match roles: Admin, Assistant, Staff, Match director,
Quarter master. We sync to them but do not derive app permissions from them.

### 1.5 Gaps

- No concept of *who may do what* — scope is self-selected.
- Admin functionality (cup management, device token provisioning) is open to
  any SSI account holder.
- Public flows (self-registration) bypass auth entirely by design — fine, but
  undocumented as a "role".
- Acknowledged debt: RBAC/ABAC listed as future work in architecture review.

---

## 2. R8.1 Role Model (To-Be)

### 2.1 Design principles

1. **Roles are derived from identity, not chosen at login.** Login determines
   what you can do; the UI adapts.
2. **Event-scoped vs. system-scoped.** System roles grant platform access;
   event roles (lead instructor, scorer-for-event) are assignments within one
   event. Both coexist.
3. **Reuse existing mechanisms.** Allowlists + device tokens + SSI sync stay;
   they become *role sources* instead of ad-hoc checks.
4. **Progressive disclosure in UI.** Same pages, role-filtered tabs/actions —
   no parallel UIs per role.

### 2.2 System roles

| Role | Who | Identity source | Auth mechanism |
|------|-----|----------------|----------------|
| **`platform-admin`** | Club officers / tool maintainers | Admin allowlist (config) | SSI login (dual-session) |
| **`event-manager`** | Tenant's event organizers (per-tenant role) | Manager allowlist (UI-managed) — new | SSI login (dual-session) |
| **`staff`** | SRA instructors | Instructor allowlist (existing `adminAllowlist`) | SSI login |
| **`scorer`** | Range officers / shared devices | Device token | Device token (no SSI login) |
| **`shooter`** | Registered competitors | Own identity: email (+ first/last, optional phone) | Email-based identity; SSI account optional |
| **`anonymous`** | Public | — | None |

Notes:
- `platform-admin` ⊃ `event-manager` ⊃ `staff` for permission inheritance.
- `event-manager` is a **per-tenant** role: every tenant (club/organization)
  has this role, and persons holding it can manage that tenant's events.
- **Multi-tenancy is in scope** (decided): the platform is multi-tenant, with
  tenant registration and a platform-admin tool for managing tenants. All
  role allowlists (`eventManagers`, instructor lists) are tenant-scoped;
  `platform-admin` is the only cross-tenant role. Detailed multi-tenancy
  specs (tenant management admin tool, tenant registration flow) are
  maintained separately and referenced here once added to the repo.
- `scorer` is intentionally *not* a person — it is a device identity scoped to
  scoring endpoints only (matches current behavior).
- Service accounts remain excluded from all people lists.

### 2.2.1 Shooter identity strategy (decided)

The platform moves **gradually toward its own identities**, with email as the
identifier. SSI remains the backend for event activity, but is no longer the
identity provider for participants:

- A shooter can register to an event with **email + first/last name +
  optional phone**, without an SSI account.
- Non-SSI shooters **participate but are not scored in SSI** — the platform
  knows they will attend, but their results are not pushed to SSI.
- Shooters with linked SSI accounts get full scoring in SSI as today.
- Implication: registration records need an `ssiLinked: boolean` (or SSI
  user reference) so squadding/scoring flows can distinguish the two.
- **Authentication: magic link** (decided). Email-identified shooters log in
  via a magic link sent to their email — no password. This enables "My
  registrations" without SSI credentials.

### 2.3 Event-scoped roles (unchanged, clarified)

Assignments within a single event, managed in the Personnel tab:

| Event role | Granted to | Source |
|------------|-----------|--------|
| **Match Director (Vastuuvetäjä)** | one person per match | personnel assignment (MP3) |
| Equipment Manager (Kalustovastaava) | one `staff` member | staffing engine |
| Instructor (Vetäjä) | `staff` members | staffing signup |
| Scorer-for-event | device token bound to event | device token provisioning |

**`event-manager` vs. Match Director:** these are distinct. `event-manager`
is a system role (tenant-level, allowlist-managed) — can create and manage
any of the tenant's events. **Match Director** is an event-scoped assignment —
the person in charge of *one specific match* (today's `leadInstructor` /
Vastuuvetäjä in `sra-training-config.yml`, synced to SSI "Match director").
A Match Director does not need the `event-manager` system role; their
authority is limited to the match they are assigned to.

**Match Director permissions are delegated to SSI** (decided): the Match
Director's capabilities (edit squads, register competitors, score, close
scoring, etc.) come from the SSI "Match director" role and whatever
permissions SSI grants for that event. This platform does **not** extend or
duplicate those permissions outside SSI — it only assigns the role (personnel
sync) and lets SSI enforce it. No Match Director row is needed in the
platform permission matrix (§2.4).

### 2.4 Permission matrix

Feature codes follow R8.1 (MP1–MP7).

| Capability | anonymous | shooter | staff | scorer | event-manager | platform-admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View public event calendar | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Self-register to event (MP5) | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| View own registrations | — | ✅ | ✅ | — | ✅ | ✅ |
| View results / reports (public) | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Staffing signup / resign (MP3) | — | — | ✅ | — | ✅ | ✅ |
| View own staff schedule | — | — | ✅ | — | ✅ | ✅ |
| Enter scores (MP6) | — | — | — | ✅ | ✅ | ✅ |
| Create / edit events (MP4) | — | — | — | — | ✅ | ✅ |
| Manage squads & registrations (MP4/MP5) | — | — | — | — | ✅ | ✅ |
| Manage personnel assignments (MP3) | — | — | — | — | ✅ | ✅ |
| Generate admin reports (MP7) | — | — | — | — | ✅ | ✅ |
| Manage training type templates (MP2) | — | — | — | — | — | ✅ |
| Provision device tokens | — | — | — | — | — | ✅ |
| Edit allowlists / config | — | — | — | — | — | ✅ |
| Platform settings (MP1) | — | — | — | — | — | ✅ |

### 2.5 UI behavior per role

| Role | Landing view | Visible navigation |
|------|-------------|--------------------|
| `anonymous` | Public event list (read-only) | Events, Results |
| `shooter` | Public event list + "My registrations" | Events, My Registrations, Results |
| `staff` | Event list + staffing status | Events, My Schedule, Staffing |
| `scorer` | Direct to scoring view (token deep link) | none (kiosk-style) |
| `event-manager` | Match Manager (current prototype) | Events, Calendar, Templates (read) |
| `platform-admin` | Match Manager full | + Templates (edit), Admin |

Event Detail tabs are filtered:

| Tab | shooter | staff | event-manager | platform-admin |
|-----|:-:|:-:|:-:|:-:|
| Overview | ✅ (public info) | ✅ | ✅ | ✅ |
| Personnel | — | ✅ (own role only) | ✅ | ✅ |
| Registration | ✅ (self only) | ✅ (self only) | ✅ | ✅ |
| Scoring | — | — | ✅ | ✅ |
| Reports | — | — | ✅ | ✅ |

---

## 3. Migration from Scopes to Roles

### 3.1 Mapping

| Current scope | Becomes |
|---------------|---------|
| `scoring` (user login) | `event-manager` capability (score entry stays available to managers) |
| `scoring` (device token) | `scorer` role |
| `manage` | `event-manager` role |
| `reporting` | `event-manager` capability |
| `staffing` | `staff` role |

### 3.2 Session changes

- Session gains `role` (derived at login) alongside legacy `scope`
  (kept for backward compatibility during transition).
- Role resolution order at login:
  1. email ∈ `platformAdmins` (new config list) → `platform-admin`
  2. email ∈ `eventManagers` (new config list) → `event-manager`
  3. email ∈ `adminAllowlist` (existing) → `staff`
  4. otherwise → `shooter`
- Device-token sessions → `scorer`, no change to flow.
- Middleware: add `requireRole(minRole)` to `packages/ssi-core/lib/auth/`,
  alongside (not replacing) `requireScopeV7`.

### 3.3 Config changes

Extend config (new `match-manager` section or new file):

```yaml
roles:
  platformAdmins:
    - "tohewi@live.com"
  eventManagers:
    - "..."
  # staff list = existing adminAllowlist (rename later: instructorAllowlist)
```

**Allowlist management is UI-based in R8.1** (decided): the Admin section
(MP1) includes screens for managing `platformAdmins`, `eventManagers`, and
the instructor list. Config files remain the storage backend initially, but
editing happens through the UI — no manual file edits required for role
administration.

### 3.4 Phasing

| Phase | Work |
|-------|------|
| 1 | Add role derivation at login + `role` in session; UI reads role for nav filtering (frontend-only gating) |
| 2 | `requireRole()` middleware on match-manager-app endpoints (backend enforcement) |
| 3 | Public/anonymous event list view (new) |
| 4 | Migrate scoring-app routes from scope checks to role checks; deprecate scope selection in login UI |

---

## 4. Resolved Questions (2026-06-10)

1. **Shooter identity:** ✅ Own identities, email as identifier. SSI optional —
   non-SSI shooters can register (email, first/last, phone) and participate,
   but are not scored in SSI. See §2.2.1.
2. **Role administration UI:** ✅ Allowlists are UI-managed in R8.1 (Admin
   section, MP1). See §3.3.
3. **`event-manager` derivation:** ✅ Allowlist (UI-managed), per tenant.
   Match Director (Vastuuvetäjä) stays a separate event-scoped role for the
   person in charge of an individual match. See §2.3.

## 5. Resolved Questions, Round 2 (2026-06-10)

1. **Tenant model:** ✅ Multi-tenant. Tenant registration and a tenant
   management admin tool are specified (specs to be added to repo). All
   allowlists are tenant-scoped; `platform-admin` is cross-tenant. See §2.2.
2. **Shooter accounts:** ✅ Magic link login for email-identified shooters
   (no password). See §2.2.1.
3. **Match Director permissions:** ✅ Delegated to SSI — the SSI "Match
   director" role defines what they can do for the event (edit squads,
   register competitors, score, close scoring). Not extended outside SSI.
   See §2.3.

## 6. Data Store (decided 2026-06-10)

**PostgreSQL is the platform data store.** This resolves the remaining
implementation questions:

1. **Tenant data isolation:** tenant-aware PostgreSQL schema — all platform
   tables carry a `tenant_id`; queries are tenant-scoped. Role allowlists,
   training type templates, and event metadata move from YAML config files
   into Postgres (config files remain only for deployment-level settings).
   Sessions carry `tenantId`.
2. **Magic link infrastructure:** magic link tokens (single-use, expiring)
   stored in Postgres; email delivery via existing Resend integration
   (`lib/email.js`). Successful validation creates a `shooter` role session.
3. **Identity records:** shooter identities (email, first/last, phone,
   optional SSI link) are Postgres rows — the foundation of the "own
   identities" strategy (§2.2.1).

Note: PostgreSQL is **not yet provisioned** — `render.yaml` currently defines
only the web services and Redis (sessions). Adding a Render Postgres instance
is an R8.1 infrastructure task. Redis remains for sessions/caching; Postgres
holds durable platform data (tenants, identities, roles, registrations,
templates).

## 7. Remaining Open Questions

1. **Multi-tenancy spec location:** tenant management and registration specs
   referenced in §5 need to be added to `docs/` (or linked) so R8.1 design
   work can build on them.
2. **Schema design:** initial Postgres schema (tenants, users/identities,
   roles, magic link tokens, registrations) — to be drafted as part of R8.1
   design phase.
