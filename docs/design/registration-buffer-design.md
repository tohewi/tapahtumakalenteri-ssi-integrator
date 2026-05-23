# Registration Buffer Design

**Release:** 10.0 — Public Registration Buffer  
**Requirement prefix:** R100  
**Status:** Draft design  
**Branch:** `R100-feature-registration-buffer-design`  
**Product variant:** Current `main` TurRes SSI tools product, not the R80 platform product.

---

## 1. Problem Statement

The current `#/register` flow is optimized for shooters who already have an SSI account. It asks for an SSI email, then the backend immediately tries to add the shooter to the Cup, approve the Cup participant, add the shooter to each component match, assign the selected squad in each match, and send a confirmation email.

If SSI cannot find the email, the public registration fails from the user's point of view. Operationally this is wrong for Kupittaa Cup because some valid participants do not have SSI accounts. The organizer still needs a reliable total attendance list, squad grouping, and a way to communicate with every participant by email.

The design change is:

> The TurRes app owns the public registration list. SSI synchronization is a best-effort downstream process.

---

## 2. Target Flow

```text
WordPress/Tapahtumakalenteri event page
  -> #/register?cup=150&squad=1  (optional preselection)
  -> captcha
  -> Cup + squad selection
  -> contact email + SSI-account answer
  -> persist local registration in PostgreSQL
  -> best-effort SSI sync if possible
  -> user receives confirmation either way
```

Organizer flow:

```text
#/reg-management
  -> authenticated organizer view
  -> select Cup
  -> see all local active registrations grouped by squad
  -> see SSI sync state per registration
  -> export CSV
  -> retry sync or mark manually handled/cancelled
```

The MVP should use `#/reg-management` instead of extending `#/manage`. The existing `#/manage` SSI Cup management UI can remain focused on SSI squadding and match management. This keeps the registration buffer MVP smaller and reduces risk.

---

## 3. Product Boundary

This design is for the `main` product only. R80 may be used as a reference for PostgreSQL patterns such as `DATABASE_URL`, optional database availability, idempotent schema initialization, `DB_SCHEMA` preview isolation, parameterized `query()`, and `withTransaction()`. The R80 tenant/account/platform model must not be merged into this feature unless explicitly approved.

---

## 4. Data Model

The MVP needs a small product-specific schema. Table names are prefixed with `public_registration_` to avoid collision with future platform tables.

### 4.1 `public_registrations`

Authoritative local registration row.

```sql
CREATE TABLE IF NOT EXISTS public_registrations (
  id                    TEXT PRIMARY KEY,
  ssi_cup_id             TEXT NOT NULL,
  cup_name_snapshot      TEXT NOT NULL,
  cup_starts_snapshot    TIMESTAMPTZ,

  selected_squad_number  INT NOT NULL,
  selected_squad_label   TEXT,

  shooter_name           TEXT,
  email                  TEXT NOT NULL,
  phone                  TEXT,
  has_ssi_account        TEXT NOT NULL, -- yes, no, unsure
  ssi_email              TEXT,

  status                 TEXT NOT NULL DEFAULT 'confirmed',
  sync_status            TEXT NOT NULL DEFAULT 'pending',
  sync_error_code        TEXT,
  sync_error_message     TEXT,
  last_sync_attempt_at   TIMESTAMPTZ,
  synced_at              TIMESTAMPTZ,

  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_registrations_cup
  ON public_registrations (ssi_cup_id);

CREATE INDEX IF NOT EXISTS idx_public_registrations_cup_squad
  ON public_registrations (ssi_cup_id, selected_squad_number);

CREATE INDEX IF NOT EXISTS idx_public_registrations_sync
  ON public_registrations (sync_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_registrations_unique_active_email
  ON public_registrations (ssi_cup_id, LOWER(email))
  WHERE status != 'cancelled';
```

The `email` field is mandatory for all registrations, including participants without SSI accounts. It is the local identity key and the primary channel for registration confirmations and later organizer communication. `ssi_email` is optional and may differ from contact email when the shooter uses a different email address in SSI.

Suggested local status values: `confirmed`, `waitlisted`, `cancelled`, `manual_handled`.

Suggested sync status values: `not_applicable`, `pending`, `syncing`, `synced`, `partial`, `failed`, `manual_needed`.

### 4.2 `public_registration_sync_attempts`

Append-only troubleshooting/audit log for SSI sync.

```sql
CREATE TABLE IF NOT EXISTS public_registration_sync_attempts (
  id                TEXT PRIMARY KEY,
  registration_id   TEXT NOT NULL REFERENCES public_registrations(id) ON DELETE CASCADE,
  attempt_number    INT NOT NULL,
  trigger           TEXT NOT NULL, -- submit, manual_retry, scheduled
  status            TEXT NOT NULL, -- success, partial, failed
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  error_code        TEXT,
  error_message     TEXT,
  details           JSONB DEFAULT '{}'
);
```

Public responses must not include `details`; it is organizer/debug data.

---

## 5. API Design

All new endpoints use `/api/v1/`.

Public submit can evolve from the current endpoint:

```text
POST /api/v1/register/submit
```

Target body:

```json
{
  "cupId": "150",
  "squadNumber": 1,
  "name": "Matti Meikäläinen",
  "email": "person@example.com",
  "phone": "optional",
  "hasSsiAccount": "yes",
  "ssiEmail": "person@example.com",
  "captchaId": "...",
  "captchaAnswer": 42
}
```

Validation:

- `cupId`: numeric string, 1-10 digits.
- `squadNumber`: integer 1-99.
- `name`: required unless explicitly deferred by UX decision, max 120 chars.
- `email`: required for all registrations, valid email, max 254 chars.
- `phone`: optional, max 40 chars, safe character allowlist.
- `hasSsiAccount`: enum `yes | no | unsure`.
- `ssiEmail`: required when `hasSsiAccount=yes`, valid email, max 254 chars.
- captcha fields remain as today.

Organizer APIs:

```text
GET   /api/v1/register/admin/cups/:cupId/registrations
GET   /api/v1/register/admin/cups/:cupId/registrations.csv
PATCH /api/v1/register/admin/registrations/:registrationId
POST  /api/v1/register/admin/registrations/:registrationId/sync
```

These APIs require management/admin authentication and are surfaced in the UI under `#/reg-management`.

---

## 6. Service Design

Recommended modules for the current product:

```text
scoring-proxy/lib/db/postgres.js
scoring-proxy/lib/db/registration-store.js
scoring-proxy/lib/services/registration-buffer-service.js
scoring-proxy/lib/services/registration-sync-service.js
scoring-proxy/routes/registration.js
```

Responsibilities:

- `postgres.js`: initialize pool, support optional database availability and preview schema isolation, expose `query()` and `withTransaction()`.
- `registration-store.js`: insert/update local registrations, enforce active uniqueness, list by Cup/squad, update status, record sync attempts.
- `registration-buffer-service.js`: validate business rules and capacity, build Cup/squad snapshots, store registration before sync, decide initial sync status, return public-safe messages.
- `registration-sync-service.js`: encapsulate SSI registration sequence and update sync status. It must never delete or fail the local registration because of SSI failure.
- `routes/registration.js`: remain a thin dispatcher. The current file is already long, so implementation should avoid adding more business logic inline.

---

## 7. SSI GraphQL / API Architecture Topic

SSI GraphQL usage must be treated as an architectural concern, not an incidental implementation detail. SSI has recently introduced or tightened API-authentication header requirements, including `x-api-auth` handling in relevant flows, and GraphQL usage has also needed adjustments due to SSI-side performance issues.

Implementation requirements:

- Track every GraphQL query/mutation used by the feature.
- Use named GraphQL operations where possible.
- Ensure the server-side SSI client sends the current required authentication headers, including `x-api-auth` where applicable.
- Never expose SSI auth headers, session cookies, JWTs, or other SSI auth material to the browser.
- Avoid broad nested GraphQL queries in public request paths when a narrower query, local state, or cached Cup snapshot is sufficient.
- Log operation name, duration, success/failure, and sanitized error class for SSI troubleshooting.
- Do not log PII-heavy variables, raw query responses, sensitive headers, or cookies.
- Every code PR that adds or changes SSI GraphQL usage for R100 must include a short "SSI GraphQL usage" note in the PR body.

This topic should be revisited before implementing scheduled sync, because hourly sync can multiply GraphQL/API load if not carefully bounded.

---

## 8. Capacity Rules

Capacity must be calculated from active local registrations.

Recommended active statuses:

```text
confirmed
manual_handled
```

Optional active depending organizer choice:

```text
waitlisted
```

SSI data can still be queried to show sync health and to bootstrap Cup/squad metadata, but it must not be the only attendance count.

---

## 9. UI Design

Public form changes:

1. Captcha remains first.
2. Cup selection remains.
3. Squad selection remains.
4. Contact step changes from "SSI email" to "Yhteystiedot ja SSI-tunnus".

Suggested fields:

```text
Nimi
Sähköposti
Puhelin (vapaaehtoinen)
Onko sinulla Shoot'n Score It -tunnus?
  Kyllä
  Ei
  En tiedä
SSI-sähköposti, jos eri kuin yllä
```

The contact email is mandatory. It is used for confirmation and possible later organizer communication about the event.

Registration management UI:

```text
#/reg-management
```

This route should be implemented as a separate MVP surface instead of extending `#/manage`.

---

## 10. SSI Sync State Machine

```text
local registration created
  -> hasSsiAccount=no/unsure
       -> sync_status = manual_needed or not_applicable
  -> hasSsiAccount=yes
       -> pending
       -> syncing
       -> synced | partial | failed | manual_needed
```

Important rule:

> SSI sync may update `sync_status`, but must not roll back the local registration.

Known failure mapping:

| SSI condition | Local result |
|---------------|--------------|
| User not found | `manual_needed`; public success with organizer-handled message. |
| Cup add succeeds, match squad fails | `partial`; organizer can retry. |
| Admin SSI session unavailable | `failed` or `pending`; organizer retry later. |
| SSI GraphQL degraded or auth-header requirement changed | Local registration succeeds if local capacity allows; sync becomes `failed`/`pending` with sanitized internal error. |
| Capacity conflict detected locally | Public failure before local insert. |
| Duplicate active local registration | Treat as update/re-registration. |

---

## 11. Scheduling Strategy

MVP recommendation:

- Store first.
- Attempt SSI sync during submit for `hasSsiAccount=yes`.
- Provide manual retry in organizer UI.

Later enhancement:

- Add scheduled sync job every hour.
- Process `pending` and retryable `failed` registrations.
- Use row-level locking with `FOR UPDATE SKIP LOCKED` if concurrent workers are possible.
- Bound GraphQL/API usage per run to avoid SSI performance impact.

---

## 12. Deployment Notes

- Use PostgreSQL for durable registration data.
- Use Redis only for sessions/captcha/cache.
- Keep all data stores in Europe.
- If Render preview environments share a PostgreSQL database, adopt schema isolation with `DB_SCHEMA=pr_{number}` or equivalent.
- Production can use `public` schema or a product-specific schema.

Because this PR is design-only, it intentionally does not add Render database configuration or package dependencies.

---

## 13. Test Strategy

Backend route tests:

- submit with SSI account and successful sync,
- submit without SSI account succeeds locally,
- submit with SSI email not found succeeds locally with `manual_needed`,
- duplicate submit updates existing active registration,
- full squad is rejected,
- invalid field values rejected,
- admin endpoints require auth.

Store tests:

- insert registration,
- update/re-register,
- capacity count by Cup and squad,
- status transitions,
- sync attempt logging,
- idempotent migration/init.

SSI GraphQL/API tests:

- required headers are sent by server-side SSI client mocks, including `x-api-auth` where applicable,
- operation names are logged without sensitive header values,
- broad GraphQL payloads are not introduced in public request paths without explicit design justification,
- local registration still succeeds when SSI GraphQL sync fails after the local insert.

UI tests:

- no-SSI path,
- yes-SSI path,
- unsure path,
- preselected Cup/squad URL parameters,
- confirmation variants,
- `#/reg-management` route requires authentication.

---

## 14. Migration / Rollout Plan

1. Deploy schema and store code behind feature availability checks.
2. Keep existing SSI-only flow functional until buffer flow is ready.
3. Enable buffer writes for new registrations.
4. Change public UI copy to explain local registration.
5. Add `#/reg-management` list and CSV export before relying on buffer for live events.
6. Enable manual retry.
7. Add scheduled sync only after manual retry proves the state model and GraphQL/API load is understood.

Rollback principle:

- If SSI sync code has issues, local registrations still remain in PostgreSQL.
- Organizer CSV/export is the operational fallback.

---

## 15. Resolved Decisions

| Decision | Selected direction |
|----------|--------------------|
| Release identifier | Release 10.0 / R100. |
| Contact email | Mandatory for all registrations. |
| Public identity key | Contact email. |
| Organizer UI | New `#/reg-management` route. |
| Source of truth | Local PostgreSQL registration buffer. |
| SSI role | Best-effort synchronization target. |
| Non-SSI participants | Accepted locally and visible to organizer. |
| Capacity | Local active registrations. |
| Organizer fallback | Authenticated list + CSV export. |
| Scheduling | Design for hourly sync; MVP can start with submit-time sync + manual retry. |
| R80 reuse | PostgreSQL infrastructure pattern only, no platform model merge. |
| SSI GraphQL | Explicit tracking, `x-api-auth`/header awareness, and performance monitoring required. |

---

## 16. Remaining Open Questions

1. Is phone required for non-SSI participants, or optional for all participants?
2. Should `waitlisted` count against squad capacity?
3. Should cancellation be public self-service via tokenized link, or organizer-only in MVP?
4. Which Render PostgreSQL instance/schema should this product variant use?
5. Should the confirmation email include a recommendation to create an SSI account, or avoid that to reduce friction?
