# SSI Scoring — Architecture & Requirements

**Version**: 1.0.0
**Date**: 2026-02-06
**Status**: Released — deployed on Render

---

## 1. Overview

SSI Scoring is a mobile-first web application for scoring ShootNScoreIt (SSI) Nordic shooting competitions. It provides a touch-optimized interface for range officers to enter scores on phones/tablets, replacing the SSI desktop web interface during live matches.

The system consists of two components:

- **scoring-ui** — React single-page application (PWA)
- **scoring-proxy** — Express.js backend that bridges the UI with the SSI platform

```
┌─────────────────────────────────────────────────────────┐
│                      Mobile Device                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │              scoring-ui (React PWA)               │  │
│  │                                                   │  │
│  │  LoginScreen → CupSearch → MatchPicker →          │  │
│  │  SquadPicker → Series/ShooterPicker → ScoringForm │  │
│  │                                                   │  │
│  │  localStorage: encrypted creds, nav state, scores │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │ HTTPS /api/*                      │
└──────────────────────┼──────────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │    scoring-proxy (Node)   │
         │                           │
         │  Express 5 API server     │
         │  Serves built UI (prod)   │
         │                           │
         │  State:                   │
         │   • JWT token (reads)     │
         │   • Session cookies (writes)│
         └─────────┬─────────────────┘
                   │
      ┌────────────▼────────────┐
      │   shootnscoreit.com     │
      │                         │
      │  GraphQL API (JWT)      │
      │   • Authentication      │
      │   • Cup/match/squad     │
      │     queries             │
      │                         │
      │  Web Forms (session)    │
      │   • Login (POST)        │
      │   • Score submission    │
      │     (Django formset)    │
      └─────────────────────────┘
```

---

## 2. Architecture

### 2.1 Dual Authentication Model

SSI exposes two interfaces, each requiring different auth:

| Interface | Auth Mechanism | Used For |
|---|---|---|
| **GraphQL API** | JWT token (`Authorization: JWT <token>`) | Read operations: cups, matches, squads, competitors, scores |
| **Web Forms** | Django session cookie (`sessionid`) | Write operations: login, score submission via form POST |

The proxy obtains **both** during login:

1. **JWT**: via GraphQL `token_auth` mutation
2. **Session cookie**: via HTTP POST to `/login/` with form data

Both are held in server-side variables (`jwtToken`, `sessionCookies`) for the duration of the session.

### 2.2 scoring-proxy

**Runtime**: Node.js v24.13.0 LTS, Express 5
**Dependencies**: `express`, `cors` (2 production dependencies)

#### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Authenticate with SSI (JWT + session) |
| GET | `/api/auth/status` | None | Check auth state |
| GET | `/api/cups?search=` | JWT | Search cups by name (CT=136) |
| GET | `/api/cup/:id` | JWT | Cup detail with component matches |
| GET | `/api/match/:id` | JWT | Match with squads and competitors |
| GET | `/api/competitor/:id` | JWT | Single competitor scores |
| POST | `/api/competitor/:id/score` | Session | Submit scores via Django formset |

#### Registration API Endpoints (public, no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/api/register/captcha` | Generate math captcha (15 min TTL) |
| GET | `/api/register/cups` | List future cups open for registration |
| GET | `/api/register/cup/:id` | Cup detail with squads and capacity |
| POST | `/api/register/submit` | Register shooter to cup + squad |

#### SSI Client Module (`lib/ssi-client.js`)

| Function | Purpose |
|---|---|
| `ssiGraphQL(jwt, query, vars, apiKey)` | Execute GraphQL queries against SSI |
| `ssiLogin(email, password)` | Web login to obtain session cookies |
| `ssiGetScoringPage(competitorId, cookies)` | Fetch scoring form (extract CSRF token) |
| `ssiSubmitScore(competitorId, formData, cookies, csrf)` | POST score form to SSI |

#### Production Mode

In production, the proxy serves the built UI from `scoring-ui/dist/` as static files, with SPA fallback for non-API routes. A single Node.js process handles both API and UI.

### 2.3 scoring-ui

**Runtime**: React 19, Tailwind CSS 4, Vite 7
**Production output**: Static JS/CSS/HTML (bundled, no server-side rendering)

#### Component Hierarchy

```
AppWithBadge
└── App (state manager — all views are early returns)
    ├── LoginScreen        — email, password, API key, remember me
    ├── CupSearch          — wildcard search, date-sorted results
    ├── MatchPicker        — today's matches highlighted
    ├── SquadPicker        — squad list with shooter counts
    ├── Series view (inline) — series tabs, shooter list, double-series toggle
    │   └── ShooterPicker  — scored/unscored status, points display
    └── Scoring view (inline)
        └── ScoringForm    — zone buttons grid
            └── ScoreZoneButton — +/- tap targets per zone
```

#### Navigation Flow

```
Login → Cup Search → Match List → Squad List → Series Overview → Score Entry
  ↑                    ↑            ↑             ↑                ↑
  └── Logout           └── Back     └── Back      └── Back         └── Back
```

All navigation state is persisted to `localStorage` and fully restored on page reload.

> Cross-reference (default for all protected domains): startup authentication uses an **Auth Bootstrap + Auth Gate** pattern (also known as **session rehydration** / **silent session restore**): render a temporary `restoring` state, call `/api/auth/status`, then either restore feature navigation state or transition to login based on session + scope. See `docs/Implementation/session-handling.md` -> **Mount-Time Session Bootstrap + Auth Gate (RELOAD UX, DEFAULT)**.

#### State Management

All state lives in `App.jsx` via `useState` hooks:

| State | Type | Persistence |
|---|---|---|
| `view` | string | `ssi_nav_state` |
| `selectedCup` | object | `ssi_last_cup` |
| `selectedMatch` | object | `ssi_nav_state` (ID only) |
| `selectedSquad` | object | `ssi_nav_state` (ID only) |
| `selectedShooterId` | number | `ssi_nav_state` |
| `activeSeries` | number | `ssi_nav_state` |
| `allScores` | object | `ssi_scores` (keyed by match_squad) |
| `doubleSeries` | boolean | Not persisted |
| credentials | encrypted | `ssi_credentials` (AES-GCM) |

#### API Client (`src/api.js`)

Thin wrapper over `fetch()` calls to proxy endpoints, plus data transformers:

| Function | Purpose |
|---|---|
| `login(email, pw, apiKey)` | POST to proxy auth |
| `searchCups(search)` | Search cups |
| `getCup(id)` / `getMatch(id)` | Fetch entities |
| `getCompetitor(id)` | Fetch competitor |
| `submitScore(id, scores, opts)` | Submit scores |
| `parseStringScore(ssiString)` | SSI CSV → zone object |
| `transformMatch(ssiMatch)` | SSI → UI match format |
| `buildScoresFromSSI(shooter)` | Extract existing scores |

#### Credential Encryption (`src/crypto.js`)

When "Remember me" is checked, credentials are encrypted before `localStorage` storage:

- **Algorithm**: AES-GCM (256-bit)
- **Key**: Random, generated once per device, stored in `localStorage` as `ssi_device_key`
- **IV**: Random 12-byte nonce per encryption
- **Storage format**: JSON `{iv, data}` — both base64-encoded

This prevents credentials from being trivially readable in DevTools/localStorage.

### 2.4 SSI Data Model — Kupittaa CUP Structure

Understanding the SSI content type hierarchy is critical. Kupittaa CUP uses a specific subset of SSI's event model:

```
Serie/CUP (CT=136)               ← "Kupittaa CUP 08.02.2026"
├── CUP Participant (CT=137)     ← One per registered shooter
│   Status: Pending → Approved   ← via toggle-status URL only
│
└── Component Matches (1..N)     ← linked via component_matches[]
    ├── Match 1 (CT=91)          ← "Tarkkuus" (Precision)
    │   └── Squads 1..3
    │       └── Competitors (CT=93) ← status + squad assignment
    ├── Match 2 (CT=91)          ← "Pika" (Rapid fire)
    │   └── Squads 1..3
    │       └── Competitors (CT=93)
    └── Match 3 (CT=91)          ← "Kuvio" (Silhouette)
        └── Squads 1..3
            └── Competitors (CT=93)
```

#### Content Types

| CT | Entity | Edit Form | Status Change |
|---|---|---|---|
| **136** | Serie / CUP | Editable | N/A (event level) |
| **137** | CUP Participant | Edit form does NOT support status changes | **toggle-status URL only** |
| **91** | Match | Editable | N/A (event level) |
| **93** | Match Competitor | Edit form supports status + squad changes | `formData.set('status', 'a')` works |

#### Pre-match vs Match (critical distinction)

SSI distinguishes between **pre-matches** and **matches**:

| Concept | SSI Term | Kupittaa Usage |
|---|---|---|
| **Pre-match** | Preliminary round before main competition | **Not used** — Kupittaa has no qualifying rounds |
| **Match** | Actual competition event (CT=91) | **Used** — Tarkkuus, Pika, Kuvio are all matches |
| `number_of_prematch_competitors_registered` | Count of shooters registered to pre-matches | **Always 0** for Kupittaa — meaningless field |

**Implication**: To count registered shooters in a Kupittaa CUP, we must query the actual match competitors from squads via GraphQL, not use the `number_of_prematch_competitors_registered` field. The approved competitor count is derived by collecting unique competitor IDs with `status === 'a'` from the first component match's squads.

#### CUP Participant Status Lifecycle

```
toggle-status cycle (CUP participants, CT=137):

  Pending ──toggle──► Approved ──toggle──► Approved (no results) ──toggle──► Deleted ──toggle──► Pending
     │                   │
     │                   └── Target state. Shooter is enrolled.
     └── Default state after registration via search-and-add.
```

**Key discovery**: The CUP participant edit form (`/event/participant/137/{id}/edit/`) silently ignores `status` field changes — the POST returns 302 (looks successful) but does not update the status. Only the toggle-status URL (`/event/participant/137/{id}/toggle-status/`) works for CUP participants.

Match competitor edit forms (`/event/participant/93/{id}/edit/`) **do** support status changes via the edit form POST.

#### Registration Admin Operations

| Step | SSI Operation | Method |
|---|---|---|
| Add to CUP | `POST /event/136/{cupId}/participant-search-and-add/` | Web scraping (search by email → follow register link → POST confirmation form) |
| Approve CUP participant | `GET /event/participant/137/{id}/toggle-status/` | Web scraping (toggle Pending → Approved) |
| Add to Match | `POST /event/91/{matchId}/participant-search-and-add/` | Web scraping (same flow as CUP) |
| Assign squad + approve | `POST /event/participant/93/{id}/edit/` | Web scraping (set squad + status=a in edit form) |

All admin operations require SSI admin session cookies. The proxy uses a server-side singleton admin session (`getAdminSession()`) with 4-hour TTL.

### 2.5 Scoring Model

Nordic shooting format:

- **6 series** per match
- **5 shots** per series (max hits)
- **12 score zones**: X, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, M (miss)
- **Points**: X=10, 10=10, 9=9, ..., 1=1, M=0
- **Double-series mode**: Score series 1+2, 3+4, or 5+6 together for efficiency

Score submission maps UI zone counts to SSI's Django formset format:

```
form-{seriesIdx}-{zoneKey} = count
```

Zone keys: `xxx`, `ten`, `nine`, `eight`, `seven`, `six`, `five`, `four`, `three`, `two`, `one`, `miss`

### 2.5 PWA

- **Manifest**: `public/manifest.json` — standalone display, theme color, icons
- **Service Worker**: `public/sw.js` — cache-first for app shell, network-first for `/api`
- **Icons**: Generated from SVG via `scripts/generate-icons.js` (sharp)
- **Install**: "Add to Home Screen" on mobile browsers

### 2.6 Deployment

```
GitHub (push) → GitHub Actions CI → Render Deploy Hook → Render (prod)
```

| Stage | Tool | Actions |
|---|---|---|
| **CI** | GitHub Actions | Install → Test (63 tests) → Audit → Build → Upload artifacts |
| **Deploy** | Render | `npm install` → `vite build` → `node server.js` |
| **Runtime** | Render (free tier) | Single Node.js process serves API + built UI |

Render blueprint: `render.yaml`
CI workflow: `.github/workflows/ci-deploy.yml`

---

## 3. Requirements — Release 3.0 (Scoring UI)

### 3.1 Functional Requirements

| # | Requirement | Status |
|---|---|---|
| S1 | User can log in with SSI email, password, and optional API key | ✅ |
| S2 | Login authenticates via both JWT (GraphQL) and session cookies (web forms) | ✅ |
| S3 | User can search for cups by name (minimum 2 characters, wildcard) | ✅ |
| S4 | Cup search results are sorted by closest date to today | ✅ |
| S5 | User can select a cup and see its component matches | ✅ |
| S6 | Match list highlights today's matches separately | ✅ |
| S7 | User can select a match and see its squads | ✅ |
| S8 | User can select a squad and see its active shooters | ✅ |
| S9 | User can enter scores for a shooter using tap-based zone buttons (+/-) | ✅ |
| S10 | Scoring enforces max 5 hits per series (blocks increment at limit) | ✅ |
| S11 | Double-series mode allows scoring two consecutive series together | ✅ |
| S12 | Scores are submitted to SSI via Django form POST through the proxy | ✅ |
| S13 | After saving, the UI auto-advances to the next unscored shooter | ✅ |
| S14 | Series tabs show progress (scored count per series) with color coding | ✅ |
| S15 | Series tabs are locked until all shooters in current series are scored | ✅ |
| S16 | User can navigate back at every level (Cup → Match → Squad → Series → Scoring) | ✅ |
| S17 | Logout clears all stored data and returns to login screen | ✅ |

### 3.2 Persistence Requirements

| # | Requirement | Status |
|---|---|---|
| P1 | "Remember me" stores credentials encrypted (AES-GCM) in localStorage | ✅ |
| P2 | Credentials are never stored as plain text on the device | ✅ |
| P3 | Auto-login on page reload when "Remember me" was used | ✅ |
| P4 | Full navigation state (cup, match, squad, series, shooter) persisted and restored | ✅ |
| P5 | In-progress scores survive page reload (keyed by match+squad) | ✅ |
| P6 | Last selected cup is remembered for faster navigation | ✅ |

### 3.3 Mobile & PWA Requirements

| # | Requirement | Status |
|---|---|---|
| M1 | Mobile-first, touch-optimized UI (large tap targets, no hover dependencies) | ✅ |
| M2 | Installable as PWA on mobile devices ("Add to Home Screen") | ✅ |
| M3 | App shell cached for offline load (network-first for API calls) | ✅ |
| M4 | Build version number visible in UI (non-intrusive) | ✅ |

### 3.4 Build & Deployment Requirements

| # | Requirement | Status |
|---|---|---|
| B1 | Automated test suite with UI component tests | ✅ (63 tests) |
| B2 | npm vulnerability scan on every build | ✅ |
| B3 | Scan results available as build artifacts | ✅ |
| B4 | CI/CD pipeline: test → audit → build → deploy | ✅ (GitHub Actions) |
| B5 | Release notes for each version | ✅ |
| B6 | Non-breaking dependency updates applied immediately | ✅ |
| B7 | Node.js pinned to LTS version (currently v24.13.0) | ✅ |

### 3.5 Non-Functional Requirements

| # | Requirement | Status |
|---|---|---|
| N1 | Cloud-hosted for colleague testing | ✅ (Render) |
| N2 | HTTPS in production | ✅ (Render default) |
| N3 | Single-process deployment (proxy serves UI + API) | ✅ |

---

## 4. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Runtime** | Node.js LTS | 24.13.0 |
| **UI Framework** | React | 19.2.0 |
| **Styling** | Tailwind CSS | 4.1.18 |
| **Bundler** | Vite | 7.3.1 |
| **Server** | Express | 5.2.1 |
| **Testing** | Vitest + React Testing Library | 4.0.18 |
| **CI/CD** | GitHub Actions | v4 |
| **Hosting** | Render | Free tier |
| **SCM** | GitHub | - |

---

## 5. File Structure

```
windsurf-project/
├── .github/workflows/ci-deploy.yml    # CI/CD pipeline
├── render.yaml                         # Render deployment blueprint
├── docs/
│   ├── scoring-architecture.md         # This document
│   ├── scoring-enhancements.md         # Enhancement plan
│   ├── RELEASE-v1.0.0.md              # Release notes
│   └── build-scan-v1.0.0.md           # Build scan report
├── scripts/
│   └── build-release.js               # Local build + audit script
├── scoring-proxy/
│   ├── package.json                    # 2 prod deps: express, cors
│   ├── server.js                       # API routes + static serving
│   ├── lib/
│   │   └── ssi-client.js              # SSI GraphQL + web client
│   └── test/
│       └── proxy.test.js              # Integration tests
└── scoring-ui/
    ├── package.json                    # React, Tailwind, Vite, Vitest
    ├── vite.config.js                  # Build config + version injection
    ├── index.html                      # PWA meta, service worker registration
    ├── public/
    │   ├── manifest.json               # PWA manifest
    │   ├── sw.js                       # Service worker
    │   └── icon.svg                    # App icon source
    ├── scripts/
    │   └── generate-icons.js           # PNG icon generator
    └── src/
        ├── App.jsx                     # Main app — state, navigation, all views
        ├── api.js                      # Proxy API client + data transformers
        ├── crypto.js                   # AES-GCM encrypt/decrypt
        ├── components/
        │   ├── LoginScreen.jsx         # Login form + remember me
        │   ├── CupSearch.jsx           # Cup wildcard search
        │   ├── MatchPicker.jsx         # Match list (today highlighted)
        │   ├── SquadPicker.jsx         # Squad list
        │   ├── ShooterPicker.jsx       # Shooter list with status
        │   ├── ScoringForm.jsx         # Score entry grid
        │   └── ScoreZoneButton.jsx     # Individual zone +/- button
        └── test/
            ├── setup.js                # Test setup (jsdom)
            ├── api.test.js             # API transformer tests (27)
            ├── components.test.jsx     # Component tests (25)
            └── persistence.test.js     # localStorage tests (11)
```
