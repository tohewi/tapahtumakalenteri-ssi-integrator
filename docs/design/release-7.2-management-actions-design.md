# Release 7.2 — Management Actions Design (MGMT2, MGMT3)

## 1. Scope

This document defines implementation design for Release 7.2 management actions:

- **MGMT2**: Move squadded shooter to another squad.
- **MGMT3**: Set/undo DNS (Did Not Start).

Confirmed constraints:

1. Move is available only in **"Squadit"** section.
2. Move must enforce squad limits strictly (target squad must have room).
3. DNS must be applied to both **CUP** and **all component matches**.
4. DNS must be reversible in UI.
5. DNS shooters remain visible in squad with DNS flag, but do not consume active squad capacity.

---

## 2. Current Baseline

Current management flow already has:

- Read model from `GET /api/manage/cup/:id` (`scoring-proxy/routes/management.js`)
- Management actions:
  - `POST /assign-squad`
  - `POST /fix-squad`
  - `POST /add-to-cup`
  - `POST /approve-pending`
  - `POST /remove-pending`
- SSI write helpers in `scoring-proxy/lib/ssi-core/client.js`:
  - `ssiSetParticipantSquad(...)`
  - `ssiSetMatchParticipantStatus(...)`
  - `ssiFindAndApproveCupParticipant(...)`
  - `ssiFindAndDeleteCupParticipant(...)`

Release 7.2 extends this with move + DNS flows using same architectural pattern (GraphQL read + SSI admin web form writes).

---

## 3. Read Model Extensions (`GET /api/manage/cup/:id`)

To support strict, ID-safe actions and DNS visibility, response model is extended per shooter.

### 3.1 Shooter object additions

Each shooter in `shooters[]` should include:

- `cupParticipantId` (if exists)
- `matchParticipants`: array of `{ matchId, participantId, status, squadNumber }`
- `isDns`: `true` if shooter is DNS in all included matches
- `dnsByMatch`: `{ [matchId]: boolean }`

### 3.2 Squad occupancy model

Each squad in `matches[].squads[]` should include two counts:

- `activeCount`: participants with status `a` (scorable)
- `displayCount`: participants shown in UI (active + DNS)

Capacity enforcement uses **`activeCount`**, not `displayCount`.

### 3.3 DNS display rule

Squad shooters must include DNS competitors in returned list so they stay visible in Squad cards.

---

## 4. MGMT2 — Move Squadded Shooter

## 4.1 UI behavior

- Action is shown only in **Squadit** section rows.
- Per shooter action button: `Siirrä`.
- Button opens squad picker sheet (reuse existing picker UX).
- Current squad is disabled/highlighted as current.
- Full target squads are disabled in picker.

## 4.2 API contract

`POST /api/manage/cup/:cupId/move-squadded`

Request:

```json
{
  "shooterName": "Matti Meikäläinen",
  "email": "matti@example.com",
  "targetSquad": 2,
  "cupParticipantId": "12345",
  "matchParticipants": [
    { "matchId": "1903", "participantId": "21898" },
    { "matchId": "1904", "participantId": "21901" },
    { "matchId": "1905", "participantId": "21909" }
  ]
}
```

Response:

```json
{
  "success": true,
  "results": [
    { "matchId": "1903", "success": true },
    { "matchId": "1904", "success": true },
    { "matchId": "1905", "success": true }
  ]
}
```

## 4.3 Backend flow

1. Validate `targetSquad` and participant ID payload.
2. Query cup component matches and current squad occupancy.
3. For each match:
   - Validate participant ID belongs to shooter.
   - Validate target squad exists.
   - Compute target `activeCount` excluding moving participant if already in that squad.
4. If any match is full, return `409` with failing match list.
5. If all pass, move in each match via `ssiSetParticipantSquad(participantId, targetSquad, cookies)`.
6. Return per-match result list.

## 4.4 Error policy

- `400`: invalid payload / missing IDs
- `404`: cup or participant not found
- `409`: capacity conflict
- `500`: SSI/admin integration failure

---

## 5. MGMT3 — Set/Undo DNS

## 5.1 UI behavior

- Any visible, approved/squadded shooter gets DNS action.
- Actions:
  - `Aseta DNS` when shooter is active
  - `Poista DNS` when shooter is already DNS
- DNS shooter row stays in same squad card with a `DNS` badge.
- DNS shooter does **not** count toward active capacity.

## 5.2 API contract

`POST /api/manage/cup/:cupId/set-dns`

Request:

```json
{
  "shooterName": "Matti Meikäläinen",
  "email": "matti@example.com",
  "dns": true,
  "cupParticipantId": "12345",
  "matchParticipants": [
    { "matchId": "1903", "participantId": "21898" },
    { "matchId": "1904", "participantId": "21901" },
    { "matchId": "1905", "participantId": "21909" }
  ]
}
```

Undo DNS uses same endpoint with `"dns": false`.

## 5.3 CUP-level status update

CUP participant state is changed via toggle-status URL (content type 137).

Add helper:

- `ssiSetCupParticipantStatus(cupId, participantId, targetStatusTitle, cookies)`

Behavior:

- Reads current status from participants page.
- Follows toggle cycle until target status reached (max 4 toggles).
- Used for:
  - DNS on: target = `Deleted`
  - DNS off: target = `Approved`

## 5.4 Match-level status update

For each component match participant:

- DNS on: set match participant status to DNS-capable non-scorable status.
- DNS off: set status back to `a` (Approved).

Add helper:

- `ssiSetMatchParticipantStatusByLabel(participantId, targetLabel, cookies)`

Rationale: status select values can vary; map by `<option>` label text instead of hardcoded value.

## 5.5 Squad slot release rule

When DNS is set:

- Keep existing squad assignment for visibility.
- Exclude DNS shooters from `activeCount`.

This satisfies both requirements:

- shooter remains visible in squad with DNS flag
- slot is released for active capacity checks

---

## 6. Frontend Component Changes

`scoring-ui/src/components/ManagePage.jsx`:

1. Extend shooter rows with DNS badge rendering.
2. Add new handlers:
   - `handleMoveSquadded(shooter, targetSquad)`
   - `handleSetDns(shooter, dns)`
3. Add API calls in `scoring-ui/src/api.js`:
   - `manageMoveSquadded(...)`
   - `manageSetDns(...)`
4. Reuse existing `runAction(...)` and post-action refresh strategy.

No optimistic updates. Always refresh from backend after action.

---

## 7. Validation and Safety Rules

1. Prefer ID-based operations (`cupParticipantId`, `match participantId`) over name matching.
2. Reject action if ID payload is missing or inconsistent.
3. For move action, perform **pre-checks for all matches first**, then write.
4. If write phase partially fails, return partial result details for operator visibility.
5. Sanitize SSI error messages in production responses.

---

## 8. Test Plan (Design-level)

### MGMT2

- Move from squad 1 -> 2 when all component matches have free capacity.
- Move rejected when one component match target squad is full (`409`).
- Move action not visible outside Squadit section.

### MGMT3

- Set DNS marks CUP + all matches and shows DNS badge in squad row.
- Undo DNS restores CUP + all matches to active.
- DNS shooter stays visible in squad but does not consume active capacity.
- Pending shooter DNS action hidden/blocked.

### Regression coverage

- Existing actions (`assign/fix/add/approve/remove`) still operate unchanged.
- Refresh after action still reloads coherent shooter state.

---

## 9. Rollout Order

1. Read model extension (`GET /api/manage/cup/:id`) + UI DNS rendering.
2. MGMT2 endpoint + UI action.
3. CUP status generic setter helper.
4. MGMT3 endpoint + UI toggle.
5. Integration tests + manual verification in test cup.

This order keeps risk isolated and allows incremental validation.
