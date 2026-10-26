# Software Architecture Review

**Date:** 2026-10-26 (updated for Releases 8.0 and 9.0)
**Scope:** `scoring-proxy/` (Express backend) and `scoring-ui/` (React frontend)
**Target Architecture:** Modular Monolith with clear module boundaries

---

## 1. Codebase Snapshot

### 1.1 Backend (`scoring-proxy/`)

| File | Lines | Role |
|------|------:|------|
| `lib/ssi-core/participants.js` | 1 081 | Participant domain implementation |
| `server.js` | 499 | Express bootstrap, middleware, route mounting |
| `routes/management.js` | 542 | Cup management endpoints |
| `lib/services/cup-manage.js` | 453 | Cup management service |
| `routes/auth-v7.js` | 451 | Authentication routes |
| `lib/services/staffing-service.js` | 342 | Staffing business logic |
| `routes/registration.js` | 331 | Public self-registration |
| `lib/ssi-core/graphql.js` | 304 | GraphQL and authentication |
| `lib/ssi-core/management.js` | 304 | SSI management domain |
| `routes/scoring.js` | 306 | Score entry endpoints |
| `lib/ssi-core/http-helpers.js` | 116 | SSI HTTP helpers |
| `lib/ssi-core/scoring.js` | 85 | SSI scoring domain |
| `lib/ssi-core/client.js` | 30 | Compatibility re-export shim |

### 1.2 Frontend (`scoring-ui/src/`)

| File | Lines | Role |
|------|------:|------|
| `App.jsx` | 621 | Mobile scoring app |
| `components/SummaryReportPage.jsx` | 526 | Summary report builder |
| `components/StaffingPage.jsx` | 503 | Staff management UI |
| `TabletApp.jsx` | 509 | Release 8.0 tablet app shell |
| `components/TabletScoringView.jsx` | 478 | Release 8.0 tablet scoring view |
| `components/ReportPage.jsx` | 487 | Detailed report page |
| `components/RegisterPage.jsx` | 453 | Self-registration UI |
| `components/ManagePage.jsx` | 260 | Cup management UI |
| `api.js` | 391 | API client |
| `i18n.js` | 334 | Finnish/English translations |
| `components/shared.jsx` | 230 | Shared UI components |

Release 9.0 inventory page files are listed in §1.3; they are not present in this
checkout, so no current line counts are reported for them.

### 1.3 Release Architecture

- **Release 8.0 — Tablet Scoring UI:** `TabletApp.jsx` provides the tablet
  application shell and `components/TabletScoringView.jsx` the scoring view.
- **Release 9.0 — Gun and ammunition inventory:** adds `GunsPage.jsx` and
  `AmmoPage.jsx` in the UI, backed by `routes/guns.js`,
  `lib/services/gun-inventory-service.js`, and
  `lib/services/ammo-inventory-service.js`. The Render service uses a persistent
  disk mounted at `/var/data` for inventory data.

### 1.4 Tests

| Suite | Test files | Execution |
|-------|-----------:|-----------|
| `scoring-proxy` (vitest) | 20 | automated |
| `scoring-ui` (vitest/jsdom) | 10 | automated |
| Live SSI tests | — | excluded; manual |

---

## 2. Maintainability Analysis

### 2.1 God Files — High Merge-Conflict Risk

The top merge-conflict hotspots are files where multiple features converge:

| File | Lines | Why it's a problem |
|------|------:|-------------------|
| `ssi-core/participants.js` | 1 081 | Largest SSI domain module; participant logic is no longer in `client.js`. |
| `routes/management.js` | 542 | Cup management routes; some business logic is extracted to `cup-manage.js`. |
| `App.jsx` | 621 | Mobile scoring flow remains a large component. |
| `components/StaffingPage.jsx` | 503 | Slightly above the 500-line guideline. |
| `TabletApp.jsx` | 509 | Tablet application shell. |
| `server.js` | 499 | Bootstrap, middleware, and route mounting. |

**Impact:** SSI domain modules are separated, but the participant module and larger
routes/components remain potential merge-conflict hotspots.

### 2.2 Coupling Patterns

Routes and services use domain-specific SSI modules. Implementations now live in
`graphql.js`, `scoring.js`, `participants.js`, and `management.js`; `client.js`
remains only as a compatibility re-export shim.

### 2.3 Pattern Duplication (UI)

Multiple page components repeat the same pattern:
1. `useRememberMe` hook
2. `authed` / `view` / `loading` / `error` / `sessionExpiredMessage` state
3. Login → content view transition
4. Session expiry detection and re-login flow

This was originally duplicated in 5 pages. Three have been migrated to `useAuthenticatedPage` hook (v7.4, RFR6): `ManagePage`, `SummaryReportPage`, `ReportPage`. Remaining with duplicated boilerplate: `StaffingPage`, `App` (scoring).

---

## 3. Recommendations — Maintainability & Merge Conflicts

### 3.1 SSI Core Domain Split (COMPLETE)

Complete: SSI implementations have been moved into domain modules. The 30-line
`client.js` remains as a compatibility re-export shim; new code should import the
domain module directly.

Current domain structure:
```
lib/ssi-core/
  ├── graphql.js          # GraphQL and authentication (304 lines)
  ├── scoring.js          # Scoring operations (85 lines)
  ├── participants.js     # Participant operations (1 081 lines)
  ├── management.js       # Match management and staffing (304 lines)
  ├── http-helpers.js     # Shared HTTP helpers (116 lines)
  ├── constants.js        # SSI constants (10 lines)
  ├── index.js            # Domain exports (18 lines)
  └── client.js           # Compatibility re-exports (30 lines)
```

**Benefit:** Each route file only touches its domain module. Parallel work on scoring vs. management vs. staffing won't conflict in the SSI layer.

**Compatibility:** Keep `index.js` and `client.js` exports for existing imports;
new code should import from the specific domain module.

### 3.2 Continue Service Layer Extraction (MEDIUM PRIORITY)

`management.js` is now 542 lines, with business logic in `cup-manage.js`.
Staffing and registration also have dedicated services; their routes are 109 and
331 lines respectively. Continue extracting business logic from any remaining
large route handlers.

```
routes/staffing.js          → thin handlers (validation, response)
lib/services/staffing-service.js → signup(), resign(), syncFromSSI(), etc.
```

**Benefit:** Route files become short dispatchers. Business logic is independently testable without HTTP mocking.

### 3.3 Migrate Remaining Pages to `useAuthenticatedPage` Hook (LOW PRIORITY)

`useAuthenticatedPage` hook was extracted (v7.4, RFR6) and migrated to `ReportPage`, `SummaryReportPage`, `ManagePage`. Remaining pages with duplicated auth boilerplate: `StaffingPage`, `App.jsx` (scoring).

**Benefit:** Eliminates ~50 lines of boilerplate per migrated page. Session handling changes only need one edit.

### 3.4 Split Remaining Large UI Components (MEDIUM PRIORITY)

`ManagePage` sub-components were extracted (v7.4, RFR7): `SquadCard`, `ShooterActions`, `SquadPickerSheet`, `ActionButton`, `SectionHeader` now in `components/manage/`.

Remaining oversized UI files include `App.jsx` (621 lines), `SummaryReportPage.jsx`
(526 lines), `StaffingPage.jsx` (503 lines), and `TabletApp.jsx` (509 lines).

**Benefit:** Reduces merge conflicts and makes scoring flow phases independently editable.

### 3.5 Remove Deprecated `ssi-client.js` Compat Shim (LOW PRIORITY)

Routes now import from domain-specific modules. The `lib/ssi-client.js` compat
shim remains for any external scripts and can be removed once no imports
reference it.

---

## 4. Test Coverage & Strategy

### 4.1 Historical Coverage Assessment

The detailed coverage counts below are from the earlier review and were not
re-audited for this update.

| Area | Coverage | Notes |
|------|----------|-------|
| **Management routes** | ✅ Good | 28 tests covering all 9 endpoints, error paths, edge cases |
| **Registration routes** | ✅ Good | 12 tests covering captcha, validation, happy/error paths |
| **Session store** | ✅ Good | 12 tests for Redis/memory store, TTL, cleanup |
| **Auth middleware** | ✅ Good | 15 tests for V7 auth, scopes, expiry, security |
| **Session security** | ✅ Good | 7 tests for cookie security, CSRF |
| **Session compat** | ✅ Good | 4 tests for backward compatibility |
| **Impersonation** | ✅ Good | 6 tests |
| **SSI core client** | ⚠️ Partial | 2 test files, ~28 tests (cookie parsing + fixture-based scraping) |
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

1. **SSI core** — Fixture-based scraping tests exist; GraphQL integration coverage
   was not assessed in this review.
2. **Staffing routes + engine** — Route handlers untested. Engine logic untested.
3. **Scoring routes** — No route-level tests (service layer has 12 unit tests).
4. **Reports routes** — No tests at all.
5. **Auth-v7 routes** — No route-level tests.

### 4.3 Test Strategy Recommendations

#### Keep Test Runs Fast (<60 seconds)

The previous review recorded 413 tests in ~35 s. Re-run the suites to establish
the current baseline before using that number for planning:

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
| Unit (SSI client, helpers, engine) | ~60 | ~80 | Good progress, GraphQL functions still untested |
| Route/API (HTTP contract) | ~100 | ~160 | Add scoring, reports, staffing, auth |
| UI unit (hooks, utils, api) | ~100 | ~110 | Good coverage |
| UI component (render, interaction) | ~33 | ~50 | Add key user flows |
| Integration (live SSI) | ~2 | ~5 | Keep manual/separate |
| **Total** | **~295** | **~405** | |

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

| Phase | Work | Status | Effort | Impact |
|-------|------|--------|--------|--------|
| ~~Phase 1~~ | ~~Move `ssi-core/client.js` implementations into domain modules~~ | ✅ Complete | — | — |
| ~~Phase 2~~ | ~~Add SSI client unit tests with HTML fixtures~~ | ✅ v7.4 (RFR2) | — | — |
| ~~Phase 3~~ | ~~Extract management route logic into `cup-manage.js`~~ | ✅ v7.4 (RFR4) | — | — |
| ~~Phase 4~~ | ~~Extract `useAuthenticatedPage` hook, split ManagePage~~ | ✅ v7.4 (RFR6-7) | — | — |
| **Phase 6** | Add missing route tests (scoring, reports, staffing, auth) | Pending | 3-4 h | Medium — closes coverage gaps |
| **Phase 7** | Continue service layer extraction (staffing, registration) | Pending | 2-3 h | Medium — reduces route file size |
| **Phase 8** | Split remaining large UI components, starting with `App.jsx` | Pending | 2-3 h | Medium — reduces UI merge conflicts |
| **Phase 9** | Fix time-dependent UI test | Pending | 0.5 h | Low — prevents CI flakiness |

**Completed:** Phases 1-4 (~10 h of original plan), including the SSI domain
implementation split.
**Remaining estimated effort:** ~8 hours across 4 phases.

---

## 7. Summary

**Strengths:**
- Clean dependency injection pattern for routes (stateless factory functions)
- Good test coverage for session management and auth (per the earlier review)
- Centralized error handling with `AppError` hierarchy and `errorHandler` middleware
- Centralized logging via `LOG_LEVEL` — all routes use `log.*` (no `console.*` in routes)
- API versioning deployed (`/api/v1/` primary, `/api/` legacy with deprecation headers)
- Service layer pattern established (`scoring-service.js`, `cup-manage.js`)
- Well-documented (design docs, debug guides, flow diagrams)

**Key Risks:**
- `ssi-core/participants.js` (1 081 lines) is the largest SSI domain module.
- `App.jsx` (621 lines), `SummaryReportPage.jsx` (526 lines), and `TabletApp.jsx`
  (509 lines) remain above the 500-line guideline.
- Staffing, scoring, reports, and auth-v7 routes have zero test coverage
- SSI GraphQL integration functions remain untested (scraping has 28 fixture-based tests)

**Top 3 Actions:**
1. Add route tests for scoring, reports, staffing, and auth-v7.
2. Split `App.jsx` into state-machine phases.
3. Continue extracting service logic from large routes.

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
│ │   ├── http-helpers.js                  │
│ │   └── client.js (compatibility shim)   │
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
| SSI Core Domain Split | Complete | Implementations live in domain modules; `client.js` is a compatibility re-export shim |
| Service Layer | In Progress | Scoring, cup management, staffing, and registration services exist |
| Error Handling | Complete | Centralized middleware handles route errors |
| API Versioning | Complete | `/api/v1/` paths active, legacy aliases with deprecation |
| Route Logging | Complete | Routes use structured logging |
| Module Boundaries | Partial | Domain imports are used; ESLint boundary rules are not configured |
| UI Module Split | In Progress | Manage sub-components and tablet UI are split; several files remain over 500 lines |
| UI Hooks | Complete (v7.4) | `useAuthenticatedPage`, `useRememberMe` extracted |

### 8.8 SSI GraphQL Constraints

- Send the mandatory `x-api-key` header on every GraphQL request.
- Do not issue parallel query bursts to SSI; sequence requests and avoid
  `Promise.all` for batches of SSI GraphQL queries.
- Do not select deprecated `scorecards` or `scorecards_count` fields on
  `EventInterface` or `CompetitorInterface`. Use
  `competitor_scorecards()` / `competitor_scorecards_count()`, or query
  `StageInterface.scorecards` on demand.

### 8.9 Future Considerations

1. **ESLint module boundary rules** — currently aspirational, not enforced
2. **Split `App.jsx`** — extract state machine phases into sub-components
3. **Multi-tenancy**: When needed, extract modules to microservices
4. **Background Jobs**: Queue system for async operations
5. **Discipline APIs**: Version 2 with discipline-specific paths
