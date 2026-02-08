# Management Page — Enhanced Design

Mobile-first design for consolidated squad management.

## Core Interactions

Three key admin actions that must be fast on a phone:

1. **Assign unsquadded shooters** to a squad (affects all matches)
2. **Fix inconsistent squad assignments** across matches
3. **Add match-only shooters to the CUP**

## Screen Layout

Single-column, card-based. Sticky action bar at top summarizing issues.

```
┌─────────────────────────────────┐
│ Kupittaa Cup — Hallinta    ← ◁ │  AppHeader
├─────────────────────────────────┤
│ 14.6.2025 Kupittaa CUP         │  Selected cup subtitle
├─────────────────────────────────┤
│ ⚠ 3 ei squadeissa  │ 2 eri sq  │  Sticky action bar
│   1 ei cupissa      │ ✓ 28 ok  │  Tap badge → scroll to section
└─────────────────────────────────┘

  ── Ei squadeissa (3) ──────────   Section: Unsquadded
  ┌───────────────────────────────┐
  │ Matti Meikäläinen     [→ S1] │  Tap button → squad picker
  │ Pekka Pekkanen        [→ S2] │
  │ Liisa Laine           [→ S?] │
  └───────────────────────────────┘

  ── Eri squadissa (2) ──────────   Section: Inconsistent
  ┌───────────────────────────────┐
  │ Ville Virtanen                │
  │ Tarkk: S1 │ Pika: S2 │ Kuv: S1│
  │ [Korjaa → S1]                 │  One-tap fix to majority squad
  ├───────────────────────────────┤
  │ Anna Aaltonen                 │
  │ Tarkk: S3 │ Pika: — │ Kuv: S3│
  │ [Korjaa → S3]                 │  Assigns missing match + fixes
  └───────────────────────────────┘

  ── Ei cupissa (1) ─────────────   Section: Match-only
  ┌───────────────────────────────┐
  │ Jukka Jokinen         [Lisää]│  Add to CUP
  │ [Lisää kaikki cupiin]         │  Bulk action
  └───────────────────────────────┘

  ── Squad 1 (5/10) ────────────   Per-squad overview
  ┌───────────────────────────────┐
  │ ✓ Matti Meikäläinen           │  All 3 matches, same squad
  │ ✓ Pekka Pekkanen              │
  │ ⚠ Ville Virtanen   S1/S2/S1  │  Tappable → fix action
  │ ✗ Liisa Laine       —/—/—    │  Not in any match
  └───────────────────────────────┘

  ── Squad 2 (4/10) ────────────
  ...
```

## Interaction Details

### 1. Assign unsquadded shooter to squad

**Mobile pattern: "Tap to pick" (no drag-and-drop on phone)**

- Tap the `[→ S?]` button next to an unsquadded shooter
- Bottom sheet slides up with squad options:

```
  ┌─────────────────────────────┐
  │ Valitse squad               │
  │ Matti Meikäläinen           │
  ├─────────────────────────────┤
  │ Squad 1 — aamu     5/10    │
  │ Squad 2 — ilta     4/10    │
  │ Squad 3 — extra    2/10    │
  │ ─────────                   │
  │ Peruuta                     │
  └─────────────────────────────┘
```

- Tap squad → confirmation toast → shooter moves to that squad
- Backend: assigns shooter to selected squad **in all 3 matches**

**Tablet/desktop: drag-and-drop enhancement**

On wider screens (≥768px), unsquadded shooters can alternatively
be dragged onto squad cards. Uses HTML5 Drag and Drop API with
touch-event polyfill for tablets.

Priority: implement tap-to-pick first, drag-and-drop as enhancement.

### 2. Fix inconsistent squad assignments

Each inconsistent shooter shows their per-match assignment inline:

```
  Ville Virtanen
  Tarkk: S1 │ Pika: S2 │ Kuv: S1
  [Korjaa → S1]
```

- System suggests the **majority squad** (S1 appears in 2/3 matches)
- One-tap `[Korjaa → S1]` fixes it
- If no majority (all different), show squad picker instead
- If a match is missing entirely, the fix also registers the
  shooter to that match in the suggested squad

**Bulk action:** "Korjaa kaikki" button at section header
fixes all inconsistencies using majority-squad logic.

### 3. Add match-only shooters to CUP

- Individual `[Lisää]` button per shooter
- `[Lisää kaikki cupiin]` bulk button at section header
- Backend: adds the shooter as a CUP participant
  (same as registration flow but admin-initiated)

## Sticky Action Bar

Always visible at top (below AppHeader). Shows issue counts
as tappable badges. Each badge scrolls to its section.

```
┌──────────┬──────────┬──────────┬──────────┐
│ ⚠ 3      │ ↔ 2      │ + 1      │ ✓ 28     │
│ Ei sq    │ Eri sq   │ Ei cup   │ OK       │
└──────────┴──────────┴──────────┴──────────┘
```

Color coding:
- Red badges: issues requiring attention
- Green badge: count of fully consistent shooters
- When all issues resolved, bar turns green: "Kaikki kunnossa ✓"

## Required Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/manage/cup/:cupId/assign-squad` | POST | Assign shooter to squad in all matches. Body: `{ shooterId, squadNumber }` |
| `POST /api/manage/cup/:cupId/fix-squad` | POST | Fix inconsistent assignment to target squad. Body: `{ shooterId, targetSquad }` |
| `POST /api/manage/cup/:cupId/add-to-cup` | POST | Add a match-only shooter to CUP. Body: `{ shooterId }` |

All endpoints require `requireAuth` and perform SSI admin
operations (web scraping) similar to the registration flow.

## State Management

- After each action, **re-fetch** `/api/manage/cup/:id` to get
  fresh data. Optimistic UI not needed — admin actions are
  infrequent and correctness matters more than speed.
- Show a brief spinner overlay on the affected card during action.
- Toast notification on success/failure.

## Touch Considerations

- All tap targets ≥ 44px height (Apple HIG minimum)
- Squad picker as bottom sheet, not dropdown (better on mobile)
- Swipe-to-dismiss on bottom sheet
- No hover-dependent interactions
- Drag-and-drop only as progressive enhancement on ≥768px screens

## Implementation Order

1. **Phase 1 — Read-only improvements** (current)
   - Sticky action bar with issue counts
   - Section-based layout (unsquadded → inconsistent → not-in-cup → squads)
   - Already implemented: per-squad cross-match table

2. **Phase 2 — Squad assignment**
   - Backend: `assign-squad` endpoint (SSI squad change via admin scraping)
   - UI: tap-to-pick squad picker for unsquadded shooters

3. **Phase 3 — Fix inconsistencies**
   - Backend: `fix-squad` endpoint
   - UI: one-tap fix with majority-squad suggestion

4. **Phase 4 — CUP enrollment**
   - Backend: `add-to-cup` endpoint
   - UI: individual + bulk add buttons

5. **Phase 5 — Drag-and-drop** (optional enhancement)
   - HTML5 DnD with touch polyfill for tablet
   - Only on screens ≥768px wide
