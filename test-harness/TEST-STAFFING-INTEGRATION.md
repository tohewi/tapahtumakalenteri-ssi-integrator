# SSI Staffing Integration Test

## Purpose

End-to-end test for the core staff management flow:
**signup → verify SSI state → resign → verify cleanup** for all 3 roles.

This is the authoritative test. It must pass 100% before any staffing changes ship.

## Usage

```bash
node --env-file=scoring-proxy/.env test-harness/test-staffing-e2e.mjs [eventId]
```

Default event: `27394` (TEST TR-SRAN 10.03.2026), test user: `turreskuko1@foo.bar`

## What It Tests

For each role (`staff`, `leadInstructor`, `equipmentManager`):

| Step | Operation | Verifies |
|------|-----------|----------|
| 0 | Admin login (web + JWT) | Credentials work |
| 1 | Event exists | GraphQL access |
| 2 | Pre-test cleanup | Clean starting state |
| 3a | Register to trainer squad (Squad 5) | `ssiRegisterToTrainerSquad` + fallback |
| 3b | Add to management group | `ssiAddToMatchManagement` with correct officials |
| 3c | Verify Squad 5 via GraphQL | User is in Squad 5 with status=a |
| 3d | Verify staff page officials | Correct officials for role (MD/QM/none) |
| 3e | Resign from management group | `ssiRemoveFromMatchManagement` |
| 3f | Delete from trainer squad | `ssiDeleteMatchParticipant` |
| 3g | Verify cleanup | User gone from squad and staff page |

Plus an **edge case**: re-signup after full resign (tests the "Already registered" fallback path).

## Squad 5 Fallback

When SSI returns "Shooter already registered in match for this division" (HTTP 200),
the user is a participant but not assigned to a squad. The test verifies:

1. GraphQL check → not found in any squad (unassigned)
2. Scrape `/event/{ct}/{eventId}/participants/` → find participant ID
3. `ssiSetParticipantSquad(participantId, 5, cookies, 'a', 23)` → assign to Squad 5

## Requirements

- `scoring-proxy/.env` with `SSI_ADMIN_EMAIL`, `SSI_ADMIN_PASSWORD`, `SSI_ADMIN_API_KEY`
- Test event with 5+ squads and a management group
- Test user `turreskuko1@foo.bar` registered in SSI

## Troubleshooting

| Failure | Cause |
|---------|-------|
| Admin login fails | Bad credentials in `.env` |
| Event not found | Wrong event ID or content type |
| Trainer squad fails | Event doesn't have Squad 5, or anti-bot timing |
| Management group fails | Event has no management group configured |
| Officials mismatch | `SSI_ROLE_MAP` out of sync with test expectations |
| Cleanup fails | SSI participant status toggle cycle changed |
