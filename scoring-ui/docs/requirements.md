# SSI Scoring UI — Requirements

## 1. Overview

A mobile-first web application that provides a simplified scoring interface for Nordic shooting competitions managed in Shoot'n Score It (SSI). The app acts as a front-end overlay that submits scores back to SSI via form POST or GraphQL API.

### Problem Statement

The SSI scoring page displays all 6 series × 12 score zones (72 +/- widgets) on a single page. On mobile devices:
- Buttons are too small to tap reliably (< 25px vs recommended 44px minimum)
- Horizontal scrolling is required to see all score columns
- No progressive disclosure — all data visible at once
- No workflow guidance matching the real range scoring process

### Target Users

- **Range scorer**: The person writing down results per squad (1 per squad)
- **Judge**: Reads scores from the target; the scorer enters them

### Context: Real Range Scoring Flow

1. All shooters in a squad fire one series (5 shots) during a 5-minute window
2. Range is cleared, squads walk to targets
3. Scoring is done **left to right** along the target line
4. The scorer picks shooters in **physical target order**, not SSI enrollment order
5. A judge reads the hits from each target; the scorer records them
6. Repeat for all 6 series

## 2. Functional Requirements

### FR-0: Navigation Flow

```
Match Picker → Squad Picker → Series/Shooter View → Score Entry
```

### FR-0A: Match Picker

| ID | Requirement |
|----|-------------|
| FR-0A.1 | List available matches from SSI |
| FR-0A.2 | Highlight today's matches at the top with a green indicator |
| FR-0A.3 | If no matches today, show a notice and list other recent/upcoming matches |
| FR-0A.4 | Each match card shows: name, date, type (e.g., RESUL Nordic), squad count |
| FR-0A.5 | Tapping a match opens the squad picker |

### FR-0B: Squad Picker

| ID | Requirement |
|----|-------------|
| FR-0B.1 | Show match name and date in the header |
| FR-0B.2 | List all squads in the match |
| FR-0B.3 | Each squad shows: name, shooter count, max capacity |
| FR-0B.4 | Tapping a squad opens the series/shooter view |
| FR-0B.5 | Back button returns to match picker |

### FR-1: Series & Shooter View

| ID | Requirement |
|----|-------------|
| FR-1.1 | Display match name and squad name in the header |
| FR-1.2 | Show series tabs S1–S6 with scored/total count per series |
| FR-1.3 | Series tab colors: blue (active), amber (partially scored), green (all scored), gray (not started) |
| FR-1.4 | List all shooters in the squad for the selected series (≤ 10, no search needed) |
| FR-1.5 | Show unscored shooters first, scored shooters below |
| FR-1.6 | Each shooter row shows: SSI number, name, division, scoring status |
| FR-1.7 | Scored shooters show series points and a checkmark |
| FR-1.8 | Tapping a shooter opens the scoring view for that shooter + active series |
| FR-1.9 | Back button returns to squad picker |
| FR-1.10 | **Validation**: Series tabs are locked (disabled) until all shooters in the current series are scored |
| FR-1.11 | Amber warning shown when current series is partially scored, indicating remaining count |
| FR-1.12 | Shooters who did not start (DNS) are not included in the squad list — only active participants are shown |
| FR-1.13 | **Double series toggle** (2x checkbox) in top-right of series tab bar |
| FR-1.14 | When double mode is on, series tabs show pairs (S1+2, S3+4, S5+6) and max hits doubles to 10 |
| FR-1.15 | In double mode, scores fill the first series up to 5, then overflow into the second series |
| FR-1.16 | Double mode is used when two strings are shot back-to-back and scored together at the targets |

### FR-2: Score Entry View

| ID | Requirement |
|----|-------------|
| FR-2.1 | Score one series for one shooter at a time |
| FR-2.2 | Display shooter name, number, division, and active series |
| FR-2.3 | Show score zones in a 3-column grid with large tap targets (≥ 44px) |
| FR-2.4 | Score zones: X, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, M (miss) |
| FR-2.5 | Each zone has +/- buttons and a count display |
| FR-2.6 | Show running hit count (e.g., "3/5 hits") and points total |
| FR-2.7 | "Save → Next Shooter" button advances to next unscored shooter in same series |
| FR-2.8 | "Back" button returns to squad view without losing entered data |
| FR-2.9 | When all shooters are scored for a series, auto-return to squad view |
| FR-2.10 | Tapping a scored shooter allows reviewing/editing their scores |
| FR-2.11 | **Validation**: + buttons are disabled when hit count reaches max (5) |
| FR-2.12 | **Validation**: Save button is disabled and shows error when hits > max |
| FR-2.13 | **Validation**: Red warning banner shown when hit count exceeds max |

### FR-3: Data & Submission

| ID | Requirement |
|----|-------------|
| FR-3.1 | Load squad/shooter list from SSI (via web scraping or GraphQL) |
| FR-3.2 | Submit scores to SSI per shooter (form POST to SSI scoring endpoint) |
| FR-3.3 | Support SSI form fields: `form-{N}-xxx`, `form-{N}-ten`, ..., `form-{N}-miss`, `form-{N}-max_hits` |
| FR-3.4 | Include CSRF token in form submission |
| FR-3.5 | Include DQ reason, warning, and comment fields |
| FR-3.6 | Support signature capture (canvas-based, same as SSI) |
| FR-3.7 | Persist scores locally (localStorage) until submitted to prevent data loss |

### FR-4: Authentication

| ID | Requirement |
|----|-------------|
| FR-4.1 | Authenticate to SSI using username/password (session cookie) |
| FR-4.2 | Maintain session across page reloads |
| FR-4.3 | Show clear login/logout state |

## 3. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Mobile-first design, optimized for phones (375px–430px width) |
| NFR-2 | Minimum tap target size: 44×44px for all interactive elements |
| NFR-3 | Works offline after initial load (PWA with service worker) |
| NFR-4 | Page load < 2 seconds on 3G connection |
| NFR-5 | No accidental data loss — scores persist in localStorage |
| NFR-6 | Visual/audio feedback on score entry (beep on +, different beep on -) |
| NFR-7 | Works on iOS Safari and Android Chrome |
| NFR-8 | Installable as PWA (Add to Home Screen) |

## 4. Technical Architecture

### Option A: SSI Form Proxy (Current approach)

```
[Mobile UI] → [SSI Session Cookie] → [POST /nordic/competitor/{id}/score-in-match/]
```

- Authenticate via SSI login form, get session cookie
- Fetch squad/shooter data by scraping SSI match page
- Submit scores via form POST with CSRF token
- **Pro**: Works now, no API dependency
- **Con**: Fragile, depends on SSI HTML structure

### Option B: GraphQL API (Future, when SSI fixes create_event)

```
[Mobile UI] → [JWT + API Key] → [GraphQL mutation]
```

- Authenticate via `token_auth` mutation
- Read squad data via GraphQL queries
- Submit scores via GraphQL mutation (TBD — needs SSI to expose scoring mutations)
- **Pro**: Clean, stable API
- **Con**: SSI GraphQL is currently broken for write operations

### Tech Stack

- **Framework**: React + Vite
- **Styling**: Tailwind CSS
- **State**: React useState (upgrade to Zustand if complexity grows)
- **Storage**: localStorage for offline persistence
- **PWA**: Vite PWA plugin + service worker

## 5. SSI Data Model (Scoring)

```
Match (e.g., "Kupittaa 15.02.2026 Tarkkuus")
  └── Squad (e.g., "Oma ase 1")
        └── Competitor (e.g., "Tommi Wiren", id: 21883)
              └── Score form: 6 series × 12 zones
                    Series 1: { X: 0, 10: 2, 9: 3, ..., M: 0 }
                    Series 2: { ... }
                    ...
                    Series 6: { ... }
```

### SSI Form Field Mapping

| Series | Form prefix | Zone fields |
|--------|-------------|-------------|
| S1 | `form-0-` | `xxx`, `ten`, `nine`, `eight`, `seven`, `six`, `five`, `four`, `three`, `two`, `one`, `miss` |
| S2 | `form-1-` | (same) |
| ... | ... | ... |
| S6 | `form-5-` | (same) |

Additional fields: `max_hits` per series, `warning` (checkbox), `dq_reason` (select), `score_comment` (textarea), `signature` (base64 canvas data).

## 6. Out of Scope (v1)

- Multi-match navigation (scorer opens the specific match URL)
- Score verification / approval workflow
- Live results display
- Shooter self-scoring
- Integration with WordPress tapahtumakalenteri

## 7. Open Questions

1. Does SSI have a GraphQL mutation for submitting scores? (Need to check schema)
2. Can we get squad/competitor data via GraphQL or only by scraping?
3. Should the app support re-scoring (editing already-submitted scores)?
4. Is the signature required for all submissions or only for shooter verification?
5. What happens if the scorer submits scores for a shooter who already has scores?
