# Registration Buffer Design

**Release:** 8.1 — Public Registration Buffer  
**Status:** Draft design  
**Branch:** `R81-feature-registration-buffer-design`  
**Product variant:** Current `main` TurRes SSI tools product, not the R80 platform product.

---

## 1. Problem Statement

The current `#/register` flow is optimized for shooters who already have an SSI account. It asks for an SSI email, then the backend immediately tries to:

1. add the shooter to the Cup,
2. approve the Cup participant,
3. add the shooter to each component match,
4. assign the selected squad in each match,
5. send a confirmation email.

If SSI cannot find the email, the public registration fails from the user's point of view. Operationally this is wrong for Kupittaa Cup because some valid participants do not have SSI accounts. The organizer still needs a reliable total attendance list and squad grouping.

The design change is:

> The TurRes app owns the public registration list. SSI synchronization is a best-effort downstream process.

---

## 2. Current Flow

```text
WordPress/Tapahtumakalenteri event page
  -> #/register
  -> captcha
  -> Cup selection
  -> squad selection
  -> SSI email
  -> immediate SSI Cup + match + squad operation
  -> success OR user_not_found failure
```

Problems:

- Total attendance is fragmented between SSI and informal/manual registrations.
- Non-SSI participants are not captured in the system.
- Capacity cannot be trusted if it only reads SSI competitors.
- If SSI is temporarily unavailable, a valid registration can fail.
- The organizer lacks a fallback list for range-day operations.

---

## 3. Target Flow

```text
WordPress/Tapahtumakalenteri event page
  -> #/register?cup=150&squad=1  (optional preselection)
  -> captcha
  -> Cup + squad selection
  -> contact + SSI-account answer
  -> persist local registration in PostgreSQL
  -> best-effort SSI sync if possible
  -> user receives confirmation either way
```

Organizer flow:

```text
Authenticated organizer view
  -> select Cup
  -> see all local active registrations grouped by squad
  -> see SSI sync state per registration
  -> export CSV
  -> retry sync or mark manually handled/cancelled
```

---

## 4. Product Boundary

This repository currently contains at least two product directions in branches:

- `main`: current TurRes SSI tools: scoring, registration, management, reports.
- R80 branch/release line: broader match-management/platform product using PostgreSQL and tenant/account concepts.

This design is for the `main` product only. R80 may be used as a reference for PostgreSQL patterns, especially:

- `DATABASE_URL`-controlled database enablement,
- optional PostgreSQL feature availability when no database is configured,
- idempotent schema initialization,
- `DB_SCHEMA`-style preview isolation,
- parameterized `query()` and `withTransaction()` helpers.

The R80 tenant/account/platform model must not be merged into this feature unless explicitly approved.

---

## 5. Data Model

The MVP needs a small product-specific schema. Table names are prefixed with `public_registration_` to avoid collision with future platform tables.

### 5.1 `public_registration_events`

Optional local cache of public event metadata. This table is not the source of SSI event truth, but it provides stable local references and denormalized display fields.

```sql
CREATE TABLE IF NOT EXISTS public_registration_events (
  id                 TEXT PRIMARY KEY,
  ssi_cup_id          TEXT NOT NULL UNIQUE,
  cup_name            TEXT NOT NULL,
  starts_at           TIMESTAMPTZ,
  max_competitors     INT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

MVP option: skip this table and store Cup snapshot directly on each registration. The table becomes useful once organizer views and historical reporting are added.

### 5.2 `public_registrations`

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
  email                  TEXT,
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
```

Suggested status values:

| Status | Meaning |
|--------|---------|
| `confirmed` | Active registration counted in capacity. |
| `waitlisted` | Captured but not counted as confirmed participant unless explicitly configured. |
| `cancelled` | Not active and not counted. |
| `manual_handled` | Organizer handled outside automated sync. Still active unless cancelled. |

Suggested sync status values:

| Sync status | Meaning |
|-------------|---------|
| `not_applicable` | Shooter has no SSI account or organizer chose local-only handling. |
| `pending` | Should be synchronized to SSI. |
| `syncing` | Sync attempt in progress; useful for scheduled workers. |
| `synced` | Cup and component match squadding completed. |
| `partial` | Some SSI operations succeeded, others failed. |
| `failed` | Sync attempted but failed. |
| `manual_needed` | Requires organizer action, e.g. ambiguous identity or missing SSI account. |

Indexes and uniqueness:

```sql
CREATE INDEX IF NOT EXISTS idx_public_registrations_cup
  ON public_registrations (ssi_cup_id);

CREATE INDEX IF NOT EXISTS idx_public_registrations_cup_squad
  ON public_registrations (ssi_cup_id, selected_squad_number);

CREATE INDEX IF NOT EXISTS idx_public_registrations_sync
  ON public_registrations (sync_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_registrations_unique_active_email
  ON public_registrations (ssi_cup_id, LOWER(COALESCE(email, ssi_email)))
  WHERE status != 'cancelled' AND COALESCE(email, ssi_email) IS NOT NULL;
```

Open point: if the no-SSI flow allows no email, a second uniqueness rule is needed. Recommendation: require email for all public registrations and make phone optional. This keeps updates and duplicate prevention practical.

### 5.3 `public_registration_sync_attempts`

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

CREATE INDEX IF NOT EXISTS idx_public_registration_sync_attempts_registration
  ON public_registration_sync_attempts (registration_id);
```

Public responses must not include `details`; it is organizer/debug data.

---

## 6. API Design

All new endpoints use `/api/v1/`.

### 6.1 Public submit

Existing endpoint can be evolved:

```text
POST /api/v1/register/submit
```

Current body:

```json
{
  "cupId": "150",
  "squadNumber": 1,
  "email": "person@example.com",
  "captchaId": "...",
  "captchaAnswer": 42
}
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
- `name`: optional or required depending final UX, max 120 chars.
- `email`: recommended required for all registrations, valid email, max 254 chars.
- `phone`: optional, max 40 chars, safe character allowlist.
- `hasSsiAccount`: enum `yes | no | unsure`.
- `ssiEmail`: required when `hasSsiAccount=yes`, valid email, max 254 chars.
- captcha fields remain as today.

Response examples:

```json
{
  "success": true,
  "registrationStatus": "confirmed",
  "syncStatus": "synced",
  "message": "Ilmoittautuminen onnistui ja SSI-squadiin asettelu onnistui."
}
```

```json
{
  "success": true,
  "registrationStatus": "confirmed",
  "syncStatus": "manual_needed",
  "message": "Ilmoittautuminen vastaanotettu. Järjestäjä käsittelee SSI-ilmoittautumisen tarvittaessa."
}
```

The public result should always be success when the local registration is stored and capacity rules allow it, even if SSI sync fails.

### 6.2 Organizer list

```text
GET /api/v1/register/admin/cups/:cupId/registrations
```

Requires management/admin authentication. Returns grouped registrations or flat list with fields safe for organizer use.

### 6.3 CSV export

```text
GET /api/v1/register/admin/cups/:cupId/registrations.csv
```

Requires management/admin authentication. Exports active registrations with columns:

```text
Cup, Date, Squad, Name, Email, Phone, SSI account answer, SSI email, Local status, SSI sync status, Created at, Notes
```

### 6.4 Status update

```text
PATCH /api/v1/register/admin/registrations/:registrationId
```

Body:

```json
{
  "status": "cancelled",
  "selectedSquadNumber": 2,
  "note": "User called organizer"
}
```

### 6.5 Sync retry

```text
POST /api/v1/register/admin/registrations/:registrationId/sync
```

Requires management/admin authentication. Attempts SSI sync using the current stored data.

---

## 7. Service Design

Recommended modules for the current product:

```text
scoring-proxy/lib/db/postgres.js
scoring-proxy/lib/db/registration-store.js
scoring-proxy/lib/services/registration-buffer-service.js
scoring-proxy/lib/services/registration-sync-service.js
scoring-proxy/routes/registration.js
```

Responsibilities:

### `postgres.js`

- Initialize pool when `DATABASE_URL` exists.
- Return PostgreSQL disabled state if not configured.
- Support `DB_SCHEMA` preview isolation if adopted.
- Expose `query()` and `withTransaction()`.

Use R80 as reference for pattern, not for platform model.

### `registration-store.js`

- Insert/update local registrations.
- Enforce active uniqueness.
- List by Cup/squad.
- Update status.
- Record sync attempts.
- Use parameterized SQL only.

### `registration-buffer-service.js`

- Validate business rules and capacity.
- Build Cup/squad snapshots from existing SSI Cup detail query.
- Store registration before sync.
- Decide initial sync status.
- Return public-safe result messages.

### `registration-sync-service.js`

- Encapsulate existing SSI registration sequence:
  - add to Cup,
  - approve Cup participant,
  - add to matches,
  - set squad.
- Update local sync status and attempt log.
- Never delete or fail the local registration because of SSI failure.

### `routes/registration.js`

Keep route thin:

- parse/validate input,
- captcha/rate limit,
- call service,
- stream or return result.

The current route is already long; implementation should avoid making it larger. If code changes are made, this feature should be a good opportunity to move business logic out of the route.

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

For Cup total:

```sql
SELECT COUNT(*)
FROM public_registrations
WHERE ssi_cup_id = $1
  AND status IN ('confirmed', 'manual_handled')
```

For squad:

```sql
SELECT COUNT(*)
FROM public_registrations
WHERE ssi_cup_id = $1
  AND selected_squad_number = $2
  AND status IN ('confirmed', 'manual_handled')
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

Confirmation messages:

### Synced to SSI

```text
Ilmoittautuminen onnistui.
Sinut on lisätty myös Shoot'n Score It -kilpailuihin ja valittuun squadiin.
```

### Local-only / no SSI account

```text
Ilmoittautuminen vastaanotettu.
Järjestäjä näkee ilmoittautumisesi osallistujalistalla. Sinua ei ole vielä lisätty Shoot'n Score It -järjestelmään.
```

### Pending/manual

```text
Ilmoittautuminen vastaanotettu.
SSI-käsittely vaatii järjestäjän tarkistuksen.
```

Organizer view should show:

```text
Cup total: 23 / 25
SSI synced: 19
Local only/manual: 3
Failed/pending sync: 1
```

Grouped by squad:

```text
Squad 1 / Laina-ase
- Name, email, phone, sync status, local status

Squad 2 / Oma ase
...
```

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

Candidate SQL pattern:

```sql
SELECT *
FROM public_registrations
WHERE sync_status IN ('pending', 'failed')
  AND status IN ('confirmed', 'manual_handled')
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 25;
```

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

UI tests:

- no-SSI path,
- yes-SSI path,
- unsure path,
- preselected Cup/squad URL parameters,
- confirmation variants.

---

## 14. Migration / Rollout Plan

1. Deploy schema and store code behind feature availability checks.
2. Keep existing SSI-only flow functional until buffer flow is ready.
3. Enable buffer writes for new registrations.
4. Change public UI copy to explain local registration.
5. Add organizer list and CSV export before relying on buffer for live events.
6. Enable manual retry.
7. Add scheduled sync only after manual retry proves the state model.

Rollback principle:

- If SSI sync code has issues, local registrations still remain in PostgreSQL.
- Organizer CSV/export is the operational fallback.

---

## 15. Open Questions

1. Should all users be required to provide email even without SSI account?
2. Is phone required for non-SSI participants?
3. Should `waitlisted` count against squad capacity?
4. Should cancellation be public self-service via tokenized link, or organizer-only in MVP?
5. Should the organizer UI live under `#/manage` or a new `#/registrations` route?
6. Which Render PostgreSQL instance/schema should this product variant use?
7. Should the confirmation email include a recommendation to create an SSI account, or avoid that to reduce friction?

---

## 16. Design Decision Summary

| Decision | Selected direction |
|----------|--------------------|
| Source of truth | Local PostgreSQL registration buffer. |
| SSI role | Best-effort synchronization target. |
| Non-SSI participants | Accepted locally and visible to organizer. |
| Capacity | Local active registrations. |
| Organizer fallback | Authenticated list + CSV export. |
| Scheduling | Design for hourly sync; MVP can start with submit-time sync + manual retry. |
| R80 reuse | PostgreSQL infrastructure pattern only, no platform model merge. |
