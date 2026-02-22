# Software Architecture Review

**Date:** 2026-02-19 (updated 2026-02-22 for v7.5)
**Scope:** `scoring-proxy/` (Express backend) and `scoring-ui/` (React frontend)
**Target Architecture:** Modular Monolith with clear module boundaries

---

## 1. Codebase Snapshot

### 1.1 Backend (`scoring-proxy/`)

| File | Lines | Role |
|------|------:|------|
| `lib/ssi-core/client.js` | 1 482 | SSI API integration (GraphQL + web scraping) |
| `routes/management.js` | 890 | Cup management endpoints (9 routes) |
| `routes/staffing.js` | 430 | Staff signup/resign/sync |
| `routes/registration.js` | 379 | Public self-registration |
| `server.js` | 380 | Express bootstrap, middleware, route mounting |
| `routes/scoring.js` | 332 | Score entry endpoints |
| `routes/reports.js` | 206 | Report generation |
| `routes/auth-v7.js` | 166 | Authentication routes |
| `lib/staffing/engine.js` | 268 | Staffing business logic |
| `lib/session/store.js` | 168 | Session store (Redis/memory) |
| Other libs | ~600 | Logger, email, session, staffing helpers |

**Total backend source:** ~5 300 lines across 25 files.

### 1.2 Frontend (`scoring-ui/src/`)

| File | Lines | Role |
|------|------:|------|
| `components/ManagePage.jsx` | 959 | Cup management UI (8 sub-components inline) |
| `App.jsx` | 644 | Scoring app (state machine, all views) |
| `components/SummaryReportPage.jsx` | 536 | Summary report builder |
| `components/ReportPage.jsx` | 498 | Detailed report page |
| `components/StaffingPage.jsx` | 458 | Staff management UI |
| `components/RegisterPage.jsx` | 385 | Self-registration UI |
| `api.js` | 248 | API client |
| `components/shared.jsx` | 187 | Shared UI components |
| `i18n.js` | 275 | Finnish/English translations |
| Other components | ~500 | Pickers, buttons, login, etc. |

**Total frontend source:** ~4 700 lines across 20 files.

### 1.3 Tests

| Suite | Files | Tests | Runtime |
|-------|------:|------:|--------:|
| `scoring-proxy` (vitest) | 8 | 134 | ~14 s |
| `scoring-ui` (vitest/jsdom) | 6 | 160 | ~15 s |
| `proxy.test.js` (node:test, live SSI) | 1 | excluded | manual |
| `session-timeout.test.js` (node:test, live SSI) | 1 | excluded | manual |

**Total automated:** 294 tests, ~30 s combined.

---

## 2. Maintainability Analysis

### 2.1 God Files — High Merge-Conflict Risk

The top merge-conflict hotspots are files where multiple features converge:

| File | Lines | Why it's a problem |
|------|------:|-------------------|
| `ssi-core/client.js` | 1 482 | 29 exported functions covering auth, scoring, participants, squads, management, staffing, scraping. Every feature touches this file. |
| `ManagePage.jsx` | 959 | 8 inline sub-components, all management UI in one file. |
| `App.jsx` | 644 | Entire scoring flow as a single state machine with inline views. |
| `management.js` (route) | 890 | 9 endpoints with inline business logic (validation, orchestration, error handling). |
| `server.js` | 380 | All middleware, rate limiters, and route mounting in one file. |

**Impact:** When two developers (or agent sessions) work on different features that both touch `client.js` or `management.js`, merge conflicts are almost guaranteed.

### 2.2 Coupling Patterns

```
server.js
  ├── routes/management.js ──→ lib/ssi-client.js ──→ lib/ssi-core/client.js
  ├── routes/registration.js ──→ lib/ssi-client.js ──→ lib/ssi-core/client.js
  ├── routes/staffing.js ──→ lib/ssi-client.js ──→ lib/ssi-core/client.js
  ├── routes/scoring.js ──→ lib/ssi-client.js ──→ lib/ssi-core/client.js
  ├── routes/reports.js ──→ lib/ssi-client.js ──→ lib/ssi-core/client.js
  └── routes/auth-v7.js ──→ lib/ssi-client.js ──→ lib/ssi-core/client.js
```

Every route depends on the same monolithic SSI client. The `ssi-client.js` → `ssi-core/client.js` re-export layer exists but all routes still import from the compat shim.

### 2.3 Pattern Duplication (UI)

Multiple page components repeat the same pattern:
1. `useRememberMe` hook
2. `authed` / `view` / `loading` / `error` / `sessionExpiredMessage` state
3. Login → content view transition
4. Session expiry detection and re-login flow

This is duplicated in: `ManagePage`, `SummaryReportPage`, `ReportPage`, `StaffingPage`, `App` (scoring).

---

## 3. Recommendations — Maintainability & Merge Conflicts

### 3.1 Split `ssi-core/client.js` by Domain (HIGH PRIORITY)

Current: 1 file, 29 functions, 1 482 lines.

Proposed structure:
```
lib/ssi-core/
  ├── graphql.js          # ssiGraphQL, ssiRefreshJWT, ssiLogin (~80 lines)
  ├── scoring.js          # ssiGetScoringPage, ssiSubmitScore (~100 lines)
  ├── participants.js     # ssiSearchAndAddParticipant, ssiFindAndApprove/Delete,
  │                       # ssiFindCompetitorInMatch, ssiFindParticipantInEvent,
  │                       # ssiSetParticipantSquad, ssiSetMatchParticipantStatus,
  │                       # ssiDeleteMatchParticipant, ssiSetDidNotShow,
  │                       # ssiUndoDidNotShow, ssiTogglePaid,
  │                       # ssiGetCupParticipantStatuses (~700 lines)
  ├── management.js       # ssiGetMatchGroupId, ssiGetMatchOfficials,
  │                       # ssiAddToMatchManagement, ssiRemoveFromMatchManagement,
  │                       # ssiRegisterToTrainerSquad, ssiGetEventStaff (~300 lines)
  ├── http-helpers.js     # parseCookies, formatCookies, ssiFetchPage (~80 lines)
  └── index.js            # barrel re-export (unchanged API surface)
```

**Benefit:** Each route file only touches its domain module. Parallel work on scoring vs. management vs. staffing won't conflict in the SSI layer.

**Migration:** Keep `index.js` barrel export so existing imports don't break. Migrate route imports to domain modules gradually.

### 3.2 Extract Route Handler Logic (MEDIUM PRIORITY)

`management.js` has 890 lines with inline business logic in each handler. Extract orchestration into service functions:

```
routes/management.js        → thin handlers (validation, response)
lib/services/cup-manage.js  → addToCup(), approvePending(), assignSquad(), etc.
```

**Benefit:** Route files become short dispatchers. Business logic is independently testable without HTTP mocking. Two features adding management endpoints won't conflict as much.

### 3.3 Extract Shared Auth/Page Pattern (UI) (MEDIUM PRIORITY)

Create a higher-order component or custom hook:

```javascript
// hooks/useAuthenticatedPage.js
export function useAuthenticatedPage(storageKey) {
  const { savedCreds, handleRememberMe } = useRememberMe(storageKey)
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)
  // ... shared login/logout/session-expiry logic
  return { authed, view, setView, loading, setLoading, error, setError, ... }
}
```

**Benefit:** Eliminates ~50 lines of boilerplate per page. Session handling changes only need one edit.

### 3.4 Split `ManagePage.jsx` (LOW-MEDIUM PRIORITY)

Extract inline sub-components to separate files:

```
components/manage/
  ├── ManagePage.jsx          # main page shell + state
  ├── SquaddingOverview.jsx   # the big overview component
  ├── SquadCard.jsx           # individual squad display
  ├── ShooterActions.jsx      # DNS/paid/squad action buttons
  └── SquadPickerSheet.jsx    # squad selection bottom sheet
```

**Benefit:** Reduces ManagePage from 959 to ~300 lines. Sub-components can be worked on independently.

### 3.5 Migrate Route Imports to `ssi-core/` Directly (LOW PRIORITY)

All routes currently import from `lib/ssi-client.js` (compat shim). After split (3.1), update imports to target domain modules directly. Then remove the compat shim.

---

## 4. Test Coverage & Strategy

### 4.1 Current Coverage Assessment

| Area | Coverage | Notes |
|------|----------|-------|
| **Management routes** | ✅ Good | 28 tests covering all 9 endpoints, error paths, edge cases |
| **Registration routes** | ✅ Good | 12 tests covering captcha, validation, happy/error paths |
| **Session store** | ✅ Good | 12 tests for Redis/memory store, TTL, cleanup |
| **Auth middleware** | ✅ Good | 15 tests for V7 auth, scopes, expiry, security |
| **Session security** | ✅ Good | 7 tests for cookie security, CSRF |
| **Session compat** | ✅ Good | 4 tests for backward compatibility |
| **Impersonation** | ✅ Good | 6 tests |
| **SSI core client** | ⚠️ Minimal | 1 test file, ~3 tests (cookie parsing only) |
| **Scoring routes** | ❌ None | No unit tests |
| **Reports routes** | ❌ None | No unit tests |
| **Staffing routes** | ❌ None | No unit tests (empty `test/staffing/` dir) |
| **Staffing engine** | ❌ None | No unit tests |
| **UI: api.js** | ✅ Good | 22 tests |
| **UI: shared.jsx** | ✅ Good | 19 tests |
| **UI: components** | ⚠️ Partial | 9 tests (basic rendering only) |
| **UI: register-api** | ✅ Good | 10 tests |
| **UI: crypto** | ✅ Good | 4 tests |

**Estimated line coverage:** ~40-50% backend, ~30-40% frontend.

### 4.2 Coverage Gaps (Priority Order)

1. **SSI core client** — The 1 482-line heart of the system has almost no tests. All route tests mock it away. If scraping logic breaks (SSI HTML changes), nothing catches it until production.
2. **Staffing routes + engine** — Entirely untested. The `test/staffing/` directory is empty.
3. **Scoring routes** — No tests at all.
4. **Reports routes** — No tests at all.

### 4.3 Test Strategy Recommendations

#### Keep Test Runs Fast (<30 seconds)

Current: 294 tests in ~30 s. This is healthy. To maintain this as coverage grows:

- **Unit tests for SSI client functions:** Mock `fetch` at the function level, not at the HTTP layer. Test HTML parsing with fixture files (saved SSI HTML snapshots). These run in <1 ms each.
- **Route tests:** Continue the current pattern of mocking SSI client functions. Keep route tests focused on HTTP contract (status codes, response shapes, validation).
- **Avoid integration/E2E in the main suite:** Keep `proxy.test.js` and `session-timeout.test.js` excluded from `vitest run`. Run them manually or in a separate CI step.

#### Fixture-Based SSI Client Testing

```
test/fixtures/
  ├── sessions.js              # (existing)
  ├── ssi-html/
  │   ├── participants-page.html    # saved SSI participants page
  │   ├── search-results.html       # saved search-and-add results
  │   ├── scoring-page.html         # saved scoring form
  │   └── squad-edit-page.html      # saved squad edit form
```

Test SSI parsing functions against real HTML snapshots. When SSI changes their HTML, update the fixture and fix the parser — the test catches the regression immediately.

#### Test Pyramid Target

| Layer | Current | Target | Notes |
|-------|--------:|-------:|-------|
| Unit (SSI client, helpers, engine) | ~10 | ~60 | Biggest gap |
| Route/API (HTTP contract) | ~100 | ~140 | Add scoring, reports, staffing |
| UI unit (hooks, utils, api) | ~55 | ~70 | Good coverage already |
| UI component (render, interaction) | ~9 | ~30 | Add key user flows |
| Integration (live SSI) | ~2 | ~5 | Keep manual/separate |
| **Total** | **~175** | **~305** | |

**Estimated runtime at target:** ~45-50 s (still under 1 minute).

### 4.4 Time-Dependent Test Fragility

The UI test suite has a failing test (`shared.test.js:379`) that checks `isToday('2026-02-14T23:00:00Z')`. This is a **time-zone-sensitive test** that breaks depending on when/where it runs.

**Fix:** Use `vi.useFakeTimers()` to pin the date in time-dependent tests. Never assert against hardcoded dates without controlling the clock.

---

## 5. Agentic Guidelines Additions

The following rules should be added to `AGENTS.md` and `.github/copilot-instructions.md`:

### 5.1 File Size Limits

```markdown
## File Size Discipline

- **Hard limit:** No source file should exceed 500 lines. If a file approaches this limit,
  split it before adding more code.
- **Soft target:** Aim for <300 lines per file.
- **Route files:** Each route file should contain only HTTP handler logic (validation,
  response formatting). Extract business logic into `lib/services/` or `lib/` modules.
- **UI components:** Each component file should contain at most one exported component
  and its tightly-coupled helpers. Extract sub-components into separate files when they
  exceed ~100 lines.
```

### 5.2 SSI Client Module Boundaries

```markdown
## SSI Client Architecture

- The SSI client library (`lib/ssi-core/`) is split by domain:
  `graphql.js`, `scoring.js`, `participants.js`, `management.js`, `http-helpers.js`.
- New SSI integration functions go into the appropriate domain module.
- Route files should import from the specific domain module, not from the barrel
  `index.js`, to keep dependency graphs narrow.
- The backward-compat shim `lib/ssi-client.js` is deprecated. Do not add new imports
  from it.
```

### 5.3 Test Requirements for Changes

```markdown
## Test Requirements

- **New endpoints:** Must include route-level tests (HTTP contract: status codes,
  response shape, validation errors, auth checks).
- **New SSI client functions:** Must include unit tests with HTML fixture files
  for any scraping logic.
- **Bug fixes:** Must include a regression test that fails without the fix.
- **Refactors:** Must not reduce test count. Run `npm test` in both `scoring-proxy/`
  and `scoring-ui/` before committing.
- **Time-dependent tests:** Must use `vi.useFakeTimers()` to pin the clock.
  Never hardcode dates that will expire.
```

### 5.4 Merge Conflict Prevention

```markdown
## Merge Conflict Prevention

- Before starting work, check if the target files are being modified in other
  active branches. Prefer working in files that are not concurrently edited.
- When adding a new endpoint, create a new route file or service module rather
  than appending to an existing large route file.
- When adding SSI integration, add to the appropriate domain module in
  `lib/ssi-core/`, not to the monolithic `client.js`.
- Keep commits small and focused. One logical change per commit.
```

### 5.5 UI Component Guidelines

```markdown
## UI Component Guidelines

- Use the `useAuthenticatedPage` hook for pages that require login.
  Do not duplicate auth/session state boilerplate.
- Extract sub-components when they exceed ~100 lines or when they have
  independent state.
- Shared UI primitives go in `components/shared.jsx`. Page-specific helpers
  stay in the page's directory.
```

---

## 6. Suggested Refactoring Roadmap

| Phase | Work | Effort | Impact |
|-------|------|--------|--------|
| **Phase 1** | Split `ssi-core/client.js` into domain modules | 2-3 h | High — eliminates #1 conflict hotspot |
| **Phase 2** | Add SSI client unit tests with HTML fixtures | 3-4 h | High — catches SSI HTML changes |
| **Phase 3** | Extract management route logic into service layer | 2-3 h | Medium — reduces route file size |
| **Phase 4** | Add missing route tests (scoring, reports, staffing) | 3-4 h | Medium — closes coverage gaps |
| **Phase 5** | Extract `useAuthenticatedPage` hook, split ManagePage | 2-3 h | Medium — reduces UI duplication |
| **Phase 6** | Fix time-dependent UI test | 0.5 h | Low — prevents CI flakiness |

**Total estimated effort:** ~15 hours across 6 phases.

---

## 7. Summary

**Strengths:**
- Clean dependency injection pattern for routes (factory functions)
- Good test coverage for session management and auth
- Centralized logging via `LOG_LEVEL`
- Well-documented (design docs, debug guides, flow diagrams)

**Key Risks:**
- `ssi-core/client.js` (1 482 lines, 29 functions) is the #1 merge conflict and maintenance risk
- `ManagePage.jsx` (959 lines) and `App.jsx` (644 lines) are UI conflict hotspots
- SSI scraping logic has almost no tests — HTML changes will break silently
- Staffing, scoring, and reports routes have zero test coverage

**Top 3 Actions:**
1. Split `ssi-core/client.js` by domain
2. Add fixture-based SSI client tests
3. Add file size limits to agentic guidelines

---

## 8. Target Architecture (v7.5+)

### 8.1 Architectural Vision

**Modular Monolith** - Single deployment with enforced module boundaries. This provides simplicity while enabling future microservice extraction when multi-tenancy is needed.

### 8.2 Module Structure

```
┌─────────────────────────────────────────┐
│           Modular Monolith              │
├─────────────────────────────────────────┤
│ Presentation Layer                      │
│ ├── React components (feature modules)  │
│ └── Shared UI library                   │
├─────────────────────────────────────────┤
│ Application Layer                       │
│ ├── Routes (thin dispatchers)           │
│ ├── Services (business logic)           │
│ └── Error handling middleware           │
├─────────────────────────────────────────┤
│ Domain Layer                            │
│ ├── SSI Core (split by domain)          │
│ │   ├── graphql.js                      │
│ │   ├── scoring.js                      │
│ │   ├── participants.js                 │
│ │   ├── management.js                   │
│ │   └── http-helpers.js                 │
│ └── Domain services                     │
├─────────────────────────────────────────┤
│ Infrastructure Layer                    │
│ ├── Session store (Memory/Redis)        │
│ ├── Logger                              │
│ └── Error classes                       │
└─────────────────────────────────────────┘
```

### 8.3 Module Boundaries

#### Import Hierarchy (Enforced by ESLint)
```javascript
1. Routes may import: 
   - Their domain module from ssi-core/
   - Their service module from lib/services/
   - Shared utilities (logger, errors)

2. Services may import:
   - Their domain module from ssi-core/
   - Other services (if absolutely necessary)
   - Shared utilities

3. Domain modules (ssi-core/) may import:
   - http-helpers.js
   - Nothing else from outside ssi-core/

4. UI Components may import:
   - Their feature's hooks/components
   - Shared UI components
   - API client (api.js)
```

#### Anti-Patterns (Forbidden)
```javascript
// Forbidden - creates hidden coupling
import * from '../lib/ssi-core/'

// Forbidden - cross-domain imports
import { ssiGetScoringPage } from '../lib/ssi-core/participants.js'

// Allowed - domain-specific import
import { ssiGetScoringPage } from '../lib/ssi-core/scoring.js'
```

### 8.4 API Versioning Strategy

- **Current**: `/api/v1/` for all endpoints
- **Future**: `/api/v2/{discipline}/` for discipline-specific APIs
- **Backward compatibility**: Maintained during transition periods

### 8.5 Error Handling Pattern

Centralized error handling with:
- Custom error classes (`AppError`, `ValidationError`, etc.)
- Error middleware for consistent responses
- Operational vs programming error distinction
- Request context enhancement (userId, requestId)

### 8.6 Service Layer Pattern

Routes become thin dispatchers:
```javascript
// Route - thin dispatcher
app.get('/api/cups', requireAuth('scoring'), asyncHandler(async (req, res) => {
  const cups = await scoringService.searchCups(...)
  res.json({ cups })
}))

// Service - pure business logic
async function searchCups(search, session, graphqlWithRefresh) {
  // Business logic here
}
```

### 8.7 Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| SSI Core Domain Split | Complete (v7.4) | 5 domain modules created |
| Service Layer | In Progress (v7.5) | scoring-service.js done |
| Error Handling | Complete (v7.5) | Centralized middleware |
| API Versioning | Complete (v7.5) | `/api/v1/` paths active |
| Module Boundaries | Complete (v7.5) | ESLint rules enforced |
| UI Module Split | Planned | Future release |

### 8.8 Future Considerations

1. **Redis Sessions** (v10/11): Move from in-memory to Redis
2. **Multi-tenancy**: When needed, extract modules to microservices
3. **Background Jobs**: Queue system for async operations
4. **Discipline APIs**: Version 2 with discipline-specific paths
