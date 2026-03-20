# Shooter Identification Design — SSI Squad Operations

**Date**: 2026-03-03
**Status**: Design — Pending validation
**Problem**: `ssiFindParticipantInEvent` uses unsafe partial name matching for squad move fallback (violates MG-ID1/MG-ID2)

---

## 1. Problem Statement

When a platform user signs up for a staffing role, the system registers them to the SSI trainer squad. If the user is already in the SSI event ("Already registered"), the fallback code needs to find their **participant ID** to move them to the correct squad.

**Current approach** (unsafe):
```
ssiFindParticipantInEvent(eventCT, eventId, displayName, cookies)
→ scrapes /event/{ct}/{id}/participants/
→ partial name match: searchWords.every(w => name.includes(w))
→ returns { participantId, participantCT }
```

**Risks**:
- SSI uses wildcard name search — "Ari" matches "Ari Virtanen" AND "Jari Virtanen"
- Per MG-ID1/MG-ID2: name matching is prohibited for state-changing operations
- Relies on web scraping (fragile)

## 2. SSI GraphQL Findings (March 2026)

| Field | IPSC/SRA (CT=22) | Nordic (CT=91/136) |
|-------|-------------------|-------------------|
| `competitor.id` (participant ID) | ✅ Available | ✅ Available |
| `shooter.id` (SSI user ID, Relay base64) | ✅ Available (`ShooterNode:65336`) | ✅ Available |
| `shooter.email` | ❌ **NULL** | ✅ Available |
| `shooter.first_name` / `last_name` | ✅ Available | ✅ Available |
| `{ me { id email } }` (admin session) | ❌ Returns null (admin has no user context) | Same |

**Key finding**: Email is visible in SSI's web UI but NOT exposed via GraphQL for IPSC/SRA competitors. This is an SSI GraphQL schema gap, not a data issue.

## 3. Proposed Design: Before/After Diff

Instead of searching for the user after registration, **snapshot the squad before and after** to identify the new competitor by elimination.

### Flow

```
1. BEFORE: Query trainer squad via GraphQL
   → competitors_before = Set of competitor IDs

2. REGISTER: ssiRegisterToTrainerSquad(email)
   → "Registered to trainer squad" (new) or "Already registered" (existing)

3. AFTER: Query trainer squad via GraphQL
   → competitors_after = Set of competitor IDs

4. IDENTIFY: new_competitors = competitors_after - competitors_before
   → If exactly 1 new competitor → that's our user
   → Store their { competitorId, shooterId } for future operations

5. FALLBACK (Already registered — no new competitor):
   a. If "Already registered" and competitors_before == competitors_after:
      → User is already in the trainer squad (no move needed)
      → Find them by shooter.id if we have it stored from a previous operation
   b. If user needs to be MOVED from another squad:
      → Query ALL squads, compare before/after to find which competitor moved
      → Or: use the stored shooter.id mapping from the platform DB
```

### Why This Works

- **No name matching** — identification is by set difference (new participant ID)
- **No email dependency** — works even when `shooter.email` is null
- **No web scraping** — pure GraphQL
- **Deterministic** — exactly one competitor changes between snapshots
- **Works for all event types** — IPSC, Nordic, SRA, etc.

### Edge Cases

| Case | Handling |
|------|----------|
| User already in trainer squad | before == after → no action needed, already placed |
| Concurrent registration (two users signup simultaneously) | Unlikely in practice; if it happens, diff will show 2 new IDs — fail safe, don't move either |
| SSI registration fails silently | before == after → log warning, return failure |
| User in a different squad (needs move) | "Already registered" + no new competitor → use stored shooter.id or ssiSetParticipantSquad fallback |

## 4. Data Model Enhancement

Store the SSI `shooter.id` → platform `account.id` mapping in the database for future lookups:

```sql
-- Add to accounts table or create a mapping table
ALTER TABLE accounts ADD COLUMN ssi_shooter_id TEXT;
-- Populated on first successful squad operation
-- Format: base64 Relay ID (e.g., "U2hvb3Rlck5vZGU6NjUzMzY=")
```

Once populated, future operations can skip the before/after diff and directly match by `shooter.id`.

## 5. Implementation Plan

### Phase 1: Before/After Diff (Immediate)
- Modify signup SSI sync to query squad before and after registration
- Use set difference to identify the new competitor
- Store `competitor.id` in the signup response for downstream use
- Remove `ssiFindParticipantInEvent` from the squad move fallback path

### Phase 2: Shooter ID Cache (Follow-up)
- Add `ssi_shooter_id` column to accounts table
- On first successful identification (Phase 1), store the mapping
- On subsequent operations, use the cached `shooter.id` for instant lookup
- Invalidate cache if the user changes their SSI account

### Phase 3: Deprecate Name-Based Search (Cleanup)
- Remove `ssiFindParticipantInEvent` from squad move path
- Keep it only for legacy cup management where participant IDs come from GraphQL (per MG-ID2)
- Add `@deprecated` JSDoc annotation

## 6. Validation Status

| Check | Result |
|-------|--------|
| `shooter.id` available in GraphQL | ✅ Confirmed (`ShooterNode:65336`) |
| `competitor.id` available in GraphQL | ✅ Confirmed (participant ID for edit operations) |
| `{ me }` works with admin session | ❌ Returns null — not usable |
| Before/after diff approach | 🔲 Needs code validation |
| `ssi_shooter_id` storage | 🔲 Needs DB migration design |

## 7. Relationship to Existing Requirements

- **MG-ID1**: Email as primary identifier → this design adds `shooter.id` as a secondary identifier when email is unavailable
- **MG-ID2**: Exact match required → before/after diff is exact (set difference), no ambiguity
- **MG-ID3**: Fail-safe on ambiguity → if diff shows 0 or 2+ new competitors, operation fails with clear error
