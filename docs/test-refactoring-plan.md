# Test Refactoring Plan

**Purpose:** Establish comprehensive test coverage after the Phase 3 route modularization (PR #6), define test technology stack, prioritize implementation, and set up reporting.

**Last Updated:** 2026-02-08

---

## 1. Current State

### Existing Tests

| File | Framework | Type | Lines | What It Tests |
|------|-----------|------|-------|---------------|
| `scoring-proxy/test/registration.test.js` | Vitest | Unit/Integration | 347 | Captcha, verify, submit validation, rate limiting |
| `scoring-proxy/test/proxy.test.js` | node:test | Live integration | 240 | Auth, cups, cup detail, match detail (requires running server) |
| `scoring-ui/src/test/api.test.js` | Vitest | Unit | 361 | Data transformers, API client (fetch mocked) |
| `scoring-ui/src/test/components.test.jsx` | Vitest + RTL | Component | 230 | LoginScreen, CupSearch, MatchPicker, SquadPicker, ShooterPicker |
| `scoring-ui/src/test/register-api.test.js` | Vitest | Unit | 282 | Registration API client (fetch mocked) |
| `scoring-ui/src/test/persistence.test.js` | Vitest | Unit | 131 | localStorage read/write/clear |
| `test-harness/Test-RegistrationE2E.ps1` | PowerShell | E2E | 205 | Registration flow against live server |

### Existing CI

- **GitHub Actions** (`ci-deploy.yml`): runs `npm test` in both `scoring-ui` and `scoring-proxy` on PRs to `main`
- `proxy.test.js` is **excluded** from Vitest (requires live server + credentials)

### Coverage Gaps

| Route Module | Unit Tests | Integration Tests | E2E Tests |
|---|---|---|---|
| `routes/auth.js` | ❌ | ✅ proxy.test.js | ❌ |
| `routes/scoring.js` | ❌ | ✅ proxy.test.js (partial) | ❌ |
| `routes/management.js` | ❌ | ❌ | ❌ |
| `routes/registration.js` | ✅ registration.test.js | ❌ | ✅ Test-RegistrationE2E.ps1 |
| `routes/reports.js` | ❌ | ❌ | ❌ |
| `lib/ssi-core/client.js` | ❌ | ❌ | ❌ |
| `lib/ssi-core/constants.js` | ❌ | ❌ | — |
| `server.js` (middleware/mounting) | ❌ | ❌ | ❌ |

| UI Component | Tests |
|---|---|
| LoginScreen | ✅ |
| CupSearch | ✅ |
| MatchPicker, SquadPicker, ShooterPicker | ✅ |
| ScoringForm | ❌ |
| RegisterPage | ❌ |
| ManagePage | ❌ |
| ReportPage | ❌ |
| SummaryReportPage | ❌ |
| HomePage | ❌ |

### Known Issues

1. **`registration.test.js` imports from `server.js`** — works but tightly couples the test to the monolith entry point rather than the route module
2. **`proxy.test.js` uses `node:test`** — different framework from the rest (Vitest), excluded from CI
3. **No coverage reporting** configured anywhere
4. **No browser E2E tests** — only PowerShell scripts against the API

---

## 2. Target Coverage

### Coverage Targets

| Layer | Target | Rationale |
|---|---|---|
| **Backend route modules** | 80% line coverage | Core business logic, high risk |
| **Backend SSI client** | 60% line coverage | External integration, hard to mock fully |
| **Frontend API clients** | 90% line coverage | Already mostly covered, easy to extend |
| **Frontend components** | 70% line coverage | New pages need tests, existing pages are covered |
| **E2E critical paths** | 5 key flows | Registration, scoring, management, reports, summary |

### Definition of "Tested"

A module is considered tested when:
- Happy path works
- Error/edge cases handled (invalid input, auth failure, network error)
- No external service calls in unit tests (SSI mocked)
- Tests run in CI without credentials or live services

---

## 3. Test Technology Stack

### Recommended Stack

| Layer | Technology | Reason |
|---|---|---|
| **Unit & Integration (backend)** | **Vitest** | Already in use, fast, ESM-native, same as frontend |
| **Unit & Component (frontend)** | **Vitest + React Testing Library** | Already in use, well-established |
| **HTTP mocking (backend)** | **msw (Mock Service Worker) v2** | Intercepts fetch at network level, works with ESM |
| **E2E (browser)** | **Playwright** | Cross-browser, reliable, built-in assertions, good Vitest integration |
| **Coverage** | **Vitest c8/istanbul** | Built-in, zero config |
| **Test reporting** | **vitest-junit-reporter** + GitHub Actions summary | CI-native, artifact-based |

### Why Not...

| Alternative | Reason to Skip |
|---|---|
| Jest | CJS-centric, ESM support is fragile; Vitest already works |
| Cypress | Slower than Playwright, heavier, no multi-browser |
| Supertest | Vitest + direct `app.listen(0)` pattern already works (see `registration.test.js`) |
| node:test (proxy.test.js) | Replace with Vitest for consistency; move live-server tests to E2E |

### Migration: `proxy.test.js`

`proxy.test.js` currently uses `node:test` and requires a live server + real credentials. Recommended migration:

1. **Extract mockable tests** → new Vitest files per route (mock SSI calls with msw)
2. **Keep live integration tests** → move to `test-harness/` or a separate `test:e2e` script
3. **Remove the vitest.config.js exclusion** once migrated

---

## 4. Test Areas — Detailed

### 4.1 Backend: Route Module Tests (NEW)

Each route module gets its own test file. Pattern: import the `create*Router` factory, mount it on a test Express app, mock SSI calls with msw.

```
scoring-proxy/test/
├── routes/
│   ├── auth.test.js           # login, status, logout
│   ├── scoring.test.js        # cups, cup/:id, match/:id, competitor/:id, score
│   ├── management.test.js     # cup/:id overview, assign-squad, fix-squad, add-to-cup
│   ├── registration.test.js   # (migrate from test/registration.test.js)
│   └── reports.test.js        # summary, matches report
├── lib/
│   └── ssi-core.test.js       # GraphQL client, cookie helpers, login, score submit
└── server.test.js             # middleware mounting, health check, SPA fallback
```

**Test pattern for route modules:**

```javascript
import { createAuthRouter } from '../../routes/auth.js'
import express from 'express'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Mock SSI GraphQL
const ssiServer = setupServer(
  http.post('https://shootnscoreit.com/graphql/', () => {
    return HttpResponse.json({ data: { token_auth: { token: { token: 'mock' } } } })
  })
)

// Mount router on test app
const app = express()
app.use(express.json())
const router = createAuthRouter({ sessions, getSession, ... })
app.use('/api/auth', router)

// Test against the app
const resp = await fetch(`http://localhost:${port}/api/auth/login`, { ... })
```

### 4.2 Backend: SSI Core Client Tests (NEW)

Test `lib/ssi-core/client.js` functions with msw intercepting fetch to `shootnscoreit.com`:

| Function | Test Cases |
|---|---|
| `ssiGraphQL` | Success, HTTP error, GraphQL error, JWT header sent |
| `ssiRefreshJWT` | Success, failure |
| `ssiLogin` | Success (302 redirect), invalid credentials, CSRF fallback |
| `ssiGetScoringPage` | Returns CSRF token + form action |
| `ssiSubmitScore` | Success (302), validation error (200 with errorlist) |
| `ssiSearchAndAddParticipant` | Found + registered, not found, already registered |
| `ssiFindCompetitorInMatch` | Found, not found |
| `ssiGetEventStaff` | Parses staff table HTML |
| `parseCookies` / `formatCookies` | Various cookie formats |

### 4.3 Frontend: Missing Component Tests (NEW)

| Component | Key Test Cases |
|---|---|
| `RegisterPage` | Step flow (captcha → cups → squad → submit), error display, progress stream |
| `ManagePage` | Squad overview, unsquadded list, assign/fix actions |
| `ReportPage` | Match selection, report generation, CSV export |
| `SummaryReportPage` | Match selection, summary display, drill-down, CSV export |
| `HomePage` | Navigation links render, routes work |
| `ScoringForm` | Score input, zone buttons, submit, validation |

### 4.4 E2E: Browser Tests (NEW)

Playwright tests against a running local server. **Do not use real SSI credentials in CI** — use msw to mock SSI at the server level, or run E2E only in manual/nightly jobs.

| Flow | Steps |
|---|---|
| **Login + Scoring** | Login → search cups → select cup → select match → select squad → select shooter → enter scores → submit |
| **Registration** | Captcha → verify → select cup → select squad → submit → confirmation |
| **Management** | Login → search cups → manage → view squads → assign squad |
| **Reports** | Login → search matches → select → generate report → verify data → export CSV |
| **Summary Report** | Login → search → select → generate summary → drill-down → export CSV |

---

## 5. Implementation Priority

### Phase 1: Post-Refactoring Regression (HIGH — do first) 

**Goal:** Verify the refactored route modules work identically to the monolith.

| # | Task | Effort | Files |
|---|---|---|---|
| 1.1 | Add msw to scoring-proxy devDependencies | 5 min | `package.json` |
| 1.2 | Create `test/routes/auth.test.js` | 2h | Login, status, logout with mocked SSI |
| 1.3 | Create `test/routes/scoring.test.js` | 3h | Cups, cup detail, match detail, score submit |
| 1.4 | Migrate `test/registration.test.js` → `test/routes/registration.test.js` | 1h | Update imports, same assertions |
| 1.5 | Create `test/routes/reports.test.js` | 2h | Summary + matches report with mocked SSI |
| 1.6 | Create `test/routes/management.test.js` | 2h | Squad overview, assign, fix, add-to-cup |
| 1.7 | Create `test/server.test.js` | 1h | Health check, SPA fallback, middleware |
| 1.8 | Configure coverage in vitest.config.js | 15 min | Add `coverage` config |
| 1.9 | Update CI to report coverage | 30 min | `ci-deploy.yml` |

**Estimated total: ~12 hours**

### Phase 2: SSI Client Isolation (MEDIUM)

**Goal:** Test the SSI web scraping layer independently so route tests can be simpler.

| # | Task | Effort |
|---|---|---|
| 2.1 | Create `test/lib/ssi-core.test.js` | 4h |
| 2.2 | Extract `parseCookies`/`formatCookies` as named exports for testability | 30 min |
| 2.3 | Add HTML fixtures for staff page, scoring page, login page parsing | 1h |

**Estimated total: ~6 hours**

### Phase 3: Frontend Component Tests (MEDIUM)

**Goal:** Cover the untested UI pages.

| # | Task | Effort |
|---|---|---|
| 3.1 | `ScoringForm.test.jsx` | 3h |
| 3.2 | `RegisterPage.test.jsx` | 3h |
| 3.3 | `ManagePage.test.jsx` | 2h |
| 3.4 | `ReportPage.test.jsx` | 2h |
| 3.5 | `SummaryReportPage.test.jsx` | 2h |
| 3.6 | `HomePage.test.jsx` | 30 min |

**Estimated total: ~13 hours**

### Phase 4: E2E Browser Tests (LOW — nice to have)

**Goal:** Full user journey tests with Playwright.

| # | Task | Effort |
|---|---|---|
| 4.1 | Add Playwright to project | 30 min |
| 4.2 | Create test fixtures (mock SSI server for E2E) | 3h |
| 4.3 | Scoring E2E flow | 3h |
| 4.4 | Registration E2E flow | 2h |
| 4.5 | Management E2E flow | 2h |
| 4.6 | Add `npm run test:e2e` script | 15 min |
| 4.7 | Optional: CI nightly E2E job | 1h |

**Estimated total: ~12 hours**

---

## 6. Test Reporting

### Local Development

```bash
# Run all unit/integration tests with coverage
cd scoring-proxy && npx vitest run --coverage
cd scoring-ui && npx vitest run --coverage

# Watch mode during development
cd scoring-proxy && npx vitest --coverage
```

### Vitest Coverage Configuration

Add to `scoring-proxy/vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['routes/**', 'lib/**', 'server.js'],
      exclude: ['node_modules', 'test/**'],
      thresholds: {
        lines: 60,      // start low, increase as tests are added
        branches: 50,
        functions: 60,
      },
    },
  },
})
```

Add to `scoring-ui/vite.config.js` (test section):

```javascript
test: {
  environment: 'jsdom',
  coverage: {
    provider: 'v8',
    reporter: ['text', 'text-summary', 'html', 'json-summary'],
    reportsDirectory: './coverage',
    include: ['src/**'],
    exclude: ['src/test/**', 'node_modules'],
    thresholds: {
      lines: 50,
      branches: 40,
      functions: 50,
    },
  },
}
```

### CI Reporting

Update `.github/workflows/ci-deploy.yml`:

```yaml
- name: Run proxy tests with coverage
  run: npx vitest run --coverage
  working-directory: scoring-proxy

- name: Run UI tests with coverage
  run: npx vitest run --coverage
  working-directory: scoring-ui

- name: Upload coverage reports
  uses: actions/upload-artifact@v4
  with:
    name: coverage-${{ github.run_number }}
    path: |
      scoring-proxy/coverage/
      scoring-ui/coverage/
    retention-days: 30

- name: Coverage summary in PR comment
  if: github.event_name == 'pull_request'
  run: |
    echo "## Test Coverage" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### scoring-proxy" >> $GITHUB_STEP_SUMMARY
    cat scoring-proxy/coverage/coverage-summary.json | jq -r '.total | "Lines: \(.lines.pct)% | Branches: \(.branches.pct)% | Functions: \(.functions.pct)%"' >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### scoring-ui" >> $GITHUB_STEP_SUMMARY
    cat scoring-ui/coverage/coverage-summary.json | jq -r '.total | "Lines: \(.lines.pct)% | Branches: \(.branches.pct)% | Functions: \(.functions.pct)%"' >> $GITHUB_STEP_SUMMARY
```

### JUnit XML for CI Integration (Optional)

For GitHub Actions test summary or Azure DevOps integration:

```bash
npm install -D vitest-junit-reporter
```

```javascript
// vitest.config.js
test: {
  reporters: ['default', 'junit'],
  outputFile: './test-results/junit.xml',
}
```

---

## 7. File Naming & Organization

### Backend Test Structure (Target)

```
scoring-proxy/
├── test/
│   ├── routes/
│   │   ├── auth.test.js
│   │   ├── scoring.test.js
│   │   ├── management.test.js
│   │   ├── registration.test.js
│   │   └── reports.test.js
│   ├── lib/
│   │   └── ssi-core.test.js
│   ├── fixtures/
│   │   ├── ssi-staff-page.html
│   │   ├── ssi-scoring-page.html
│   │   └── ssi-login-page.html
│   ├── helpers/
│   │   └── test-app.js          # shared: create test Express app with mocked deps
│   └── server.test.js
├── vitest.config.js
└── package.json
```

### Frontend Test Structure (Target)

```
scoring-ui/src/test/
├── api.test.js                  # existing
├── register-api.test.js         # existing
├── persistence.test.js          # existing
├── components.test.jsx          # existing (rename to scoring-components.test.jsx?)
├── register-page.test.jsx       # new
├── manage-page.test.jsx         # new
├── report-page.test.jsx         # new
├── summary-report-page.test.jsx # new
├── scoring-form.test.jsx        # new
└── home-page.test.jsx           # new
```

---

## 8. Success Criteria

| Milestone | Criteria | Timeline |
|---|---|---|
| **Phase 1 complete** | All 5 route modules have Vitest tests, coverage ≥60% | Week 1-2 |
| **Phase 2 complete** | SSI client tested in isolation, coverage ≥60% | Week 2-3 |
| **Phase 3 complete** | All UI pages have component tests, coverage ≥50% | Week 3-4 |
| **Phase 4 complete** | 5 Playwright E2E flows pass locally | Week 5-6 |
| **CI green** | All tests + coverage thresholds enforced in CI | Ongoing |
| **No regression** | Refactored routes produce identical API responses | Phase 1 |

---

## Resources

- [Vitest Documentation](https://vitest.dev)
- [MSW v2 Documentation](https://mswjs.io/docs)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Playwright Documentation](https://playwright.dev)
- [Existing AI agent guidelines](ai-agent-guidelines.md)
- [Refactoring plan](refactoring-plan.md)
